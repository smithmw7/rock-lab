import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Original synthesis for the redistributable Rock Lab demo. This script never
// reads the optional private library or derives waveforms from recordings.
const project = fileURLToPath(new URL('..', import.meta.url));
const sampleRate = 48000;
const families = ['rock', 'concrete', 'glass', 'wood'];
const durations = {
  rock: { break: 0.62, collision: 0.24 },
  concrete: { break: 0.54, collision: 0.20 },
  glass: { break: 0.78, collision: 0.32 },
  wood: { break: 0.48, collision: 0.22 },
};

function randomSequence(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function synthesize(family, role, variant, seed) {
  const random = randomSequence(seed);
  const duration = durations[family][role];
  const samples = new Float64Array(Math.round(duration * sampleRate));
  const breaking = role === 'break';
  const size = variant === 1 ? 0.93 : 1.08;

  function noiseBurst(start, length, amplitude, lowCut, highCut = 0) {
    const first = Math.round(start * sampleRate);
    const count = Math.min(Math.round(length * sampleRate), samples.length - first);
    const lowAlpha = 1 - Math.exp(-2 * Math.PI * lowCut / sampleRate);
    const highAlpha = 1 - Math.exp(-2 * Math.PI * highCut / sampleRate);
    let low = 0, high = 0;
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate;
      low += lowAlpha * (random() * 2 - 1 - low);
      high += highAlpha * (low - high);
      const attack = Math.min(1, t / 0.0007);
      const tail = Math.min(1, (count - 1 - i) / (sampleRate * 0.006));
      samples[first + i] += (low - high) * amplitude * attack * tail * Math.exp(-5 * t / length);
    }
  }

  function modalImpact(start, modes, amplitude, decay, detune = 1) {
    const first = Math.round(start * sampleRate);
    for (let mode = 0; mode < modes.length; mode++) {
      const frequency = modes[mode] * detune;
      const phase = random() * Math.PI * 2;
      const modeDecay = decay / (1 + mode * 0.19);
      const modeGain = amplitude / (1 + mode * 0.7);
      for (let i = first; i < samples.length; i++) {
        const t = (i - first) / sampleRate;
        const attack = Math.min(1, t / 0.0012);
        samples[i] += Math.sin(t * 2 * Math.PI * frequency + phase)
          * Math.exp(-t / modeDecay) * attack * modeGain;
      }
    }
  }

  if (family === 'rock') {
    // Weighty stone body followed by irregular grit and small tumbling chips.
    modalImpact(0, [92, 153, 287, 439], 0.64, breaking ? 0.085 : 0.04, size);
    noiseBurst(0, breaking ? 0.27 : 0.13, 1.8, 2300, 170);
    if (breaking) for (let i = 0; i < 8; i++) {
      const start = 0.018 + i * 0.041 + random() * 0.025;
      const level = (0.5 + random() * 0.25) * (1 - i / 11);
      noiseBurst(start, 0.05 + random() * 0.05, level, 1300 + random() * 3100, 350);
      modalImpact(start, [330, 601, 997], level * 0.13, 0.023, 0.8 + random() * 0.5);
    }
  } else if (family === 'concrete') {
    // A dry, hard attack with a brittle granular crunch and little ringing.
    modalImpact(0, [151, 331, 627], 0.4, breaking ? 0.044 : 0.024, size);
    noiseBurst(0, breaking ? 0.18 : 0.09, 2.1, 5700, 420);
    if (breaking) for (let i = 0; i < 13; i++) {
      const start = 0.014 + Math.pow(i / 13, 1.5) * 0.32 + random() * 0.014;
      noiseBurst(start, 0.027 + random() * 0.048, 0.52 * (1 - i / 17), 3000 + random() * 3600, 750);
    }
  } else if (family === 'glass') {
    // Inharmonic shard resonances plus a crisp crunch, distinct from a UI bell.
    noiseBurst(0, breaking ? 0.12 : 0.035, breaking ? 1.35 : 0.45, 9400, 1800);
    modalImpact(0, [1771, 2699, 4021, 5813, 7411], 0.32, breaking ? 0.15 : 0.072, size);
    if (breaking) for (let i = 0; i < 9; i++) {
      const start = 0.018 + i * 0.05 + random() * 0.03;
      const scale = 0.65 + random() * 0.62;
      const level = 0.17 * (1 - i / 13);
      modalImpact(start, [2203, 3529, 5477], level, 0.05 + random() * 0.055, scale);
      noiseBurst(start, 0.012, level * 1.5, 10000, 2600);
    }
  } else {
    // Warm hollow body, a fibrous snap, and shorter secondary splinters.
    modalImpact(0, [183, 391, 713, 1103], 0.72, breaking ? 0.052 : 0.037, size);
    noiseBurst(0, breaking ? 0.105 : 0.048, 1.3, 4000, 700);
    if (breaking) for (let i = 0; i < 5; i++) {
      const start = 0.018 + i * 0.044 + random() * 0.02;
      const level = 0.45 * (1 - i / 7);
      noiseBurst(start, 0.05 + random() * 0.035, level, 2700 + random() * 1300, 550);
      modalImpact(start, [279, 623, 1327], level * 0.29, 0.025, 0.86 + random() * 0.4);
    }
  }

  // Remove DC, soften peaks, and keep headroom for overlapping physics voices.
  let dc = 0, squareSum = 0, peak = 0;
  for (const sample of samples) dc += sample / samples.length;
  for (let i = 0; i < samples.length; i++) {
    const fade = Math.min(1, i / 24, (samples.length - 1 - i) / 480);
    samples[i] = Math.tanh((samples[i] - dc) * 1.1) * Math.max(0, fade);
    squareSum += samples[i] ** 2;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const rawRms = Math.sqrt(squareSum / samples.length);
  const gain = Math.min((breaking ? 0.76 : 0.62) / peak, (breaking ? 0.12 : 0.075) / rawRms);
  const pcm = new Int16Array(samples.length);
  let finalPeak = 0, finalSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.round(samples[i] * gain * 32767);
    const value = pcm[i] / 32768;
    finalPeak = Math.max(finalPeak, Math.abs(value));
    finalSquares += value ** 2;
  }
  return { pcm, duration, peak: finalPeak, rms: Math.sqrt(finalSquares / pcm.length) };
}

