import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { WORKSHOP_SHAPES, WORKSHOP_CATALOG, WORKSHOP_RANGES } from '../src/workshop-geometry.js';
import { WORKSHOP_SURFACES } from '../src/workshop-materials.js';
import { shapes, surfaces } from '../src/catalog.js';

const project = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(project, 'output', 'workshop');
await fs.mkdir(output, { recursive: true });
const report = { url: process.env.ROCK_LAB_URL || 'http://127.0.0.1:5207/', checks: {}, objects: {}, materials: {}, errors: [], warnings: [] };
const sourceFiles = ['src/geometry.js', 'src/workshop-geometry.js', 'src/material.js', 'src/workshop-materials.js', 'src/main.js', 'src/lathe-editor.js', 'src/fracture.js'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash('sha256').update(await fs.readFile(path.join(project, file))).digest('hex')])));
report.sourceHashes = await sourceHashes();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage();
function observe(target) {
  target.setDefaultTimeout(60000);
  target.on('pageerror', error => report.errors.push(error.message));
  target.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); if (message.type() === 'warning') report.warnings.push(message.text()); });
}
observe(page);

function browserSnapshot() {
  const lab = window.rockLab, meshes = [], generated = [];
  lab.scene.traverseVisible(object => { if (object.userData.generated) generated.push(object); });
  const fractured = lab.fracture?.getStats().enabled;
  if (fractured) meshes.push(...lab.fracture.getMeshes());
  else for (const group of generated) group.traverseVisible(object => { if (object.isMesh) meshes.push(object); });
  const roles = {}, ids = [], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let signature = 2166136261, finite = true, correctBindings = true;
  const hash = value => { signature ^= Math.round(value * 1e5); signature = Math.imul(signature, 16777619); };
  for (const mesh of meshes) {
    const slot = mesh.userData.materialSlot || 'primary', pair = slot === 'primary' ? { outer: lab.material, inner: lab.innerMaterial } : lab.partMaterials[slot];
    roles[slot] = (roles[slot] || 0) + 1; ids.push(mesh.geometry.uuid);
    correctBindings &&= Array.isArray(mesh.material) ? mesh.material[0] === pair.outer && mesh.material[1] === pair.inner : mesh.material === pair.outer;
    const p = mesh.geometry.attributes.position, point = mesh.position.clone(); mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < p.count; i++) {
      mesh.localToWorld(point.set(p.getX(i), p.getY(i), p.getZ(i)));
      point.toArray().forEach((value, axis) => { finite &&= Number.isFinite(value); min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value); hash(value); });
    }
    for (const attribute of Object.values(mesh.geometry.attributes)) for (const value of attribute.array) finite &&= Number.isFinite(value);
  }
  const physical = material => ({ metalness: material.metalness, clearcoat: material.clearcoat, transmission: material.transmission, version: material.version });
  return { recipe: lab.recipe(), stats: lab.getStats(), roles, correctBindings, meshes: meshes.length, ids, finite, geometryHash: (signature >>> 0).toString(16), bounds: { min, max, dimensions: max.map((value, axis) => value - min[axis]) }, primary: physical(lab.material), unsupported: generated.flatMap(group => group.userData.connectivity?.unsupported || []) };
}
const snapshot = target => (target || page).evaluate(browserSnapshot);
const advance = async (target = page) => target.evaluate(() => { for (let i = 0; i < 8; i++) window.advanceTime(0); });
async function selectShape(id, target = page) {
  await target.locator('#tab-shape').click(); await target.locator('#shape-search').fill(''); await target.locator('[data-family="all"]').click();
  const generation = await target.evaluate(() => window.rockLab.getStats().generationCount);
  await target.locator(`#shapes [data-shape="${id}"]`).click();
  await target.waitForFunction(({ id, generation }) => window.rockLab.state.shape === id && window.rockLab.getStats().generationCount > generation, { id, generation });
  await advance(target);
}
async function range(id, value, { geometry = false, target = page } = {}) {
  const generation = await target.evaluate(() => window.rockLab.getStats().generationCount);
  await target.locator(`#${id}`).evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  if (geometry) await target.waitForFunction(before => window.rockLab.getStats().generationCount > before, generation);
  await advance(target);
}
async function selectSurface(id, slot = 'primary', side = 'outer') {
  await page.locator('#tab-material').click();
  if (await page.locator('#material-slot-row').isVisible()) await page.locator('#material-slot').selectOption(slot);
  else assert.equal(slot, 'primary');
  await page.locator(`#material-${side}`).click();
  const family = surfaces[id].family || (['glass', 'quartz', 'frozenGlass'].includes(id) ? 'optical' : 'rock');
  await page.locator(`[data-material-family="${family}"]`).click(); await page.locator(`[data-surface="${id}"]`).click(); await advance();
}
async function capture(name, target = page) { await advance(target); const filename = path.join(output, `${name}.png`); await target.locator('#stage canvas').screenshot({ path: filename }); return filename; }
async function pixels(key) {
  return page.evaluate(key => {
    const source = window.rockLab.renderer.domElement, copy = document.createElement('canvas'); copy.width = source.width; copy.height = source.height;
    const context = copy.getContext('2d'); context.drawImage(source, 0, 0);
    (window.__workshopPixels ||= {})[key] = context.getImageData(0, 0, copy.width, copy.height).data;
  }, key);
}
async function pixelDifference() {
  return page.evaluate(() => {
    const { before, after } = window.__workshopPixels; let changed = 0, sum = 0;
    for (let i = 0; i < before.length; i += 4) { const d = Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) + Math.abs(before[i + 2] - after[i + 2]); if (d > 8) changed++; sum += d; }
    return { changedPixels: changed, meanChannelDifference: sum / (before.length / 4 * 3) };
  });
}
async function importFile(filename) {
  await page.locator('#menu-file').click(); const chooser = page.waitForEvent('filechooser'); await page.locator('#load-recipe').click(); await (await chooser).setFiles(filename);
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Asset recipe restored'); await advance();
}
async function piecePoint(slot, generation) {
  return page.evaluate(({ slot, generation }) => {
    const lab = window.rockLab;
    const candidates = lab.fracture.getMeshes().filter(mesh => mesh.userData.materialSlot === slot && mesh.userData.generation === generation);
    for (const mesh of candidates) mesh.geometry.computeBoundingSphere();
    candidates.sort((a, b) => b.geometry.boundingSphere.radius - a.geometry.boundingSphere.radius);
    const mesh = candidates[0]; if (!mesh) throw new Error(`No ${slot} piece in generation ${generation}`);
    mesh.updateWorldMatrix(true, false);
    const center = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).project(lab.camera), rect = lab.renderer.domElement.getBoundingClientRect();
    return { id: mesh.uuid, x: rect.left + (center.x + 1) * rect.width / 2, y: rect.top + (1 - center.y) * rect.height / 2 };
  }, { slot, generation });
}
async function contactSheet(names, filename, columns = 4) {
  const sheet = await context.newPage(); await sheet.setViewportSize({ width: 1600, height: 1100 });
  const cards = await Promise.all(names.map(async name => `<figure><img src="data:image/png;base64,${(await fs.readFile(path.join(output, `${name}.png`))).toString('base64')}"><figcaption>${name}</figcaption></figure>`));
  await sheet.setContent(`<html><style>body{margin:0;background:#111a22;color:#e7eef3;font:16px system-ui}main{display:grid;grid-template-columns:repeat(${columns},1fr);gap:8px;padding:8px}figure{margin:0;background:#1b252e}img{width:100%;height:300px;object-fit:contain;display:block}figcaption{padding:8px 12px}</style><main>${cards.join('')}</main></html>`);
  await sheet.screenshot({ path: path.join(output, filename), fullPage: true }); await sheet.close();
}

