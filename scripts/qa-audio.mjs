import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// A separate Chrome session with its normal user-gesture audio policy. Real UI
// gestures exercise integration; AudioBufferSource instrumentation independently
// verifies successful playback of decoded, non-silent sample data.
const project = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(project, 'output', 'audio');
await fs.mkdir(output, { recursive: true });
const report = { url: process.env.ROCK_LAB_URL || 'http://127.0.0.1:5207/', checks: {}, browserErrors: [], audioRequests: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(45000);
page.on('pageerror', error => report.browserErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.browserErrors.push(message.text()); });
page.on('request', request => { if (/\.(wav|mp3|ogg)(\?|$)/i.test(request.url())) report.audioRequests.push(request.url()); });

function installAudioProbe() {
  window.__audioProbe = { starts: [], stops: [], oscillatorStarts: [], oscillatorStops: [], ended: [], failures: [] };
  const originalStart = AudioBufferSourceNode.prototype.start;
  const originalStop = AudioBufferSourceNode.prototype.stop;
  let id = 0;
  AudioBufferSourceNode.prototype.start = function (...args) {
    const buffer = this.buffer;
    let peak = 0, squared = 0, sampled = 0, nonzero = 0;
    if (buffer) for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const samples = buffer.getChannelData(channel);
      const stride = Math.max(1, Math.floor(samples.length / 8192));
      for (let i = 0; i < samples.length; i += stride) {
        const sample = Math.abs(samples[i]);
        peak = Math.max(peak, sample); squared += sample * sample; sampled++;
        if (sample > .00001) nonzero++;
      }
    }
    try {
      const result = originalStart.apply(this, args);
      this.__audioProbeId = ++id;
      window.__audioProbe.starts.push({ id, at: performance.now(), contextState: this.context.state, duration: buffer?.duration ?? 0, sampleRate: buffer?.sampleRate ?? 0, channels: buffer?.numberOfChannels ?? 0, peak, rms: sampled ? Math.sqrt(squared / sampled) : 0, sampled, nonzero });
      this.addEventListener('ended', () => window.__audioProbe.ended.push({ id: this.__audioProbeId, at: performance.now() }), { once: true });
      return result;
    } catch (error) { window.__audioProbe.failures.push(error.message); throw error; }
  };
  AudioBufferSourceNode.prototype.stop = function (...args) {
    const result = originalStop.apply(this, args);
    window.__audioProbe.stops.push({ id: this.__audioProbeId, at: performance.now() });
    return result;
  };
  const oscillatorStart = OscillatorNode.prototype.start, oscillatorStop = OscillatorNode.prototype.stop;
  OscillatorNode.prototype.start = function (...args) {
    const result = oscillatorStart.apply(this, args);
    this.__audioProbeId = ++id;
    window.__audioProbe.oscillatorStarts.push({ id, at: performance.now(), frequency: this.frequency.value, contextState: this.context.state });
    return result;
  };
  OscillatorNode.prototype.stop = function (...args) {
    const result = oscillatorStop.apply(this, args);
    window.__audioProbe.oscillatorStops.push({ id: this.__audioProbeId, at: performance.now(), scheduled: args[0] ?? null });
    return result;
  };
}
await page.addInitScript(installAudioProbe);

