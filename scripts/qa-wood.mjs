import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { WORKSHOP_MATERIAL_DEFAULTS, WORKSHOP_MATERIAL_FIELDS, WORKSHOP_MATERIAL_RANGES, WORKSHOP_SURFACES, WOOD_PATTERNS } from '../src/workshop-materials.js';
import { WOOD_CATALOG } from '../src/wood-geometry.js';

// Separate Chrome session, real controls, pointer hits, downloads and file
// chooser imports. Manual frame advancement makes pixel comparisons repeatable;
// this is material QA, not a replacement for natural-frame settling tests.
const project = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(project, 'output', 'wood');
await fs.mkdir(output, { recursive: true });
const report = { url: process.env.ROCK_LAB_URL || 'http://127.0.0.1:5207/', checks: {}, captures: {}, errors: [], warnings: [] };
const sourceFiles = ['src/material.js', 'src/wood-shader.js', 'src/wood-geometry.js', 'src/workshop-materials.js', 'src/workshop-geometry.js', 'src/main.js', 'src/geometry.js', 'src/fracture-material.js'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash('sha256').update(await fs.readFile(path.join(project, file))).digest('hex')])));
report.sourceHashes = await sourceHashes();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(60000);
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); if (message.type() === 'warning') report.warnings.push(message.text()); });
const newKeys = ['woodVariation', 'woodSpiral', 'woodCracks', 'woodBark', 'woodRelief'];
const woodValues = source => Object.fromEntries(WORKSHOP_MATERIAL_FIELDS.wood.map(key => [key, source[key]]));
let targetSlot = 'primary', targetSide = 'outer';