try {
  assert.equal(WORKSHOP_SHAPES.size, 20); assert.equal(Object.keys(WORKSHOP_SURFACES).length, 15);
  for (const id of WORKSHOP_SHAPES) assert.ok(surfaces[WORKSHOP_CATALOG[id].defaultSurface], `${id} has a valid default material`);
  await page.goto(report.url); await page.waitForFunction(() => window.rockLab?.ready && window.rockLab.partStates && window.rockLab.partMaterials);
  await page.locator('#sound-toggle').click();
  assert.equal((await snapshot()).recipe.version, 4);
  assert.equal(await page.locator('#shapes [data-shape]').count(), Object.keys(shapes).length);
  for (const id of WORKSHOP_SHAPES) {
    await selectShape(id); const value = await snapshot();
    assert.equal(value.recipe.options.shape, id); assert.ok(value.finite && value.meshes > 0); assert.deepEqual(value.unsupported, []);
    assert.ok(value.bounds.dimensions.every(n => n > .02)); assert.ok(Math.abs(value.bounds.min[1]) < .002); assert.ok(value.correctBindings, `${id} source material slots`);
    assert.equal(value.recipe.options.surface, WORKSHOP_CATALOG[id].defaultSurface);
    if (WORKSHOP_CATALOG[id].kind === 'composite') assert.ok(value.roles.primary > 0 && value.roles.handle > 0);
    report.objects[id] = { ...value, image: await capture(`shape-${id}`) };
  }
  report.checks.all20ObjectsRendered = true;

  await selectShape('hammer'); await selectSurface('oak', 'handle', 'outer');
  assert.equal(await page.locator('[data-material-family="wood"]').getAttribute('aria-selected'), 'true');
  await selectShape('sphere'); await page.locator('#tab-material').click();
  assert.equal(await page.locator('[data-material-family="metal"]').getAttribute('aria-selected'), 'true');
  assert.ok(await page.locator('#materials [data-surface="brushedSteel"]').isVisible());
  report.checks.leavingHandleRestoresPrimaryPalette = true;

  // Real geometry controls must alter uploaded geometry, not only text/state.
  await selectShape('hammer'); const hammerVariants = {};
  for (const head of ['club', 'ball', 'cross', 'claw']) {
    const before = (await snapshot()).stats.generationCount; await page.locator('#hammerHead').selectOption(head);
    await page.waitForFunction(before => window.rockLab.getStats().generationCount > before, before); await advance();
    hammerVariants[head] = (await snapshot()).geometryHash; await capture(`hammer-${head}`);
  }
  assert.equal(new Set(Object.values(hammerVariants)).size, 4);
  for (const id of ['handleLength', 'headScale']) { const before = await snapshot(); await range(id, 1.35, { geometry: true }); assert.notEqual((await snapshot()).geometryHash, before.geometryHash); }
  await selectShape('knife'); const knives = {};
  for (const blade of ['chef', 'drop', 'cleaver']) {
    const before = (await snapshot()).stats.generationCount; await page.locator('#knifeBlade').selectOption(blade);
    await page.waitForFunction(before => window.rockLab.getStats().generationCount > before, before); await advance(); knives[blade] = (await snapshot()).geometryHash; await capture(`knife-${blade}`);
  }
  assert.equal(new Set(Object.values(knives)).size, 3); report.checks.toolVariants = { hammerVariants, knives };

  await selectShape('vase'); const latheControls = {};
  for (const id of ['wallThickness', 'latheHeight', 'latheWidth', 'latheBelly', 'latheNeck', 'latheLip', 'latheSegments', 'profileSmoothness']) {
    const before = await snapshot(), [lo, hi] = WORKSHOP_RANGES[id];
    const next = id === 'latheSegments' ? 18 : Math.round((lo + (hi - lo) * .36) * 100) / 100;
    await range(id, next, { geometry: true }); const after = await snapshot(); assert.notEqual(after.geometryHash, before.geometryHash, `${id} changes geometry`);
    assert.equal(after.recipe.options[id], next); latheControls[id] = next;
  }
  await page.locator('#lathe-point').selectOption('2'); await range('lathe-radius', .74, { geometry: true });
  assert.equal((await snapshot()).recipe.options.latheProfile[2], .74);
  const circle = page.locator('#lathe-profile [data-profile-point="2"]'); await circle.focus();
  const keyboardBefore = await snapshot(); await page.keyboard.press('ArrowRight');
  await page.waitForFunction(before => window.rockLab.state.latheProfile[2] === .75 && window.rockLab.getStats().generationCount > before, keyboardBefore.stats.generationCount); await advance(); assert.notEqual((await snapshot()).geometryHash, keyboardBefore.geometryHash);
  const box = await circle.boundingBox(), dragBefore = await snapshot();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 16, box.y + box.height / 2, { steps: 7 }); await page.mouse.up();
  await page.waitForFunction(before => window.rockLab.getStats().generationCount > before, dragBefore.stats.generationCount); await advance();
  const edited = await snapshot(); assert.notDeepEqual(edited.recipe.options.latheProfile, dragBefore.recipe.options.latheProfile); assert.notEqual(edited.geometryHash, dragBefore.geometryHash);
  await page.screenshot({ path: path.join(output, 'lathe-profile-desktop.png') }); report.checks.latheControlsAndProfileEditing = { latheControls, profile: edited.recipe.options.latheProfile };
  const latheDownload = page.waitForEvent('download'); await page.locator('#menu-file').click(); await page.locator('#save-recipe').click();
  const latheFile = path.join(output, 'lathe-profile-v4.json'); await (await latheDownload).saveAs(latheFile);
  await page.locator('#reset-lathe-profile').click(); await page.waitForFunction(() => window.rockLab.state.latheProfile === null);
  await importFile(latheFile); assert.deepEqual((await snapshot()).recipe, edited.recipe); report.checks.latheProfileFileRoundtrip = true;

  await selectShape('sphere'); const sphereGeneration = (await snapshot()).stats.generationCount;
  for (const [id, entry] of Object.entries(WORKSHOP_SURFACES)) {
    await selectSurface(id); const value = await snapshot();
    assert.equal(value.stats.generationCount, sphereGeneration); assert.equal(value.primary.metalness, entry.family === 'metal' ? 1 : 0); assert.equal(value.primary.transmission, 0);
    if (entry.family === 'ceramic') assert.ok(Math.abs(value.primary.clearcoat - value.recipe.options.ceramicGlaze * .85) < 1e-8);
    report.materials[id] = { ...value.primary, image: await capture(`material-${id}`) };
  }
  const materialControls = [
    ['metalBrushing', 'brushedSteel', 0, 1], ['metalWear', 'copper', 0, 1],
    ['woodGrainScale', 'oak', .7, 5], ['woodGrainStrength', 'oak', 0, 1], ['woodKnots', 'oak', 0, 1], ['woodWarmth', 'oak', 0, 1],
    ['ceramicGlaze', 'porcelain', 0, 1], ['ceramicSpeckle', 'stoneware', 0, 1],
  ];
  report.checks.materialControlPixels = {};
  for (const [id, surface, low, high] of materialControls) {
    await selectSurface(surface); const initial = await snapshot();
    await range(id, low); await pixels('before'); await range(id, high); await pixels('after');
    const difference = await pixelDifference(), after = await snapshot();
    assert.ok(difference.changedPixels > 12, `${id} changes actual GPU pixels`); assert.equal(after.stats.generationCount, initial.stats.generationCount); assert.deepEqual(after.ids, initial.ids);
    report.checks.materialControlPixels[id] = difference;
  }
  const memory = () => page.evaluate(() => ({ geometries: window.rockLab.renderer.info.memory.geometries, textures: window.rockLab.renderer.info.memory.textures, programs: window.rockLab.renderer.info.programs.length }));
  await selectSurface('brushedSteel'); await selectSurface('oak'); await selectSurface('porcelain'); const beforeMemory = await memory();
  for (let i = 0; i < 4; i++) for (const surface of ['brushedSteel', 'oak', 'porcelain']) await selectSurface(surface);
  assert.deepEqual(await memory(), beforeMemory); report.checks.materialChangesReuseResources = beforeMemory;

  await selectShape('hammer');
  for (const [slot, outer, inner] of [['primary', 'brushedSteel', 'ice'], ['handle', 'oak', 'walnut'], ['trim', 'brass', 'copper']]) { await selectSurface(outer, slot, 'outer'); await selectSurface(inner, slot, 'inner'); }
  await page.locator('#tab-fracture').click(); await page.locator('#fr-method').selectOption('simple'); await range('fr-fragmentCount', 2); await range('fr-gravity', 0); await range('fr-impulse', 0);
  await page.locator('#fr-enabled').check(); await page.waitForFunction(() => window.rockLab.fracture?.getStats().enabled); await page.locator('#fr-pause').click();
  assert.equal((await snapshot()).stats.fracture.paused, true);
  const hit = await piecePoint('handle', 0); await page.mouse.click(hit.x, hit.y);
  await page.waitForFunction(() => window.rockLab.fracture.getStats().generation === 1 && !window.rockLab.fracture.getStats().busy);
  const firstCut = await snapshot(); assert.ok(firstCut.correctBindings);
  const cutSlots = await page.evaluate(() => window.rockLab.fracture.getMeshes().filter(mesh => mesh.userData.generation > 0).map(mesh => mesh.userData.materialSlot));
  assert.ok(cutSlots.length >= 2 && cutSlots.every(slot => slot === 'handle'), 'Actual pointer tap fractures the wooden handle without repainting other parts');
  await capture('composite-handle-fracture');
  await selectSurface('oak', 'handle', 'outer'); const beforeEdit = await snapshot(); await range('woodWarmth', .13); const afterEdit = await snapshot();
  assert.deepEqual(afterEdit.ids, beforeEdit.ids); assert.equal(afterEdit.stats.generationCount, beforeEdit.stats.generationCount); assert.ok(afterEdit.correctBindings);
  assert.deepEqual(afterEdit.recipe.options, beforeEdit.recipe.options); assert.deepEqual(afterEdit.recipe.partMaterials.trim, beforeEdit.recipe.partMaterials.trim);
  const repeatPoint = await piecePoint('handle', 1); await page.mouse.click(repeatPoint.x, repeatPoint.y);
  await page.waitForFunction(() => window.rockLab.fracture.getStats().generation === 2 && !window.rockLab.fracture.getStats().busy);
  const repeated = await snapshot(); assert.ok(repeated.correctBindings); assert.ok(repeated.finite);
  const downloadEvent = page.waitForEvent('download'); await page.locator('#menu-file').click(); await page.locator('#save-recipe').click();
  const download = await downloadEvent, compositeFile = path.join(output, 'composite-part-materials-v4.json'); await download.saveAs(compositeFile); assert.equal(await download.failure(), null);
  assert.deepEqual(JSON.parse(await fs.readFile(compositeFile, 'utf8')), repeated.recipe);
  await page.locator('#tab-studio').click(); await page.locator('#reset').click(); await importFile(compositeFile);
  const restored = await snapshot(); assert.deepEqual(restored.recipe, repeated.recipe); assert.equal(restored.stats.fracture.generation, 0); assert.equal(restored.stats.fracture.fragments, 0); assert.ok(restored.correctBindings);
  report.checks.compositePointerFractureAndV4FileRoundtrip = { fragmentsOnFirstTap: firstCut.stats.fracture.fragments, repeatedGeneration: repeated.stats.fracture.generation, restoredRoles: restored.roles, file: compositeFile };
  await capture('composite-restored');

  await contactSheet([...WORKSHOP_SHAPES].map(id => `shape-${id}`), 'workshop-object-contact-sheet.png');
  await contactSheet(Object.keys(WORKSHOP_SURFACES).map(id => `material-${id}`), 'workshop-material-contact-sheet.png', 5);
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); observe(mobile);
  await mobile.goto(report.url); await mobile.waitForFunction(() => window.rockLab?.ready); await selectShape('vase', mobile);
  const touchCircle = mobile.locator('#lathe-profile [data-profile-point="3"]'); await touchCircle.scrollIntoViewIfNeeded(); const touchBox = await touchCircle.boundingBox();
  const touchBefore = await snapshot(mobile), client = await mobile.context().newCDPSession(mobile);
  const x = touchBox.x + touchBox.width / 2, y = touchBox.y + touchBox.height / 2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 5; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 3, y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForFunction(before => window.rockLab.getStats().generationCount > before, touchBefore.stats.generationCount); await advance(mobile);
  const touchAfter = await snapshot(mobile); assert.notEqual(touchAfter.geometryHash, touchBefore.geometryHash); assert.ok(touchAfter.recipe.options.latheProfile?.length === 6);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Narrow UI has no horizontal overflow');
  await mobile.screenshot({ path: path.join(output, 'lathe-profile-mobile-touch.png') }); await client.detach(); await mobile.close();
  report.checks.mobileTouchProfile = { profile: touchAfter.recipe.options.latheProfile, changedGeometry: true };
  assert.deepEqual(report.errors, []); assert.deepEqual(await sourceHashes(), report.sourceHashes, 'QA must run against one frozen source revision'); report.passed = true;
  console.log(JSON.stringify({ passed: true, objects: Object.keys(report.objects).length, materials: Object.keys(report.materials).length, checks: Object.keys(report.checks), errors: report.errors, output }, null, 2));
} catch (error) { report.passed = false; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
