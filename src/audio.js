export const AUDIO_FAMILIES = Object.freeze(['rock', 'concrete', 'glass', 'wood']);

const audioLibrary = import.meta.env?.VITE_AUDIO_LIBRARY === 'private' ? 'private' : 'public';
const baseUrl = (import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/');
const audioRoot = `${baseUrl}audio/${audioLibrary === 'private' ? 'private/' : ''}`;
const clipUrl = (folder, family, variant) => `${audioRoot}${folder}/${family}-${String(variant).padStart(2, '0')}.wav`;
const CLIPS = AUDIO_FAMILIES.flatMap(family => [1, 2].flatMap(variant => [
  clipUrl('breaks', family, variant), clipUrl('repair', `hit-${family}`, variant),
]));
const MAX_VOICES = 12;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/**
 * Predecoded material effects, played at their authored pitch. Public builds use
 * original synthesized sounds; an optional private local bank uses recordings.
 * Call unlock() synchronously from a user gesture. Play calls never resume audio
 * or queue events: sounds requested before loading/unlocking are simply dropped.
 */
export function createRockAudio({ onChange = () => {} } = {}) {
  let context, master, limiter, analyser, loadPromise, loadController;
  let muted = false, volume = 0.75, disposed = false, unlocked = false;
  let loading = false, contextError = null, unlockGeneration = 0, pageHidden = false;
  let playCount = 0, lastClip = null, quietContactsUntil = 0;
  let lastContact = -Infinity, lastBreak = -Infinity;
  const buffers = new Map(), failures = new Map(), previousVariants = new Map();
  const voices = new Set(), pieceContacts = new Map(), lastEvents = [];
  const eventCounts = { break: 0, collision: 0, restore: 0 };
  const doc = globalThis.document, page = globalThis.window;
  const backgrounded = () => pageHidden || doc?.hidden === true;

  function getState() {
    const errors = [...failures].map(([url, message]) => ({ url, message }));
    return {
      library: audioLibrary, loaded: buffers.size, expected: CLIPS.length, failed: failures.size,
      error: contextError || errors[0]?.message || null, errors, loading,
      ready: !disposed && buffers.size === CLIPS.length,
      contextState: context?.state || 'uninitialized', unlocked,
      muted, volume, playCount, eventCounts: { ...eventCounts }, lastClip,
      lastEvents: lastEvents.map(event => ({ ...event })), activeVoices: voices.size,
      voiceLimit: MAX_VOICES, backgrounded: backgrounded(), disposed,
    };
  }

  function notify() { onChange(getState()); }

  function getContext() {
    if (disposed) return null;
    if (context) return context;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) {
      contextError = 'Web Audio is unavailable in this browser.';
      return null;
    }
    try {
      context = new AudioContext({ latencyHint: 'interactive' });
      master = context.createGain();
      master.gain.value = muted ? 0 : volume;
      limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -4;
      limiter.knee.value = 3;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.12;
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      limiter.connect(master).connect(analyser).connect(context.destination);
      context.onstatechange = () => {
        // Browser interruptions must not leave old voices queued for a later
        // resume. A fresh gesture is required after losing the running context.
        if (context.state !== 'running') {
          unlocked = false;
          stopVoices();
        }
        if (!disposed) notify();
      };
      contextError = null;
      return context;
    } catch (error) {
      contextError = `Audio initialization failed: ${error.message}`;
      return null;
    }
  }

  function load() {
    if (disposed || buffers.size === CLIPS.length) return Promise.resolve(getState());
    if (loadPromise) return loadPromise;
    const ctx = getContext();
    if (!ctx) { notify(); return Promise.resolve(getState()); }
    loading = true;
    loadController = new AbortController();
    const signal = loadController.signal;
    notify();
    // Failed clips can be retried with load(); already-decoded clips are kept.
    loadPromise = (async () => {
      await Promise.all(CLIPS.filter(url => !buffers.has(url)).map(async url => {
        try {
          const response = await fetch(url, { signal });
          if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
          const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          if (disposed || signal.aborted) return;
          buffers.set(url, buffer);
          failures.delete(url);
        } catch (error) {
          if (disposed || signal.aborted) return;
          failures.set(url, error.message || `Could not decode ${url}`);
        }
        if (!disposed) notify();
      }));
      loading = false;
      loadPromise = null;
      loadController = null;
      if (!disposed) notify();
      return getState();
    })();
    return loadPromise;
  }

  function unlock() {
    if (disposed || muted || backgrounded()) return Promise.resolve(false);
    const ctx = getContext();
    if (!ctx || ctx.state === 'closed') { notify(); return Promise.resolve(false); }
    const generation = ++unlockGeneration;
    // Invoke resume before the first await so this stays inside the gesture.
    let resumed;
    try { resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume(); }
    catch (error) { resumed = Promise.reject(error); }
    return resumed.then(() => {
      if (disposed || muted || backgrounded() || generation !== unlockGeneration) return false;
      unlocked = ctx.state === 'running';
      contextError = null;
      notify();
      return unlocked;
    }).catch(error => {
      if (!disposed && generation === unlockGeneration) {
        unlocked = false;
        contextError = `Audio could not resume: ${error.message}`;
        notify();
      }
      return false;
    });
  }

  function canPlay() {
    return !disposed && !muted && volume > 0 && !backgrounded()
      && unlocked && context?.state === 'running';
  }

  function cleanupVoice(voice) {
    if (!voices.delete(voice)) return;
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
  }

  function stopVoice(voice) {
    try { voice.source.stop(); } catch { /* A source may have just ended. */ }
    cleanupVoice(voice);
  }

  function stopVoices() {
    for (const voice of voices) stopVoice(voice);
  }

  function stop() {
    ++unlockGeneration;
    stopVoices();
    pieceContacts.clear();
    lastContact = lastBreak = -Infinity;
    quietContactsUntil = 0;
    if (!disposed) notify();
  }

  function reserveVoice(priority) {
    if (voices.size < MAX_VOICES) return true;
    let candidate;
    for (const voice of voices) {
      if (!candidate || voice.priority < candidate.priority) candidate = voice;
    }
    if (candidate.priority > priority) return false;
    stopVoice(candidate);
    return true;
  }

  function trackVoice(source, gain, priority) {
    const voice = { source, gain, priority };
    voices.add(voice);
    source.onended = () => {
      cleanupVoice(voice);
      if (!disposed) notify();
    };
    return voice;
  }

  function record(type, family, pieceId, url, variant, gain) {
    playCount++;
    eventCounts[type]++;
    lastClip = url;
    lastEvents.push({
      type, family, pieceId: pieceId ?? null, clip: url, variant, gain,
      playbackRate: 1, time: Number(context.currentTime.toFixed(3)),
    });
    if (lastEvents.length > 20) lastEvents.shift();
    notify();
  }

  function choose(folder, family) {
    const key = `${folder}/${family}`, previous = previousVariants.get(key);
    const preferred = previous ? 3 - previous : 1 + Math.floor(Math.random() * 2);
    // Alternate whenever both recordings loaded; one failed file should not
    // silence the family when its other variant is still usable.
    const variant = buffers.has(clipUrl(folder, family, preferred)) ? preferred : 3 - preferred;
    const url = clipUrl(folder, family, variant);
    return buffers.has(url) ? { key, variant, url } : null;
  }

  function playClip(type, family, pieceId, folder, prefix, gainValue, priority) {
    if (!canPlay() || !AUDIO_FAMILIES.includes(family)) return false;
    const chosen = choose(folder, `${prefix}${family}`);
    if (!chosen || !reserveVoice(priority)) return false;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffers.get(chosen.url);
    source.playbackRate.value = 1;
    source.detune.value = 0;
    gain.gain.value = gainValue;
    source.connect(gain).connect(limiter);
    const voice = trackVoice(source, gain, priority);
    try { source.start(); }
    catch { cleanupVoice(voice); return false; }
    previousVariants.set(chosen.key, chosen.variant);
    record(type, family, pieceId, chosen.url, chosen.variant, gainValue);
    return true;
  }

  function playBreak(family) {
    if (!canPlay() || context.currentTime - lastBreak < 0.08) return false;
    const played = playClip('break', family, null, 'breaks', '', 1, 3);
    if (played) {
      lastBreak = context.currentTime;
      quietContactsUntil = Math.max(quietContactsUntil, context.currentTime + 0.09);
    }
    return played;
  }

  function playCollision(family, strength, pieceId) {
    if (!canPlay()) return false;
    const now = context.currentTime, force = clamp(finite(strength, 0), 0, 1);
    const key = `${family}:${pieceId ?? 'unknown'}`;
    if (force < 0.04 || now < quietContactsUntil || now - lastContact < 0.065
      || now - (pieceContacts.get(key) ?? -Infinity) < 0.095) return false;
    const played = playClip('collision', family, pieceId, 'repair', 'hit-', 0.13 + force * 0.24, 0);
    if (played) {
      lastContact = now;
      pieceContacts.delete(key);
      pieceContacts.set(key, now);
      if (pieceContacts.size > 256) pieceContacts.delete(pieceContacts.keys().next().value);
    }
    return played;
  }

  function playRestore() {
    // Clear impacts and even scheduled chime notes before starting a new reset.
    stop();
    if (!canPlay()) return false;
    const now = context.currentTime, frequencies = [392, 494, 587, 784];
    for (const [index, frequency] of frequencies.entries()) {
      if (!reserveVoice(3)) break;
      const source = context.createOscillator(), gain = context.createGain();
      source.type = 'sine';
      source.frequency.value = frequency;
      const start = now + index * 0.055;
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.06, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      source.connect(gain).connect(limiter);
      trackVoice(source, gain, 3);
      source.start(start);
      source.stop(start + 0.35);
    }
    quietContactsUntil = now + 0.3;
    record('restore', null, null, 'synth:restore', null, 0.06);
    return true;
  }

  function setMuted(value) {
    if (disposed) return;
    muted = Boolean(value);
    if (master) master.gain.value = muted ? 0 : volume;
    if (muted) stop();
    else notify();
  }

  function setVolume(value) {
    if (disposed) return;
    volume = clamp(finite(value, volume), 0, 1);
    if (master) master.gain.value = muted ? 0 : volume;
    if (volume === 0) stop();
    else notify();
  }

  function handleVisibility() {
    if (backgrounded()) {
      unlocked = false;
      stop();
      // No automatic resume on return. unlock() is the only resume call.
      if (context && context.state !== 'closed') void context.suspend().catch(() => {});
    }
    notify();
  }
  function handlePageHide() { pageHidden = true; handleVisibility(); }
  function handlePageShow() { pageHidden = false; handleVisibility(); }
  doc?.addEventListener('visibilitychange', handleVisibility);
  page?.addEventListener('pagehide', handlePageHide);
  page?.addEventListener('pageshow', handlePageShow);

  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;
    unlocked = false;
    loading = false;
    loadController?.abort();
    doc?.removeEventListener('visibilitychange', handleVisibility);
    page?.removeEventListener('pagehide', handlePageHide);
    page?.removeEventListener('pageshow', handlePageShow);
    if (context) {
      context.onstatechange = null;
      if (context.state !== 'closed') void context.close().catch(() => {});
    }
    master?.disconnect();
    limiter?.disconnect();
    analyser?.disconnect();
    buffers.clear();
    previousVariants.clear();
    notify();
  }

  return {
    load, unlock, playBreak, playCollision, playRestore,
    setMuted, setVolume, stop, getState, dispose,
    getAnalyser: () => disposed ? null : analyser || null,
  };
}