async function advance(ms = 0) {
  await page.evaluate(ms => { window.advanceTime(ms); for (let i = 0; i < 20; i++) window.advanceTime(0); }, ms);
}
async function snapshot() {
  return page.evaluate(() => {
    const lab = window.rockLab, roots = [], meshes = [];
    if (lab.fracture?.getStats().enabled) meshes.push(...lab.fracture.getMeshes());
    else { lab.scene.traverseVisible(object => { if (object.userData.generated) roots.push(object); }); for (const root of roots) root.traverseVisible(object => { if (object.isMesh) meshes.push(object); }); }
    let signature = 2166136261, finite = true;
    const records = meshes.map(mesh => {
      for (const attribute of Object.values(mesh.geometry.attributes)) for (const value of attribute.array) { finite &&= Number.isFinite(value); signature = Math.imul(signature ^ Math.round(value * 1e5), 16777619); }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      return { id: mesh.uuid, geometry: mesh.geometry.uuid, materials: materials.map(material => material.uuid), slot: mesh.userData.materialSlot || 'primary', generation: mesh.userData.generation || 0, position: mesh.position.toArray(), quaternion: mesh.quaternion.toArray(), groups: mesh.geometry.groups, stablePattern: mesh.geometry.userData.fractureSurface?.stablePattern };
    });
    return { recipe: lab.recipe(), stats: lab.getStats(), finite, geometryHash: (signature >>> 0).toString(16), meshes: records,
      memory: { geometries: lab.renderer.info.memory.geometries, textures: lab.renderer.info.memory.textures, programs: lab.renderer.info.programs.length } };
  });
}
function assertStableResources(before, after, label) {
  assert.equal(after.stats.generationCount, before.stats.generationCount, `${label}: no regeneration`);
  assert.deepEqual(after.meshes.map(mesh => [mesh.id, mesh.geometry, mesh.materials]), before.meshes.map(mesh => [mesh.id, mesh.geometry, mesh.materials]), `${label}: same meshes, geometry and materials`);
  assert.deepEqual(after.memory, before.memory, `${label}: no GPU resource churn`);
  assert.ok(after.finite, `${label}: finite uploaded attributes`);
}
function selectedState(recipe, slot = targetSlot, side = targetSide) { return slot === 'primary' ? (side === 'outer' ? recipe.options : recipe.innerMaterial) : recipe.partMaterials[slot][side]; }
async function selectShape(id) {
  await page.locator('#tab-shape').click(); await page.locator('#shape-search').fill(''); await page.locator('[data-family="all"]').click();
  const count = (await snapshot()).stats.generationCount;
  await page.locator(`#shapes [data-shape="${id}"]`).click();
  await page.waitForFunction(({ id, count }) => window.rockLab.state.shape === id && window.rockLab.getStats().generationCount > count, { id, count });
  targetSlot = 'primary'; targetSide = 'outer'; await advance();
}
async function selectTarget(slot = 'primary', side = 'outer') {
  await page.locator('#tab-material').click();
  if (await page.locator('#material-slot-row').isVisible()) await page.locator('#material-slot').selectOption(slot);
  else assert.equal(slot, 'primary');
  await page.locator(`[data-material-target="${side}"]`).click(); targetSlot = slot; targetSide = side;
}
async function selectSurface(surface, slot = 'primary', side = 'outer') {
  await selectTarget(slot, side);
  await page.locator(`[data-material-family="${WORKSHOP_SURFACES[surface].family}"]`).click();
  await page.locator(`[data-surface="${surface}"]`).click(); await advance();
}
async function range(key, value) {
  await page.locator(`#${key}`).evaluate((input, next) => { input.value = String(next); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await advance();
  if (WORKSHOP_MATERIAL_FIELDS.wood.includes(key)) assert.equal(selectedState((await snapshot()).recipe)[key], value, `${targetSlot}.${targetSide}.${key} follows the actual control`);
}
async function pattern(id) {
  await page.locator('#woodPattern').selectOption(id); await advance();
  assert.equal(await page.locator('#woodPattern').inputValue(), id);
  assert.deepEqual(woodValues(selectedState((await snapshot()).recipe)), WOOD_PATTERNS[id].options);
}
async function capture(name) {
  await advance();
  const result = await page.evaluate(name => {
    const source = window.rockLab.renderer.domElement, canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0); const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    (window.__woodPixels ||= {})[name] = { pixels, width: canvas.width, height: canvas.height };
    let hash = 2166136261; for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
    return { width: canvas.width, height: canvas.height, hash: (hash >>> 0).toString(16), png: canvas.toDataURL('image/png').split(',')[1] };
  }, name);
  const file = path.join(output, `${name}.png`); await fs.writeFile(file, Buffer.from(result.png, 'base64')); delete result.png;
  report.captures[name] = { ...result, file }; return report.captures[name];
}
async function difference(first, second) {
  return page.evaluate(([first, second]) => {
    const a = window.__woodPixels[first], b = window.__woodPixels[second];
    if (a.width !== b.width || a.height !== b.height) throw Error('Pixel capture dimensions differ');
    let changedPixels = 0, changedAssetPixels = 0, sum = 0;
    for (let i = 0; i < a.pixels.length; i += 4) {
      const d = Math.abs(a.pixels[i] - b.pixels[i]) + Math.abs(a.pixels[i + 1] - b.pixels[i + 1]) + Math.abs(a.pixels[i + 2] - b.pixels[i + 2]); sum += d;
      if (d > 8) { changedPixels++; const x = (i / 4) % a.width, y = Math.floor(i / 4 / a.width); if (x > a.width * .12 && x < a.width * .88 && y > a.height * .1 && y < a.height * .88) changedAssetPixels++; }
    }
    return { changedPixels, changedAssetPixels, meanChannelDifference: sum / (a.width * a.height * 3) };
  }, [first, second]);
}
async function seed(value) {
  const count = (await snapshot()).stats.generationCount;
  await page.locator('#seed').fill(String(value)); await page.locator('#seed').blur();
  await page.waitForFunction(({ value, count }) => window.rockLab.state.seed === value && window.rockLab.getStats().generationCount > count, { value, count }); await advance();
}
async function saveFile(name) {
  const expected = (await snapshot()).recipe, event = page.waitForEvent('download');
  await page.locator('#menu-file').click(); await page.locator('#save-recipe').click(); const download = await event;
  const file = path.join(output, `${name}.json`); await download.saveAs(file); assert.equal(await download.failure(), null);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), expected, `${name}: actual downloaded JSON`); return { file, expected };
}
async function importFile(file) {
  const count = (await snapshot()).stats.generationCount;
  await page.locator('#menu-file').click(); const event = page.waitForEvent('filechooser'); await page.locator('#load-recipe').click(); await (await event).setFiles(file);
  await page.waitForFunction(count => document.querySelector('#toast').textContent === 'Asset recipe restored' && window.rockLab.getStats().generationCount > count, count);
  targetSlot = 'primary'; targetSide = 'outer'; await advance();
}
async function tapHandle(generation) {
  const point = await page.evaluate(generation => {
    const lab = window.rockLab, meshes = lab.fracture.getMeshes(), ray = lab.sceneEditor.getTransformControls().getRaycaster(), rect = lab.renderer.domElement.getBoundingClientRect();
    const candidates = meshes.filter(mesh => mesh.userData.materialSlot === 'handle' && mesh.userData.generation === generation);
    for (const mesh of meshes) { mesh.updateWorldMatrix(true, false); mesh.geometry.computeBoundingSphere(); }
    candidates.sort((a, b) => b.geometry.boundingSphere.radius - a.geometry.boundingSphere.radius);
    for (const mesh of candidates) {
      const positions = mesh.geometry.attributes.position, points = [mesh.geometry.boundingSphere.center.clone()];
      for (let i = 0; i < positions.count; i += Math.max(1, Math.floor(positions.count / 32))) points.push(mesh.position.clone().fromBufferAttribute(positions, i));
      for (const p of points) {
        p.applyMatrix4(mesh.matrixWorld).project(lab.camera); const x = rect.left + (p.x + 1) * rect.width / 2, y = rect.top + (1 - p.y) * rect.height / 2;
        if (x < rect.left + 10 || x > rect.right - 10 || y < rect.top + 10 || y > rect.bottom - 10) continue;
        ray.setFromCamera({ x: p.x, y: p.y }, lab.camera);
        if (ray.intersectObjects(meshes, false)[0]?.object === mesh) return { x, y, id: mesh.uuid };
      }
    }
    throw Error(`No visible generation ${generation} handle fragment can receive a pointer hit`);
  }, generation);
  const before = (await snapshot()).stats.fracture.generation; await page.mouse.click(point.x, point.y);
  await page.waitForFunction(before => window.rockLab.fracture.getStats().generation > before && !window.rockLab.fracture.getStats().busy, before); await advance(); return point;
}
async function contactSheet(names, filename, columns = 5) {
  const sheet = await context.newPage(); await sheet.setViewportSize({ width: 1800, height: 1100 });
  const cards = await Promise.all(names.map(async name => `<figure><img src="data:image/png;base64,${(await fs.readFile(report.captures[name].file)).toString('base64')}"><figcaption>${name}</figcaption></figure>`));
  await sheet.setContent(`<html><style>body{margin:0;background:#111a22;color:#e7eef3;font:15px system-ui}main{display:grid;grid-template-columns:repeat(${columns},1fr);gap:8px;padding:8px}figure{margin:0;background:#1b252e}img{width:100%;height:300px;object-fit:contain;display:block}figcaption{padding:8px 12px}</style><main>${cards.join('')}</main></html>`);
  await sheet.screenshot({ path: path.join(output, filename), fullPage: true }); await sheet.close();
}