const audioState = () => page.evaluate(() => window.rockLab.audio.getState());
const probeState = () => page.evaluate(() => window.__audioProbe);
const eventCount = (state, type) => state.eventCounts?.[type] ?? 0;
const lastEvent = (state, type) => [...(state.lastEvents ?? [])].reverse().find(event => event.type === type);
async function input(selector, value) {
  await page.locator(selector).evaluate((element, next) => { element.value = String(next); element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
async function selectSurface(surface) {
  await page.locator('#tab-material').click();
  await page.locator('[data-material-target="outer"]').click();
  await page.locator(`[data-material-family="${['glass', 'quartz', 'frozenGlass'].includes(surface) ? 'optical' : 'rock'}"]`).click();
  await page.locator(`[data-surface="${surface}"]`).click();
}
async function selectShape(shape) {
  await page.locator('#tab-shape').click();
  await page.locator(`[data-family="${['block', 'brick', 'sphere'].includes(shape) ? 'primitives' : shape === 'wall' ? 'structures' : 'natural'}"]`).click();
  await page.locator(`[data-shape="${shape}"]`).click();
  await page.waitForFunction(id => window.rockLab.state.shape === id, shape);
  await page.waitForTimeout(130);
}
async function piecePoint() {
  return page.evaluate(() => {
    const lab = window.rockLab, mesh = lab.fracture.getMeshes()[0];
    mesh.updateWorldMatrix(true, false); mesh.geometry.computeBoundingSphere();
    const point = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).project(lab.camera);
    const rect = lab.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  });
}
async function pauseDebris() {
  await page.locator('#tab-fracture').click();
  if (!(await page.evaluate(() => window.rockLab.fracture.getStats().paused))) await page.locator('#fr-pause').click();
}
async function resetDebris() {
  await page.locator('#tab-fracture').click();
  await page.locator('#fr-reset').click();
  await page.waitForFunction(() => window.rockLab.fracture.getStats().fragments === 0);
}
async function tapBreak() {
  const before = await audioState(), point = await piecePoint();
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => window.rockLab.fracture.getStats().fragments > 0 && !window.rockLab.fracture.getStats().busy);
  await page.waitForFunction(count => (window.rockLab.audio.getState().eventCounts.break ?? 0) > count, eventCount(before, 'break'));
  return { before, after: await audioState() };
}

try {
  await page.goto(report.url);
  await page.waitForFunction(() => window.rockLab?.ready && window.rockLab.audio);
  report.initial = await audioState();
  assert.equal(report.initial.playCount, 0, 'Loading the page must not autoplay effects');
  await page.locator('#tab-fracture').click();
  await page.locator('#fr-enabled').check();
  await page.waitForFunction(() => window.rockLab.audio.getState().contextState === 'running');
  await page.waitForFunction(() => window.rockLab.audio.getState().loaded === window.rockLab.audio.getState().expected);
  const loaded = await audioState();
  assert.equal(loaded.expected, 16);
  assert.equal(loaded.loaded, 16);
  if (loaded.muted) await page.locator('#sound-toggle').click();
  report.checks.gestureUnlockAndDecode = { passed: true, initialContext: report.initial.contextState, afterGesture: loaded.contextState, loaded: loaded.loaded, expected: loaded.expected };

  await selectShape('sphere'); await selectSurface('stone');
  await page.locator('#tab-ground').click(); await input('#reflection', 0);
  await page.locator('#tab-fracture').click();
  await page.locator('#sound-settings > summary').click();
  await page.locator('#sfx-family').selectOption('auto');
  await page.locator('#fr-method').selectOption('simple');
  await input('#fr-fragmentCount', 6);
  await page.locator('#fr-enabled').check();
  await page.waitForFunction(() => window.rockLab.fracture?.getStats().enabled && window.rockLab.fracture.getStats().meshes > 0);

  const silentBefore = await audioState(), startsBefore = (await probeState()).starts.length;
  const point = await piecePoint(), cameraBefore = await page.evaluate(() => window.rockLab.camera.position.toArray());
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 88, point.y + 22, { steps: 12 }); await page.mouse.up();
  const miss = await page.evaluate(async () => {
    const lab = window.rockLab, rect = lab.renderer.domElement.getBoundingClientRect();
    // Reuse the app's Three constructor so this check also works on a build.
    const Raycaster = lab.sceneEditor.getTransformControls().getRaycaster().constructor, ray = new Raycaster();
    for (const [u, v] of [[.06, .22], [.08, .75], [.85, .15], [.88, .8]]) {
      ray.setFromCamera({ x: u * 2 - 1, y: 1 - v * 2 }, lab.camera);
      if (!ray.intersectObjects(lab.fracture.getMeshes()).length) return { x: rect.left + u * rect.width, y: rect.top + v * rect.height };
    }
    throw new Error('No verified empty canvas tap point found');
  });
  await page.mouse.click(miss.x, miss.y); await page.waitForTimeout(160);
  assert.notDeepEqual(await page.evaluate(() => window.rockLab.camera.position.toArray()), cameraBefore);
  assert.equal((await audioState()).playCount, silentBefore.playCount);
  assert.equal((await probeState()).starts.length, startsBefore);
  assert.equal(await page.evaluate(() => window.rockLab.fracture.getStats().fragments), 0);
  report.checks.orbitAndMissSilent = { passed: true, cameraMoved: true, sourceStarts: 0, fragments: 0 };

  const rockBreak = await tapBreak();
  assert.equal(lastEvent(rockBreak.after, 'break')?.family, 'rock');
  await page.waitForFunction(count => (window.rockLab.audio.getState().eventCounts.collision ?? 0) > count, eventCount(rockBreak.before, 'collision'), { timeout: 15000 });
  const collided = await audioState();
  assert.equal(lastEvent(collided, 'collision')?.family, 'rock');
  await pauseDebris();
  report.checks.realTapAndPhysicsCollision = { passed: true, breakEvent: lastEvent(rockBreak.after, 'break'), collisionEvent: lastEvent(collided, 'collision'), fracture: await page.evaluate(() => window.rockLab.fracture.getStats()) };
  await page.screenshot({ path: path.join(output, 'fracture-audio.png') });

  const resetBefore = await audioState();
  await resetDebris();
  await page.waitForFunction(count => (window.rockLab.audio.getState().eventCounts.restore ?? 0) > count, eventCount(resetBefore, 'restore'));
  report.checks.resetChime = { passed: true, event: lastEvent(await audioState(), 'restore') };

  const beforeMute = await probeState();
  await page.locator('#sound-toggle').click();
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal((await audioState()).muted, true);
  assert.equal((await audioState()).activeVoices, 0);
  const mutedBefore = await audioState(), mutedStarts = (await probeState()).starts.length;
  await page.locator('#fr-break').click();
  await page.waitForFunction(() => window.rockLab.fracture.getStats().fragments > 0 && !window.rockLab.fracture.getStats().busy);
  await page.waitForTimeout(140);
  assert.equal((await audioState()).playCount, mutedBefore.playCount);
  assert.equal((await probeState()).starts.length, mutedStarts);
  const mutedResetCount = (await audioState()).playCount;
  await resetDebris(); assert.equal((await audioState()).playCount, mutedResetCount);
  const afterMuteProbe = await probeState();
  const stoppedSources = afterMuteProbe.stops.length + afterMuteProbe.oscillatorStops.length - beforeMute.stops.length - beforeMute.oscillatorStops.length;
  assert.ok(stoppedSources > 0, 'Mute must stop a currently playing reset chime');
  report.checks.muteStopsAndSuppresses = { passed: true, stoppedSources, newSourcesWhileMuted: 0, activeVoices: (await audioState()).activeVoices };
  await page.locator('#sound-toggle').click();
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
  await input('#sfx-volume', 0);
  assert.equal(await page.evaluate(() => window.rockLab.audio.playBreak('rock')), false);
  assert.equal((await audioState()).activeVoices, 0);
  await input('#sfx-volume', .23); assert.equal((await audioState()).volume, .23);
  report.checks.volumeControl = { passed: true, zeroVolumeSuppressesPlayback: true, volume: (await audioState()).volume };

  report.checks.families = {};
  for (const fixture of [
    { name: 'automatic-concrete-block', shape: 'block', surface: 'stone', choice: 'auto', expected: 'concrete' },
    { name: 'automatic-glacier-ice', shape: 'sphere', surface: 'ice', choice: 'auto', expected: 'glass' },
    { name: 'automatic-clear-glass', shape: 'sphere', surface: 'glass', choice: 'auto', expected: 'glass' },
    { name: 'wood-override-on-glass', shape: 'sphere', surface: 'glass', choice: 'wood', expected: 'wood' },
    { name: 'rock-override-on-glass', shape: 'sphere', surface: 'glass', choice: 'rock', expected: 'rock' },
  ]) {
    await selectShape(fixture.shape); await selectSurface(fixture.surface);
    await page.locator('#tab-fracture').click(); await page.locator('#sfx-family').selectOption(fixture.choice);
    const broken = await tapBreak(), event = lastEvent(broken.after, 'break');
    assert.equal(event?.family, fixture.expected, fixture.name);
    await pauseDebris(); await resetDebris();
    report.checks.families[fixture.name] = { passed: true, event };
  }

  // Source data and the post-master analyser are independent of app counters.
  // Sample a real bank clip, then mute while it is playing and sample silence.
  report.checks.masterOutput = await page.evaluate(async () => {
    const audio = window.rockLab.audio;
    audio.stop(); audio.setVolume(.5);
    const analyser = audio.getAnalyser();
    if (!analyser) throw new Error('No post-master analyser is available');
    const samples = new Float32Array(analyser.fftSize);
    const measure = async milliseconds => {
      const end = performance.now() + milliseconds;
      let peak = 0, squared = 0, count = 0;
      while (performance.now() < end) {
        await new Promise(resolve => setTimeout(resolve, 12));
        analyser.getFloatTimeDomainData(samples);
        for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); squared += sample * sample; count++; }
      }
      return { peak, rms: Math.sqrt(squared / Math.max(count, 1)), samples: count };
    };
    const started = audio.playBreak('rock');
    const audible = await measure(220);
    audio.setMuted(true);
    await new Promise(resolve => setTimeout(resolve, 100));
    const muted = await measure(120);
    audio.setMuted(false);
    return { started, audible, muted };
  });
  assert.equal(report.checks.masterOutput.started, true);
  assert.ok(report.checks.masterOutput.audible.peak > .001, 'The post-master WebAudio graph must produce audible sample output');
  assert.ok(report.checks.masterOutput.muted.peak < .00001, 'Mute must silence the post-master graph');
  report.checks.masterOutput.passed = true;

  report.checks.variants = {};
  for (const family of ['rock', 'concrete', 'glass', 'wood']) {
    for (const type of ['break', 'collision']) {
      const events = [];
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(180);
        const started = await page.evaluate(({ family, type, i }) => {
          const audio = window.rockLab.audio;
          return type === 'break' ? audio.playBreak(family) : audio.playCollision(family, 1, `qa-${family}-${i}`);
        }, { family, type, i });
        assert.equal(started, true, `${family} ${type} variant must start`);
        events.push(lastEvent(await audioState(), type));
      }
      assert.ok(events.every(event => event.family === family && event.playbackRate === 1));
      assert.notEqual(events[0].clip, events[1].clip, 'Consecutive events must alternate source recordings');
      assert.notEqual(events[1].clip, events[2].clip, 'Consecutive events must alternate source recordings');
      report.checks.variants[`${family}-${type}`] = { passed: true, clips: events.map(event => event.clip), variants: events.map(event => event.variant) };
    }
  }
  await page.locator('#tab-fracture').click();
  await page.locator('#sound-settings').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'desktop-sound-controls.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#sound-settings').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'mobile-sound-controls.png') });
  report.checks.mobileLayout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    toggleWidth: document.querySelector('#sound-toggle').getBoundingClientRect().width,
    volumeWidth: document.querySelector('#sfx-volume').getBoundingClientRect().width,
    familyWidth: document.querySelector('#sfx-family').getBoundingClientRect().width,
  }));
  assert.ok(report.checks.mobileLayout.documentWidth <= report.checks.mobileLayout.viewport, 'Audio UI must not create horizontal page overflow');
  report.checks.mobileLayout.passed = true;

  const probe = await probeState();
  const audible = probe.starts.filter(start => start.duration > .02 && start.peak > .001 && start.nonzero > 20);
  assert.ok(audible.length >= 9, `Expected multiple independently observed non-silent source starts, saw ${audible.length}`);
  assert.ok(audible.every(start => start.contextState === 'running'), 'Audible sources must start in a running AudioContext');
  assert.deepEqual(probe.failures, []);
  report.checks.decodedAudioPlayback = { passed: true, successfulSourceStarts: probe.starts.length, audibleSourceStarts: audible.length, minimumPeak: Math.min(...audible.map(start => start.peak)), minimumRms: Math.min(...audible.map(start => start.rms)) };
  report.audioProbe = probe;
  report.final = await audioState();
  assert.deepEqual(report.browserErrors, []);

  await page.close();
  const edgePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await edgePage.addInitScript(installAudioProbe);
  const edgeErrors = [];
  edgePage.on('pageerror', error => edgeErrors.push(error.message));
  edgePage.on('console', message => { if (message.type() === 'error') edgeErrors.push(message.text()); });
  await edgePage.goto(report.url);
  await edgePage.waitForFunction(() => window.rockLab?.ready && window.rockLab.audio.getState().loaded === 16);
  await edgePage.locator('[data-family="primitives"]').click();
  await edgePage.locator('[data-shape="sphere"]').click();
  await edgePage.locator('#view-lineup').click();
  await edgePage.locator('#tab-fracture').click();
  await edgePage.locator('#fr-method').selectOption('simple');
  await edgePage.locator('#fr-fragmentCount').evaluate(element => { element.value = '6'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  const firstBreakBefore = await edgePage.evaluate(() => ({ audio: window.rockLab.audio.getState(), view: window.rockLab.getStats().viewMode }));
  assert.equal(firstBreakBefore.view, 'lineup');
  assert.equal(firstBreakBefore.audio.contextState, 'suspended');
  assert.equal(firstBreakBefore.audio.unlocked, false);
  assert.equal(firstBreakBefore.audio.playCount, 0);
  await edgePage.locator('#fr-break').click();
  await edgePage.waitForFunction(() => window.rockLab.fracture?.getStats().fragments > 0 && window.rockLab.audio.getState().eventCounts.break > 0);
  const firstBreakAfter = await edgePage.evaluate(() => ({ audio: window.rockLab.audio.getState(), fracture: window.rockLab.fracture.getStats(), view: window.rockLab.getStats().viewMode, probe: window.__audioProbe }));
  assert.equal(firstBreakAfter.view, 'single');
  assert.equal(firstBreakAfter.audio.contextState, 'running');
  assert.equal(lastEvent(firstBreakAfter.audio, 'break')?.family, 'rock');
  assert.ok(firstBreakAfter.probe.starts.some(start => start.contextState === 'running' && start.peak > .001));
  report.checks.firstBreakFromVariations = { passed: true, before: firstBreakBefore, after: { view: firstBreakAfter.view, contextState: firstBreakAfter.audio.contextState, fragments: firstBreakAfter.fracture.fragments, event: lastEvent(firstBreakAfter.audio, 'break'), source: firstBreakAfter.probe.starts[0] } };

  // A real native suspension simulates a foreground context interrupted by the
  // browser. Playback itself must not resume it; the reset click must do so.
  await edgePage.evaluate(async () => { window.rockLab.audio.stop(); await window.rockLab.audio.getAnalyser().context.suspend(); });
  await edgePage.waitForFunction(() => { const audio = window.rockLab.audio.getState(); return audio.contextState === 'suspended' && !audio.unlocked; });
  const suspendedBefore = await edgePage.evaluate(() => ({ audio: window.rockLab.audio.getState(), directRestore: window.rockLab.audio.playRestore(), oscillators: window.__audioProbe.oscillatorStarts.length }));
  assert.equal(suspendedBefore.directRestore, false, 'Playback must never unlock a suspended context itself');
  await edgePage.locator('#fr-reset').click();
  await edgePage.waitForFunction(count => window.rockLab.audio.getState().eventCounts.restore > count, eventCount(suspendedBefore.audio, 'restore'));
  const resumedReset = await edgePage.evaluate(async () => {
    const audio = window.rockLab.audio, analyser = audio.getAnalyser(), samples = new Float32Array(analyser.fftSize);
    let peak = 0;
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => setTimeout(resolve, 12));
      analyser.getFloatTimeDomainData(samples);
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    }
    return { audio: audio.getState(), fragments: window.rockLab.fracture.getStats().fragments, oscillators: window.__audioProbe.oscillatorStarts.length, analyserPeak: peak };
  });
  assert.equal(resumedReset.audio.contextState, 'running');
  assert.equal(resumedReset.fragments, 0);
  assert.equal(resumedReset.oscillators - suspendedBefore.oscillators, 4);
  assert.ok(resumedReset.analyserPeak > .001, 'Reset after resume must reach the actual audio output');
  report.checks.resetAfterNativeSuspension = { passed: true, beforeContext: suspendedBefore.audio.contextState, directPlaybackSuppressed: true, afterContext: resumedReset.audio.contextState, newOscillators: 4, analyserPeak: resumedReset.analyserPeak, event: lastEvent(resumedReset.audio, 'restore') };

  // Make the resume-promise race reproducible without bypassing the native
  // user-gesture call. The browser still resumes normally; only its promise's
  // completion is held until the user has disabled destruction.
  await edgePage.evaluate(async () => {
    const audio = window.rockLab.audio, context = audio.getAnalyser().context;
    audio.stop(); await context.suspend();
    const original = context.resume.bind(context);
    window.__qaOriginalResume = original;
    context.resume = () => {
      const native = original();
      const gate = new Promise(resolve => { window.__qaReleaseResume = resolve; });
      window.__qaResumePending = true;
      return native.then(() => gate);
    };
  });
  await edgePage.waitForFunction(() => window.rockLab.audio.getState().contextState === 'suspended' && !window.rockLab.audio.getState().unlocked);
  const pendingBefore = await edgePage.evaluate(() => ({ audio: window.rockLab.audio.getState(), oscillators: window.__audioProbe.oscillatorStarts.length }));
  await edgePage.locator('#fr-reset').click();
  await edgePage.waitForFunction(() => window.__qaResumePending === true);
  await edgePage.locator('#fr-enabled').uncheck();
  await edgePage.evaluate(() => window.__qaReleaseResume());
  await edgePage.waitForTimeout(100);
  const disabledAfter = await edgePage.evaluate(() => {
    const audio = window.rockLab.audio;
    audio.getAnalyser().context.resume = window.__qaOriginalResume;
    return { audio: audio.getState(), enabled: window.rockLab.fracture.getStats().enabled, oscillators: window.__audioProbe.oscillatorStarts.length };
  });
  assert.equal(disabledAfter.enabled, false);
  assert.equal(disabledAfter.audio.activeVoices, 0);
  assert.equal(eventCount(disabledAfter.audio, 'restore'), eventCount(pendingBefore.audio, 'restore'));
  assert.equal(disabledAfter.oscillators, pendingBefore.oscillators);
  assert.deepEqual(edgeErrors, []);
  report.checks.disableDuringPendingResume = { passed: true, instrumentedPromiseDelay: true, disabled: true, staleChimeStarted: false, activeVoices: 0, browserErrors: edgeErrors };
  await edgePage.close();

  // A deliberately missing local asset must leave the lab and the remaining
  // sound bank usable. Keep this expected network failure on its own page.
  const fallbackPage = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await fallbackPage.addInitScript(installAudioProbe);
  const fallbackErrors = [];
  let intercepted = 0;
  fallbackPage.on('pageerror', error => fallbackErrors.push(error.message));
  await fallbackPage.route('**/audio/breaks/rock-01.wav', async route => {
    intercepted++;
    await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Intentional audio QA missing-asset fixture.' });
  });
  await fallbackPage.goto(report.url);
  await fallbackPage.waitForFunction(() => window.rockLab?.ready && window.rockLab.audio);
  await fallbackPage.locator('#tab-fracture').click();
  await fallbackPage.locator('#fr-enabled').check();
  await fallbackPage.waitForFunction(() => {
    const state = window.rockLab.audio.getState();
    return !state.loading && state.loaded + state.failed === state.expected && state.contextState === 'running';
  });
  const fallbackResult = await fallbackPage.evaluate(() => {
    const audio = window.rockLab.audio;
    const before = audio.getState();
    const started = audio.playBreak('rock');
    return { before, started, after: audio.getState(), probe: window.__audioProbe };
  });
  assert.equal(intercepted, 1);
  assert.equal(fallbackResult.before.loaded, 15);
  assert.equal(fallbackResult.before.failed, 1);
  assert.ok(fallbackResult.before.errors.some(error => error.url.endsWith('/audio/breaks/rock-01.wav')));
  assert.equal(fallbackResult.started, true, 'A missing variant must not silence the available alternate');
  assert.ok(lastEvent(fallbackResult.after, 'break').clip.endsWith('rock-02.wav'));
  assert.ok(fallbackResult.probe.starts.some(start => start.peak > .001 && start.nonzero > 20));
  assert.deepEqual(fallbackErrors, []);
  report.checks.missingAssetGraceful = { passed: true, intercepted, loaded: fallbackResult.before.loaded, failed: fallbackResult.before.failed, diagnostic: fallbackResult.before.errors, fallbackEvent: lastEvent(fallbackResult.after, 'break'), pageErrors: fallbackErrors };
  await fallbackPage.close();
  report.passed = true;
  await fs.rm(path.join(output, 'failure.png'), { force: true });
} catch (error) {
  report.passed = false; report.failure = error.stack;
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, checks: Object.keys(report.checks), report: path.join(output, 'report.json'), errors: report.browserErrors }, null, 2));
}
