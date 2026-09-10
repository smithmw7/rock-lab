import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// A separate Chrome process exercises the real controls and recipe picker.
// Fixed renderer stepping makes GPU pixel comparisons deterministic; no user
// browser session or saved project files are touched by this check.
const project = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(project, 'output', 'asphalt');
const keys = ['asphaltRoughness', 'asphaltRoughnessVariation', 'asphaltNormalStrength', 'asphaltNoiseScale', 'asphaltReflectionDistortion', 'asphaltRippleStrength', 'asphaltRippleSpeed'];
const base = { asphaltRoughness: .25, asphaltRoughnessVariation: .45, asphaltNormalStrength: 1.1, asphaltNoiseScale: 1, asphaltReflectionDistortion: .8, asphaltRippleStrength: .5, asphaltRippleSpeed: 0, reflection: .9, groundWetness: .9 };
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, acceptDownloads: true });
const browserErrors = [];
page.on('pageerror', error => browserErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
const report = { url: process.env.ROCK_LAB_URL || 'http://127.0.0.1:5207/', checks: {}, captures: {}, browserErrors };

async function range(key, value) {
  await page.locator(`#${key}`).evaluate((input, next) => {
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  const stored = await page.evaluate(key => ({ state: window.rockLab.state[key], ground: window.rockLab.ground.getStats()[key] }), key);
  assert.equal(stored.state, value, `${key}: UI must update recipe state`);
  if (keys.includes(key)) assert.equal(stored.ground, value, `${key}: UI must update live ground`);
}
async function configure(values) { for (const [key, value] of Object.entries(values)) await range(key, value); }
async function stats() { return page.evaluate(() => ({ ...window.rockLab.getStats(), groundMaterialVersion: window.rockLab.ground.group.children[0].material.version })); }
async function advance(milliseconds) { await page.evaluate(ms => window.advanceTime(ms), milliseconds); }
async function capture(name, save = true) {
  const result = await page.evaluate(name => {
    const lab = window.rockLab;
    lab.renderer.render(lab.scene, lab.camera);
    const canvas = document.createElement('canvas');
    canvas.width = lab.renderer.domElement.width; canvas.height = lab.renderer.domElement.height;
    const context = canvas.getContext('2d'); context.drawImage(lab.renderer.domElement, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    window.__asphaltQAPixels[name] = { pixels, width: canvas.width, height: canvas.height };
    let hash = 2166136261;
    for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
    return { width: canvas.width, height: canvas.height, pixelHash: (hash >>> 0).toString(16), phase: lab.ground.getStats().asphaltTime };
  }, name);
  if (save) {
    result.file = path.join(output, `${name}.png`);
    await page.locator('#stage canvas').screenshot({ path: result.file });
  }
  report.captures[name] = result;
  return result;
}
async function difference(a, b) {
  return page.evaluate(([a, b]) => {
    const first = window.__asphaltQAPixels[a], second = window.__asphaltQAPixels[b];
    if (first.width !== second.width || first.height !== second.height) throw new Error('Capture sizes differ');
    let changedPixels = 0, changedGroundPixels = 0, totalDifference = 0, maxDifference = 0;
    for (let i = 0; i < first.pixels.length; i += 4) {
      const d = Math.abs(first.pixels[i] - second.pixels[i]) + Math.abs(first.pixels[i + 1] - second.pixels[i + 1]) + Math.abs(first.pixels[i + 2] - second.pixels[i + 2]);
      totalDifference += d; maxDifference = Math.max(maxDifference, d);
      if (d > 8) { changedPixels++; if (i / 4 / first.width > first.height * .58) changedGroundPixels++; }
    }
    return { changedPixels, changedGroundPixels, meanChannelDifference: totalDifference / (first.width * first.height * 3), maxDifference };
  }, [a, b]);
}
async function importFile(filename, expectedSeed) {
  await page.locator('#menu-file').click();
  const chooserEvent = page.waitForEvent('filechooser');
  await page.locator('#load-recipe').click();
  await (await chooserEvent).setFiles(filename);
  await page.waitForFunction(seed => window.rockLab.state.seed === seed && document.querySelector('#toast').textContent === 'Asset recipe restored', expectedSeed);
}
function noRebuild(before, after) {
  assert.equal(after.generationCount, before.generationCount, 'Ground controls must not regenerate the rock');
  assert.equal(after.programs, before.programs, 'Ground controls must reuse shader programs');
  assert.equal(after.geometries, before.geometries, 'Ground controls must reuse geometry');
  assert.equal(after.groundMaterialVersion, before.groundMaterialVersion, 'Ground controls must not invalidate the material');
}

try {
  await page.goto(report.url);
  await page.waitForFunction(() => window.rockLab?.ready);
  report.defaults = await page.evaluate(async () => (await import('/src/ground.js')).ASPHALT_DEFAULTS);
  assert.deepEqual(Object.keys(report.defaults).sort(), [...keys].sort());
  await page.locator('#tab-ground').click();
  await page.locator('#grounds [data-ground="asphalt"]').click();
  await page.evaluate(() => {
    window.rockLab.renderer.setAnimationLoop(null);
    window.__asphaltQAPixels = {};
    window.advanceTime(0);
  });
  await configure(base);
  await advance(0);
  const baseline = await stats();
  const cases = [
    ['asphaltRoughness', .05, .95], ['asphaltRoughnessVariation', 0, 1],
    ['asphaltNormalStrength', 0, 1.8], ['asphaltNoiseScale', .3, 3.8],
    ['asphaltReflectionDistortion', 0, 1], ['asphaltRippleStrength', 0, 1],
    ['asphaltRippleSpeed', 0, 1.7],
  ];
  for (const [key, low, high] of cases) {
    await configure(base);
    await range(key, low); await advance(key === 'asphaltRippleSpeed' ? 900 : 0);
    const name = key.replace('asphalt', '').replace(/^[A-Z]/, letter => letter.toLowerCase());
    await capture(`${name}-low`);
    await range(key, high); await advance(key === 'asphaltRippleSpeed' ? 900 : 0);
    await capture(`${name}-high`);
    const pixels = await difference(`${name}-low`, `${name}-high`);
    assert.ok(pixels.changedGroundPixels > 25, `${key} must visibly change rendered ground (${JSON.stringify(pixels)})`);
    noRebuild(baseline, await stats());
    report.checks[key] = { passed: true, low, high, pixels };
  }

  await configure({ ...base, asphaltRippleStrength: 1, asphaltRippleSpeed: 0 });
  const frozenBefore = await capture('frozen-before');
  await advance(1250);
  const frozenAfter = await capture('frozen-after', false);
  assert.equal(frozenAfter.phase, frozenBefore.phase);
  assert.equal(frozenAfter.pixelHash, frozenBefore.pixelHash);
  report.checks.speedZeroFreezesPattern = { passed: true, phase: frozenAfter.phase, pixels: await difference('frozen-before', 'frozen-after') };

  await range('asphaltRippleSpeed', 1.2);
  const movingBefore = await capture('moving-before', false);
  await advance(850);
  const movingAfter = await capture('moving-after');
  const movingPixels = await difference('moving-before', 'moving-after');
  assert.ok(movingAfter.phase > movingBefore.phase);
  assert.ok(movingPixels.changedGroundPixels > 25);
  report.checks.positiveSpeedAnimatesPattern = { passed: true, beforePhase: movingBefore.phase, afterPhase: movingAfter.phase, pixels: movingPixels };

  await configure({ ...base, asphaltNormalStrength: 0, asphaltRippleStrength: 1, asphaltRippleSpeed: 1, asphaltReflectionDistortion: 1 });
  const flatBefore = await capture('normal-zero-before');
  await advance(950);
  const flatAfter = await capture('normal-zero-after', false);
  assert.ok(flatAfter.phase > flatBefore.phase);
  assert.equal(flatAfter.pixelHash, flatBefore.pixelHash, 'Normal strength zero must remove animated relief/distortion');
  await range('asphaltReflectionDistortion', 0);
  const flatWithoutDistortion = await capture('normal-zero-distortion-zero', false);
  assert.equal(flatWithoutDistortion.pixelHash, flatAfter.pixelHash, 'No normal means no normal-driven reflection distortion');
  report.checks.normalZeroFlattensAndStopsDistortion = { passed: true, pixels: await difference('normal-zero-before', 'normal-zero-after') };

  await configure({ ...base, reflection: 0, asphaltReflectionDistortion: 0, asphaltNormalStrength: 0 });
  await capture('lighting-normal-flat');
  await range('asphaltNormalStrength', 1.8);
  await capture('lighting-normal-relief');
  const normalLighting = await difference('lighting-normal-flat', 'lighting-normal-relief');
  assert.ok(normalLighting.changedGroundPixels > 25, 'Lighting normals must remain active when reflection distortion is zero');
  report.checks.distortionZeroKeepsLightingNormals = { passed: true, pixels: normalLighting };
  const passesBefore = (await stats()).ground.reflectionPasses;
  await advance(1000);
  const passesOff = (await stats()).ground.reflectionPasses;
  assert.equal(passesOff, passesBefore);
  await range('reflection', .9); await advance(0);
  const passesOn = (await stats()).ground.reflectionPasses;
  assert.ok(passesOn > passesOff);
  report.checks.reflectionZeroStopsPasses = { passed: true, passesBefore, passesOff, passesOn };
  noRebuild(baseline, await stats());
  const afterControlChecks = await stats();
  report.checks.uniformReuse = { passed: true, before: { generationCount: baseline.generationCount, programs: baseline.programs, geometries: baseline.geometries, materialVersion: baseline.groundMaterialVersion }, after: { generationCount: afterControlChecks.generationCount, programs: afterControlChecks.programs, geometries: afterControlChecks.geometries, materialVersion: afterControlChecks.groundMaterialVersion } };

  const quiet = { asphaltRoughness: .05, asphaltRoughnessVariation: 0, asphaltNormalStrength: 0, asphaltNoiseScale: .25, asphaltReflectionDistortion: 0, asphaltRippleStrength: 0, asphaltRippleSpeed: 0 };
  const extreme = { asphaltRoughness: 1, asphaltRoughnessVariation: 1, asphaltNormalStrength: 2, asphaltNoiseScale: 4, asphaltReflectionDistortion: 1, asphaltRippleStrength: 1, asphaltRippleSpeed: 2 };
  report.checks.otherGroundsUnchanged = {};
  for (const ground of ['studio', 'concrete', 'sand', 'wood']) {
    await page.locator('#grounds [data-ground="asphalt"]').click(); await configure(quiet);
    await page.locator(`#grounds [data-ground="${ground}"]`).click();
    const first = await capture(`${ground}-quiet`);
    await page.locator('#grounds [data-ground="asphalt"]').click(); await configure(extreme);
    await page.locator(`#grounds [data-ground="${ground}"]`).click(); await advance(1000);
    const second = await capture(`${ground}-extreme`, false);
    assert.equal(second.pixelHash, first.pixelHash, `${ground} must ignore every asphalt-specific setting`);
    report.checks.otherGroundsUnchanged[ground] = { passed: true, pixels: await difference(`${ground}-quiet`, `${ground}-extreme`) };
  }
  noRebuild(baseline, await stats());

  await page.locator('#grounds [data-ground="asphalt"]').click();
  const savedValues = { asphaltRoughness: .67, asphaltRoughnessVariation: .81, asphaltNormalStrength: 1.37, asphaltNoiseScale: 2.75, asphaltReflectionDistortion: .63, asphaltRippleStrength: .74, asphaltRippleSpeed: 1.35 };
  await configure(savedValues);
  const recipeBefore = await page.evaluate(() => window.rockLab.recipe());
  await page.locator('#menu-file').click();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#save-recipe').click();
  const download = await downloadEvent;
  const filename = path.join(output, 'actual-asphalt-export-v3.json');
  await download.saveAs(filename); assert.equal(await download.failure(), null);
  const exported = JSON.parse(await fs.readFile(filename, 'utf8'));
  assert.deepEqual(exported, recipeBefore);
  for (const [key, value] of Object.entries(savedValues)) assert.equal(exported.options[key], value);
  await page.locator('#reset-asphalt').click();
  for (const [key, value] of Object.entries(report.defaults)) assert.equal((await page.evaluate(() => window.rockLab.state))[key], value);
  await importFile(filename, exported.options.seed);
  const restored = await page.evaluate(() => window.rockLab.recipe());
  assert.deepEqual(restored, exported);
  report.checks.recipeDownloadAndPickerRoundtrip = { passed: true, filename, savedValues };

  const legacy = structuredClone(exported);
  legacy.options.seed = 72531;
  for (const key of keys) delete legacy.options[key];
  const legacyFilename = path.join(output, 'legacy-v3-without-asphalt-controls.json');
  await fs.writeFile(legacyFilename, `${JSON.stringify(legacy, null, 2)}\n`);
  await importFile(legacyFilename, legacy.options.seed);
  const legacyState = await page.evaluate(() => window.rockLab.state);
  for (const [key, value] of Object.entries(report.defaults)) assert.equal(legacyState[key], value, `${key}: legacy recipe must restore default`);
  report.checks.legacyV3UsesDefaults = { passed: true, filename: legacyFilename, defaults: report.defaults };
  await advance(0);
  await page.screenshot({ path: path.join(output, 'asphalt-controls-desktop.png') });
  assert.deepEqual(browserErrors, []);
  report.passed = true;
  await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: true, checks: Object.keys(report.checks), output }, null, 2));
} catch (error) {
  report.passed = false; report.error = error.message;
  await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