try {
  assert.equal(Object.keys(WOOD_PATTERNS).length, 5); assert.equal(Object.keys(WOOD_CATALOG).length, 5);
  for (const key of newKeys) assert.deepEqual(WORKSHOP_MATERIAL_RANGES[key], [0, 1]);
  await page.goto(report.url); await page.waitForFunction(() => window.rockLab?.ready && window.rockLab.partMaterials);
  await page.evaluate(() => { window.rockLab.renderer.setAnimationLoop(null); window.rockLab.audio.setMuted(true); });
  await page.locator('#tab-fracture').click(); await page.locator('#fr-enabled').uncheck();
  await page.waitForFunction(() => !window.rockLab.fracture?.getStats().enabled); await advance();

  report.checks.forms = {};
  for (const [id, entry] of Object.entries(WOOD_CATALOG)) {
    await selectShape(id); const state = await snapshot(); assert.ok(state.finite && state.meshes.length > 0); assert.equal(state.recipe.options.surface, entry.defaultSurface);
    report.checks.forms[id] = { geometryHash: state.geometryHash, meshes: state.meshes.length, capture: await capture(`shape-${id}`) };
  }
  report.checks.recipes = {};
  for (const shape of ['wornPlank', 'barkLog', 'hammer']) {
    await selectShape(shape); await selectSurface('oak', shape === 'hammer' ? 'handle' : 'primary');
    const original = await snapshot(), captures = [];
    for (const id of Object.keys(WOOD_PATTERNS)) {
      await pattern(id); const after = await snapshot(); assertStableResources(original, after, `${shape} ${id}`);
      const name = `${shape}-${id}`; captures.push(await capture(name));
    }
    assert.equal(new Set(captures.map(capture => capture.hash)).size, 5, `${shape}: all five recipes have distinct rendered output`);
    report.checks.recipes[shape] = captures.map(capture => capture.hash);
  }

  await selectShape('wornPlank'); await selectSurface('oak'); await range('normalStrength', 1); await range('noiseAmount', .65); await range('detail', 1);
  report.checks.controlPixels = {};
  const cases = [['woodGrainScale', .7, 4.5], ['woodGrainStrength', 0, 1], ['woodKnots', 0, 1], ['woodWarmth', 0, 1], ...newKeys.map(key => [key, 0, 1])];
  for (const [key, low, high] of cases) {
    await pattern('storybook'); const before = await snapshot();
    await range(key, low); await capture(`${key}-low`); await range(key, high); await capture(`${key}-high`);
    const pixels = await difference(`${key}-low`, `${key}-high`); assert.ok(pixels.changedAssetPixels > 25, `${key} changes visible asset pixels: ${JSON.stringify(pixels)}`);
    assertStableResources(before, await snapshot(), key); report.checks.controlPixels[key] = pixels;
  }
  await range('woodSpiral', .13); assert.equal(await page.locator('#woodPattern').inputValue(), 'custom');
  const resources = await snapshot();
  for (let i = 0; i < 3; i++) for (const id of Object.keys(WOOD_PATTERNS)) await pattern(id);
  assertStableResources(resources, await snapshot(), 'Repeated grain recipe changes'); report.checks.resourceReuse = resources.memory;

  await page.locator('#tab-shape').click(); await seed(49107); const first = await snapshot(); await capture('seed-49107-first');
  await seed(49108); const second = await snapshot(); await capture('seed-49108');
  await seed(49107); const repeat = await snapshot(); await capture('seed-49107-repeat');
  assert.equal(first.geometryHash, repeat.geometryHash); assert.equal(report.captures['seed-49107-first'].hash, report.captures['seed-49107-repeat'].hash, 'Same seed renders identically after another seed');
  assert.notEqual(first.geometryHash, second.geometryHash); assert.ok((await difference('seed-49107-first', 'seed-49108')).changedAssetPixels > 25);
  report.checks.seedDeterminism = { seed: 49107, geometryHash: first.geometryHash, pixelHash: report.captures['seed-49107-first'].hash };

  await selectSurface('oak', 'primary', 'outer'); await pattern('storybook'); await range('woodVariation', .31);
  const outer = woodValues(selectedState((await snapshot()).recipe));
  await selectSurface('walnut', 'primary', 'inner'); await pattern('split'); await range('woodBark', .63);
  assert.deepEqual(woodValues((await snapshot()).recipe.options), outer, 'Inner grain edits leave outer grain unchanged');
  const separate = await saveFile('outer-inner-wood'); await pattern('natural'); await importFile(separate.file);
  assert.deepEqual((await snapshot()).recipe, separate.expected); report.checks.outerInnerFileRoundtrip = true;

  await selectShape('hammer');
  await selectSurface('brushedSteel', 'primary', 'outer'); await selectSurface('iron', 'primary', 'inner');
  await selectSurface('oak', 'handle', 'outer'); await pattern('storybook'); await range('woodVariation', .27);
  await selectSurface('walnut', 'handle', 'inner'); await pattern('split'); await range('woodBark', .47);
  await selectSurface('brass', 'trim', 'outer'); await selectSurface('copper', 'trim', 'inner');
  const composite = await saveFile('composite-wood');
  await selectSurface('oak', 'handle'); await pattern('natural'); await importFile(composite.file);
  assert.deepEqual((await snapshot()).recipe, composite.expected); report.checks.compositeFileRoundtrip = true;

  // Legacy JSON must receive the same defaults as the existing normalizer:
  // primary/inner use global defaults; saved part species retain their defaults.
  const legacy = structuredClone(composite.expected); legacy.version = 5; delete legacy.scene; delete legacy.workspaceMode; legacy.fracture.enabled = false;
  for (const source of [legacy.options, legacy.innerMaterial, ...Object.values(legacy.partMaterials).flatMap(pair => [pair.outer, pair.inner])]) for (const key of newKeys) delete source[key];
  const legacyFile = path.join(output, 'legacy-wood-missing-fields.json'); await fs.writeFile(legacyFile, JSON.stringify(legacy)); await importFile(legacyFile);
  const loadedLegacy = (await snapshot()).recipe;
  for (const key of newKeys) {
    assert.equal(loadedLegacy.options[key], WORKSHOP_MATERIAL_DEFAULTS[key]); assert.equal(loadedLegacy.innerMaterial[key], WORKSHOP_MATERIAL_DEFAULTS[key]);
    for (const pair of Object.values(loadedLegacy.partMaterials)) for (const side of ['outer', 'inner']) assert.equal(pair[side][key], WORKSHOP_SURFACES[pair[side].surface]?.defaults?.[key] ?? WORKSHOP_MATERIAL_DEFAULTS[key]);
  }
  report.checks.legacyDefaults = true; await importFile(composite.file);

  await page.locator('#tab-fracture').click(); await page.locator('#fr-method').selectOption('simple');
  await range('fr-fragmentCount', 3); await range('fr-gravity', 0); await range('fr-impulse', 1.8);
  await page.locator('#fr-enabled').check(); await page.waitForFunction(() => window.rockLab.fracture?.getStats().enabled); await advance();
  const hit = await tapHandle(0), firstCut = await snapshot();
  assert.ok(firstCut.meshes.filter(mesh => mesh.generation > 0).every(mesh => mesh.slot === 'handle'));
  assert.ok(firstCut.meshes.filter(mesh => mesh.generation > 0).length >= 2);
  assert.ok(firstCut.meshes.filter(mesh => mesh.generation > 0).every(mesh => mesh.stablePattern && mesh.materials.length === 2 && mesh.groups.some(group => group.materialIndex === 1)), 'Wood fragments retain stable grain coordinates and distinct cut-face groups');
  await advance(220); await capture('handle-fracture');
  await selectTarget('handle', 'outer'); const beforeEdit = await snapshot(); await capture('handle-outer-before'); await range('woodSpiral', .08); await range('woodCracks', .9); await range('woodRelief', .8); await capture('handle-outer-after');
  const afterEdit = await snapshot(); assertStableResources(beforeEdit, afterEdit, 'Outer handle edits after fracture');
  const outerPixels = await difference('handle-outer-before', 'handle-outer-after'); assert.ok(outerPixels.changedAssetPixels > 12, 'Outer wood edits change already fractured handle pixels');
  assert.deepEqual(afterEdit.recipe.options, beforeEdit.recipe.options); assert.deepEqual(afterEdit.recipe.innerMaterial, beforeEdit.recipe.innerMaterial); assert.deepEqual(afterEdit.recipe.partMaterials.trim, beforeEdit.recipe.partMaterials.trim); assert.deepEqual(afterEdit.recipe.partMaterials.handle.inner, beforeEdit.recipe.partMaterials.handle.inner);
  await selectTarget('handle', 'inner'); await range('woodBark', 0); await range('woodSpiral', 0); const beforeInner = await snapshot(); await capture('handle-inner-before');
  await range('woodBark', 1); await range('woodSpiral', 1); await range('woodVariation', .94); await capture('handle-inner-after'); const afterInner = await snapshot();
  assertStableResources(beforeInner, afterInner, 'Inner handle edits after fracture'); assert.deepEqual(afterInner.recipe.partMaterials.handle.outer, beforeInner.recipe.partMaterials.handle.outer);
  const innerPixels = await difference('handle-inner-before', 'handle-inner-after'); assert.ok(innerPixels.changedAssetPixels > 12, 'Inner wood edits change exposed handle cut-face pixels');
  await advance(100); const moving = await snapshot();
  assert.notDeepEqual(moving.meshes.filter(mesh => mesh.generation > 0).map(mesh => [mesh.position, mesh.quaternion]), afterInner.meshes.filter(mesh => mesh.generation > 0).map(mesh => [mesh.position, mesh.quaternion]), 'Debris continues moving after live grain edits');
  const repeatHit = await tapHandle(1); const recut = await snapshot(); assert.ok(recut.finite); assert.equal(recut.stats.fracture.failures, 0); await capture('handle-fracture-edited-recut');
  const fracturedFile = await saveFile('fractured-handle-edits'); await importFile(fracturedFile.file); const restored = await snapshot();
  assert.deepEqual(restored.recipe, fracturedFile.expected); assert.equal(restored.stats.fracture.fragments, 0); assert.equal(restored.stats.fracture.generation, 0);
  report.checks.pointerHandleFractureAndLiveEdits = { hit, repeatHit, firstFragments: firstCut.stats.fracture.fragments, repeatGeneration: recut.stats.fracture.generation, outerPixels, innerPixels, restoredWholeObject: true };

  await page.locator('#tab-fracture').click(); await page.locator('#fr-enabled').uncheck();
  await selectShape('wornPlank'); await selectSurface('oak'); await pattern('storybook');
  await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('visible'));
  const labelCoverage = await page.locator('#wood-controls-panel').evaluate(panel => {
    const labels = [...panel.querySelectorAll('label')];
    return { labels: labels.length, missing: labels.filter(label => !label.control || !label.querySelector('.parameter-help-label')).map(label => label.textContent), buttonTooltips: panel.querySelectorAll('button[title],button .parameter-help-label').length };
  });
  assert.equal(labelCoverage.labels, 10); assert.deepEqual(labelCoverage.missing, []); assert.equal(labelCoverage.buttonTooltips, 0);
  for (const [name, width, height] of [['desktop', 1440, 1000], ['narrow', 390, 920]]) {
    await page.setViewportSize({ width, height }); await advance();
    await page.locator('#woodPattern').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, `wood-controls-${name}.png`) });
    const value = await page.locator('#woodRelief').inputValue();
    await page.locator('#woodPattern').focus();
    await page.locator('label[for="woodRelief"] .parameter-help-label').focus();
    const tooltip = page.locator('.parameter-tooltip:not([hidden])'); await tooltip.waitFor({ state: 'visible' });
    assert.match(await tooltip.textContent(), /normal|shading|silhouette/i);
    const bounds = await tooltip.boundingBox(); assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, `${name}: wood help stays onscreen`);
    assert.equal(await page.locator('#woodRelief').inputValue(), value, 'Opening help preserves its parameter');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no horizontal overflow`);
    await page.screenshot({ path: path.join(output, `wood-relief-help-${name}.png`) }); await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 1440, height: 1000 }); report.checks.woodControlLabelsAndResponsiveHelp = labelCoverage;

  await contactSheet(Object.keys(WOOD_CATALOG).map(id => `shape-${id}`), 'wood-shape-contact-sheet.png');
  await contactSheet(['wornPlank', 'barkLog', 'hammer'].flatMap(shape => Object.keys(WOOD_PATTERNS).map(id => `${shape}-${id}`)), 'wood-pattern-contact-sheet.png');
  await contactSheet(cases.flatMap(([key]) => [`${key}-low`, `${key}-high`]), 'wood-controls-contact-sheet.png', 4);
  assert.deepEqual(report.errors, [], 'No browser or shader errors'); assert.deepEqual(await sourceHashes(), report.sourceHashes, 'Run QA against one frozen source revision');
  report.passed = true; console.log(JSON.stringify({ passed: true, checks: Object.keys(report.checks), captures: Object.keys(report.captures).length, errors: report.errors, warnings: report.warnings, output }, null, 2));
} catch (error) { report.passed = false; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