function encodeWav(pcm) {
  const buffer = Buffer.alloc(44 + pcm.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVE', 8); buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34); buffer.write('data', 36);
  buffer.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) buffer.writeInt16LE(pcm[i], 44 + i * 2);
  return buffer;
}

const clips = [];
for (const [familyIndex, family] of families.entries()) {
  for (const role of ['break', 'collision']) {
    for (const variant of [1, 2]) {
      const seed = 912307 + familyIndex * 19087 + (role === 'break' ? 1207 : 7523) + variant * 331;
      const synthesized = synthesize(family, role, variant, seed);
      const wav = encodeWav(synthesized.pcm);
      const name = `${family}-${String(variant).padStart(2, '0')}.wav`;
      const relative = `public/audio/${role === 'break' ? `breaks/${name}` : `repair/hit-${name}`}`;
      await fs.mkdir(path.dirname(path.join(project, relative)), { recursive: true });
      await fs.writeFile(path.join(project, relative), wav);
      clips.push({
        path: relative, family, role, variant, seed, bytes: wav.length,
        sha256: createHash('sha256').update(wav).digest('hex'),
        duration_seconds: synthesized.duration, sample_rate_hz: sampleRate,
        channels: 1, pcm_bits: 16,
        peak: Number(synthesized.peak.toFixed(6)), rms: Number(synthesized.rms.toFixed(6)),
      });
    }
  }
}

const provenance = {
  schema_version: 2,
  library: 'public',
  description: 'Original synthesized material effects created for Procedural Rock Lab. No source recordings, purchased assets, or third-party sample libraries were used in these files.',
  generator: 'scripts/generate-public-audio.mjs',
  regeneration: 'node scripts/generate-public-audio.mjs',
  license: 'MIT; see LICENSE in the project root. The original generator and its generated public WAV files are included in the project license.',
  synthesis: 'Deterministic seeded noise, filtered impact bursts, damped inharmonic resonances, and staggered fragments. Four separately authored material designs; two variants each for break and collision. Mono PCM16 at 48 kHz, DC removal, soft peak shaping and fixed per-clip gain with peak headroom.',
  material_designs: {
    rock: 'Low stone body, midrange grit and irregular tumbling chips.',
    concrete: 'Dry brittle attack, short resonances and dense granular crunch.',
    glass: 'Bright inharmonic shard ringing with short noisy attacks and scattered tinkles.',
    wood: 'Warm hollow resonances, a fibrous snap and brief splinter clicks.',
  },
  playback: { playback_rate: 1, detune_cents: 0, master_gain_default: 0.75 },
  synthetic_restore: {
    source: 'src/audio.js', waveform: 'sine', frequencies_hz: [392, 494, 587, 784],
    note_spacing_seconds: 0.055, peak_gain: 0.06,
    description: 'Four-note Web Audio reset chime. No sampled recording.',
  },
  private_library: 'An optional local-only licensed recording bank may be selected in development. It is not part of the public source, generated bank, or production build. See docs/AUDIO.md.',
  clip_count: clips.length, total_bytes: clips.reduce((sum, clip) => sum + clip.bytes, 0), clips,
};
await fs.mkdir(path.join(project, 'docs'), { recursive: true });
await fs.writeFile(path.join(project, 'docs', 'audio-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
console.log(JSON.stringify({ generated: clips.length, bytes: provenance.total_bytes, library: 'public', clips: clips.map(({ path, peak, rms }) => ({ path, peak, rms })) }));
