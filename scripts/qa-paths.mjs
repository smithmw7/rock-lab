import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { shapes, shapeGroups } from '../src/catalog.js';
import { assertPathDiagnostics, assertNonOverlappingFootprints } from './path-assertions.mjs';

// Actual WebGL captures and user-facing controls. Tests inspect uploaded world
// geometry as well as state so a slider that only changes its label cannot pass.
const project = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(project, 'output', 'paths');
const pathIds = ['steppingStonePath', 'brickPath', 'cobblePath', 'plankPath', 'objectPath'];
const report = { url: process.env.ROCK_LAB_URL || 'http://127.0.0.1:5207/', checks: {}, objects: {}, errors: [], warnings: [] };
await fs.mkdir(output, { recursive: true });
const sourceFiles = ['src/geometry.js', 'src/terrain-geometry.js', 'src/catalog.js', 'src/main.js', 'src/material.js', 'src/path-geometry.js', 'src/path-editor.js'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash('sha256').update(await fs.readFile(path.join(project, file))).digest('hex')])));
report.sourceHashes = await sourceHashes();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage();
function observe(target) {
  target.setDefaultTimeout(45000);
  target.on('pageerror', error => report.errors.push(error.message));
  target.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); if (message.type() === 'warning') report.warnings.push(message.text()); });
}
observe(page);
function browserSnapshot() {
  const lab = window.rockLab, roots = [], allRoots = [];
  lab.scene.traverse(object => { if (object.userData.generated && object.userData.options) allRoots.push(object); });
  lab.scene.traverseVisible(object => { if (object.userData.generated && object.userData.options) roots.push(object); });
  const fractured = lab.fracture?.getStats().enabled;
  const meshes = fractured ? lab.fracture.getMeshes() : roots.flatMap(root => { const meshes = []; root.traverseVisible(object => { if (object.isMesh) meshes.push(object); }); return meshes; });
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const screen = { min: [Infinity, Infinity], max: [-Infinity, -Infinity] };
  let hash = 2166136261, finite = true, bindings = true, triangles = 0;
  const ids = [], roles = {}, patternRanges = [];
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const position = mesh.geometry.attributes.position, point = mesh.position.clone();
    const slot = mesh.userData.materialSlot || 'primary', pair = slot === 'primary' ? { outer: lab.material, inner: lab.innerMaterial } : lab.partMaterials[slot];
    bindings &&= Array.isArray(mesh.material) ? mesh.material[0] === pair.outer && mesh.material[1] === pair.inner : mesh.material === pair.outer;
    ids.push(mesh.geometry.uuid); roles[slot] = (roles[slot] || 0) + 1;
    triangles += (mesh.geometry.index?.count ?? position.count) / 3;
    for (const attribute of Object.values(mesh.geometry.attributes)) for (const value of attribute.array) finite &&= Number.isFinite(value);
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      point.toArray().forEach((value, axis) => { bounds.min[axis] = Math.min(bounds.min[axis], value); bounds.max[axis] = Math.max(bounds.max[axis], value); hash ^= Math.round(value * 1e5); hash = Math.imul(hash, 16777619); });
      point.project(lab.camera);
      [point.x, point.y].forEach((value, axis) => { screen.min[axis] = Math.min(screen.min[axis], value); screen.max[axis] = Math.max(screen.max[axis], value); });
    }
    const pattern = mesh.geometry.attributes.aRockPosition;
    if (pattern) {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pattern.count; i++) [pattern.getX(i), pattern.getY(i), pattern.getZ(i)].forEach((value, axis) => { min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value); });
      patternRanges.push({ slot, dimensions: max.map((value, axis) => value - min[axis]), count: pattern.count });
    }
  }
  bounds.dimensions = bounds.max.map((value, axis) => value - bounds.min[axis]);
  const pathRoot=allRoots.find(root=>root.userData.path);
  return { recipe: lab.recipe(), stats: lab.getStats(), text: JSON.parse(window.render_game_to_text()), roots: roots.length, path: pathRoot?.userData.path ?? null, generatedPathOptions:pathRoot?{pathPoints:pathRoot.userData.options.pathPoints,pathClosed:pathRoot.userData.options.pathClosed}:null, geometryHash: (hash >>> 0).toString(16), bounds, screen, meshes: meshes.length, triangles, finite, bindings, ids, roles, patternRanges };
}
const snapshot = (target = page) => target.evaluate(browserSnapshot);
const advance = async (target = page) => target.evaluate(() => { for (let i = 0; i < 8; i++) window.advanceTime(0); });
const generation = (target = page) => target.evaluate(() => window.rockLab.getStats().generationCount);
async function waitGeneration(before, target = page) { await target.waitForFunction(before => window.rockLab.getStats().generationCount > before, before); await advance(target); }
async function shape(id, target = page) {
  await target.locator('#tab-shape').click(); await target.locator('#shape-search').fill(''); await target.locator('[data-family="all"]').click();
  const before = await generation(target); await target.locator(`#shapes [data-shape="${id}"]`).click(); await waitGeneration(before, target);
}
async function preset(id, target = page) {
  await target.locator('#tab-path').click(); const before = await generation(target);
  await target.locator(`[data-path-style="${id}"]`).click(); await waitGeneration(before, target);
}
async function range(id, value, target = page) {
  const before = await generation(target);
  await target.locator(`#${id}`).evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await waitGeneration(before, target);
}
async function number(id, value, target = page) {
  const before = await generation(target); await target.locator(`#${id}`).fill(String(value)); await target.locator(`#${id}`).press('Tab'); await waitGeneration(before, target);
}
async function changeSelect(id, value, target = page) {
  const before = await generation(target); await target.locator(`#${id}`).selectOption(value); await waitGeneration(before, target);
}
async function check(id, enabled, target = page) {
  const before = await generation(target); await target.locator(`#${id}`).setChecked(enabled); await waitGeneration(before, target);
}
function framed(value, label) {
  assert.ok(value.screen.min.every(v => v >= -1.005) && value.screen.max.every(v => v <= 1.005), `${label}: all asset vertices fit the camera (${JSON.stringify(value.screen)})`);
}
async function capture(name, target = page) { await advance(target); const filename = path.join(output, `${name}.png`); await target.locator('#stage canvas').screenshot({ path: filename }); return filename; }
async function saveFile(name) {
  const pending = page.waitForEvent('download'); await page.locator('#menu-file').click(); await page.locator('#save-recipe').click();
  const download = await pending, filename = path.join(output, name); await download.saveAs(filename); assert.equal(await download.failure(), null); return filename;
}
async function importFile(filename) {
  const before = await generation(); await page.locator('#menu-file').click(); const pending = page.waitForEvent('filechooser'); await page.locator('#load-recipe').click(); await (await pending).setFiles(filename);
  await waitGeneration(before); await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Asset recipe restored');
}
async function pointEdit(action, target = page) {
  const before = await generation(target); await target.locator(`#path-${action}-point`).click(); await waitGeneration(before, target);
}
async function contactSheet(ids) {
  const sheet = await context.newPage(); await sheet.setViewportSize({ width: 1600, height: 1000 });
  const cards = await Promise.all(ids.map(async id => `<figure><img src="data:image/png;base64,${(await fs.readFile(path.join(output, `shape-${id}.png`))).toString('base64')}"><figcaption>${shapes[id]?.label || id}</figcaption></figure>`));
  await sheet.setContent(`<style>body{margin:0;background:#111a22;color:#e7eef3;font:16px system-ui}main{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px}figure{margin:0;background:#1b252e}img{width:100%;height:270px;object-fit:contain;display:block}figcaption{padding:8px 12px}</style><main>${cards.join('')}</main>`);
  await sheet.screenshot({ path: path.join(output, 'terrain-path-contact-sheet.png'), fullPage: true }); await sheet.close();
}

try {
  const terrain = shapeGroups.find(group => group.id === 'terrain')?.shapes || [];
  assert.equal(terrain.length, 16, 'Sixteen actual terrain generators must be catalogued');
  for (const id of pathIds) assert.ok(shapes[id]);
  await page.goto(report.url); await page.waitForFunction(() => window.rockLab?.ready); await page.locator('#sound-toggle').click();
  assert.equal((await snapshot()).recipe.version, 5);
  for (const id of [...terrain, ...pathIds]) {
    await shape(id); const value = await snapshot();
    assert.equal(value.recipe.options.shape, id); assert.ok(value.finite && value.meshes > 0 && value.bindings); assert.ok(Math.abs(value.bounds.min[1]) < .003, `${id} is grounded`); framed(value, id);
    if (pathIds.includes(id)) { assertPathDiagnostics(value.path,value,id); assert.ok(Math.max(value.bounds.dimensions[0], value.bounds.dimensions[2]) > 3.61, `${id} retains path world dimensions`);if(['brickPath','cobblePath'].includes(id))assertNonOverlappingFootprints(value.path.footprints,id); }
    report.objects[id] = { ...value, image: await capture(`shape-${id}`) };
  }
  report.checks.all21ObjectsRendered = true;await contactSheet([...terrain,...pathIds]);
  const geometryResources=()=>page.evaluate(()=>({geometries:window.rockLab.renderer.info.memory.geometries,textures:window.rockLab.renderer.info.memory.textures,programs:window.rockLab.renderer.info.programs.length}));
  const resources={};for(const id of pathIds){await preset(id);resources[id]=await geometryResources();}
  for(let cycle=0;cycle<2;cycle++)for(const id of pathIds){await preset(id);assert.deepEqual(await geometryResources(),resources[id],`${id} does not accumulate renderer resources`);}
  report.checks.pathRegenerationReusesResources=resources;

  await preset('cobblePath');
  await check('pathClosed',true);await pointEdit('remove');await pointEdit('remove');
  const twoPoint=await snapshot();assert.equal(twoPoint.recipe.options.pathPoints.length,2);assert.equal(twoPoint.recipe.options.pathClosed,false);assert.equal(twoPoint.generatedPathOptions.pathClosed,false);assert.ok(await page.locator('#pathClosed').isDisabled());assert.ok(await page.locator('#path-remove-point').isDisabled());
  await page.locator('#path-point').selectOption('1');await number('path-x',twoPoint.recipe.options.pathPoints[0].x);
  const beforeCoincidence=await snapshot();await page.locator('#path-z').fill(String(beforeCoincidence.recipe.options.pathPoints[0].z));await page.locator('#path-z').press('Tab');await advance();
  const afterCoincidence=await snapshot();assert.equal(afterCoincidence.recipe.options.pathPoints.length,2);assert.deepEqual(afterCoincidence.recipe.options.pathPoints,beforeCoincidence.recipe.options.pathPoints);assert.deepEqual(afterCoincidence.generatedPathOptions.pathPoints,afterCoincidence.recipe.options.pathPoints);assert.equal(afterCoincidence.geometryHash,beforeCoincidence.geometryHash);assert.equal(Number(await page.locator('#path-z').inputValue()),afterCoincidence.recipe.options.pathPoints[1].z);
  const beforeRouteReset=await generation();await page.locator('#path-reset-points').click();await waitGeneration(beforeRouteReset);report.checks.twoPointRouteAndCoincidence={closedDisabled:true,minimumTwoPoints:true,rejectedCoincidentEdit:true,generatedRouteMatchesEditor:true};
  assert.equal((await snapshot()).recipe.options.pathPoints.length, 4);
  await pointEdit('add'); assert.equal((await snapshot()).recipe.options.pathPoints.length, 5);
  await page.locator('#path-point').selectOption('1'); await pointEdit('insert'); assert.equal((await snapshot()).recipe.options.pathPoints.length, 6);
  await pointEdit('remove'); assert.equal((await snapshot()).recipe.options.pathPoints.length, 5);
  await page.locator('#path-point').selectOption('2'); await number('path-x', .65); await number('path-z', 1.45);
  assert.equal(Number(await page.locator('#path-x').inputValue()), .65); assert.equal(Number(await page.locator('#path-z').inputValue()), 1.45);
  let marker = page.locator('#path-editor [data-path-point="2"]'); await marker.focus(); const keyboardBefore = await snapshot(); await page.keyboard.press('ArrowRight'); await waitGeneration(keyboardBefore.stats.generationCount);
  const keyboardAfter = await snapshot(); assert.notEqual(keyboardAfter.geometryHash, keyboardBefore.geometryHash); assert.notDeepEqual(keyboardAfter.recipe.options.pathPoints, keyboardBefore.recipe.options.pathPoints);
  const box = await marker.boundingBox(), dragBefore = await snapshot();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 14, box.y + box.height / 2 - 10, { steps: 6 }); await page.mouse.up(); await waitGeneration(dragBefore.stats.generationCount);
  const edited = await snapshot(); assert.notEqual(edited.geometryHash, dragBefore.geometryHash); framed(edited, 'Edited path');
  await page.screenshot({ path: path.join(output, 'path-editor-desktop.png') }); report.checks.desktopMultipointEditing = { points: edited.recipe.options.pathPoints, keyboard: true, mouse: true, addInsertRemove: true, numericXZ: true };

  const controls = [['pathWidth', 2.3], ['pathSpacing', .22], ['pathPieceSize', .72], ['pathThickness', .25], ['pathJitter', .7], ['pathOffset', .5], ['pathSmoothness', .35]];
  report.checks.pathControls = {};
  for (const [id, value] of controls) {
    const before = await snapshot(); await range(id, value); const after = await snapshot();
    assert.equal(after.recipe.options[id], value); assert.notEqual(after.geometryHash, before.geometryHash, `${id} changes world geometry`); assert.ok(after.finite); framed(after, id);
    assertNonOverlappingFootprints(after.path.footprints,`Edited cobbles ${id}`);
    report.checks.pathControls[id] = { meshes: after.meshes, geometryHash: after.geometryHash };
  }
  const seedBefore = await snapshot(), firstSeed = seedBefore.recipe.options.seed;
  await page.locator('#tab-shape').click();
  await number('seed', 92841); const seedAfter = await snapshot(); assert.notEqual(seedAfter.geometryHash, seedBefore.geometryHash);
  await number('seed', firstSeed); assert.equal((await snapshot()).geometryHash, seedBefore.geometryHash); report.checks.seedDeterminism = true;await page.locator('#tab-path').click();
  await check('pathClosed', true); const closed = await snapshot(); assert.ok(closed.finite); framed(closed, 'Closed path'); assertNonOverlappingFootprints(closed.path.footprints,'Closed cobbles'); await capture('closed-cobble-path'); await check('pathClosed', false);
  await preset('plankPath');const rotationBefore=await snapshot();await range('pathRotation',.65);assert.notEqual((await snapshot()).geometryHash,rotationBefore.geometryHash);report.checks.pathControls.pathRotation={shape:'plankPath',changesGeometry:true};

  await preset('objectPath'); await changeSelect('pathObject', 'hammer'); await range('pathObjectScale', .38);
  const composite = await snapshot(); assert.ok(composite.roles.primary > 0 && composite.roles.handle > 0 && composite.roles.trim > 0 && composite.bindings);
  await check('pathAlign', false); const unaligned = await snapshot(); await check('pathAlign', true); const aligned = await snapshot(); assert.notEqual(unaligned.geometryHash, aligned.geometryHash); framed(aligned, 'Composite object path');
  await page.locator('#tab-material').click(); assert.ok(await page.locator('#material-slot').isVisible()); await page.locator('#material-slot').selectOption('handle'); await page.locator('#material-inner').click();
  await page.locator('[data-material-family="wood"]').click(); await page.locator('[data-surface="walnut"]').click(); await advance();
  assert.equal((await snapshot()).recipe.partMaterials.handle.inner.surface, 'walnut'); await capture('mixed-material-hammer-path'); report.checks.genericObjectParts = { roles: composite.roles, independentInner: true, alignment: true };
  const stored = await snapshot(), recipeFile = await saveFile('path-and-materials-v5.json'); assert.deepEqual(JSON.parse(await fs.readFile(recipeFile, 'utf8')), stored.recipe);
  await shape('boulder'); await importFile(recipeFile); assert.deepEqual((await snapshot()).recipe, stored.recipe); report.checks.v5NativeFileRoundtrip = true;
  const legacy = structuredClone(stored.recipe); legacy.version = 4; legacy.options.shape = 'hammer';
  for (const key of Object.keys(legacy.options)) if (key.startsWith('path')) delete legacy.options[key];
  const legacyFile = path.join(output, 'legacy-v4-parts.json'); await fs.writeFile(legacyFile, JSON.stringify(legacy)); await importFile(legacyFile);
  const migrated = await snapshot(); assert.equal(migrated.recipe.options.shape, 'hammer'); assert.equal(migrated.recipe.version, 5); assert.deepEqual(migrated.recipe.partMaterials, legacy.partMaterials); assert.equal(migrated.recipe.options.pathPoints.length, 4); report.checks.v4NativeFileMigration = true;

  const emptyRecipe=structuredClone(migrated.recipe);Object.assign(emptyRecipe.options,{shape:'brickPath',pathPoints:[{x:0,z:0},{x:.05,z:0}],pathWidth:.5,pathPieceSize:1,pathSpacing:1,pathClosed:false});
  const emptyFile=path.join(output,'short-empty-layout-v5.json');await fs.writeFile(emptyFile,JSON.stringify(emptyRecipe));await importFile(emptyFile);await page.locator('#tab-path').click();
  assert.equal((await snapshot()).meshes,0);assert.match(await page.locator('#path-status').innerText(),/no pieces fit/i);
  assert.ok(await page.evaluate(()=>{const camera=window.rockLab.camera;return [...camera.projectionMatrix.elements,...camera.matrixWorld.elements,camera.left,camera.right,camera.top,camera.bottom].every(Number.isFinite)}),'Empty fitted layouts preserve finite camera projection');
  report.checks.emptyShortPathExplained={message:await page.locator('#path-status').innerText(),finiteProjection:true};await importFile(legacyFile);

  const denseRecipe=structuredClone(migrated.recipe);
  Object.assign(denseRecipe.options,{shape:'cobblePath',pathPoints:[{x:-11,z:-11},{x:11,z:-11},{x:11,z:11},{x:-11,z:11}],pathClosed:true,pathWidth:3,pathPieceSize:.25,pathSpacing:.05,pathOffset:0});
  const denseFile=path.join(output,'dense-budget-v5.json');await fs.writeFile(denseFile,JSON.stringify(denseRecipe));await importFile(denseFile);await page.locator('#tab-path').click();
  const dense=await snapshot();assert.equal(dense.path.truncated,true);assertPathDiagnostics(dense.path,dense,'Dense path');assertNonOverlappingFootprints(dense.path.footprints,'Dense cobbles');framed(dense,'Dense world-size path');
  assert.match(await page.locator('#path-status').innerText(),/budget|limit/i);assert.ok(await page.locator('#view-lineup').isDisabled());await capture('dense-world-size-cobble-path');
  await page.locator('#tab-fracture').click();await page.locator('#fr-enabled').check();await page.waitForFunction(()=>window.rockLab.fracture?.getStats().enabled);assert.equal((await snapshot()).recipe.fracture.maxFragments,160);
  await page.locator('#fr-enabled').uncheck();await importFile(legacyFile);report.checks.visibleBudgetAndFractureHeadroom={pieces:dense.meshes,triangles:dense.triangles,maxFragments:160,variationsDisabled:true};

  await shape('smallBlock');await page.locator('#tab-fracture').click();await page.locator('#fr-enabled').check();await page.waitForFunction(()=>window.rockLab.fracture?.getStats().enabled);assert.equal((await snapshot()).recipe.fracture.maxFragments,120);
  await preset('objectPath');if((await snapshot()).recipe.options.pathObject!=='smallBlock')await changeSelect('pathObject','smallBlock');await range('pathObjectScale',.15);await range('pathSpacing',.05);
  for(const [index,point] of [{x:-11,z:-11},{x:11,z:-11},{x:11,z:11},{x:-11,z:11}].entries()){await page.locator('#path-point').selectOption(String(index));if(Number(await page.locator('#path-x').inputValue())!==point.x)await number('path-x',point.x);if(Number(await page.locator('#path-z').inputValue())!==point.z)await number('path-z',point.z);}
  await check('pathClosed',true);const enabledDense=await snapshot();assert.equal(enabledDense.stats.fracture.enabled,true);assert.equal(enabledDense.meshes,128);assert.equal(enabledDense.recipe.fracture.maxFragments,160);assert.equal(enabledDense.stats.fracture.sourcePieces,128);assert.ok(enabledDense.bindings&&enabledDense.finite);
  report.checks.alreadyEnabledDensePathBudget={before:120,after:160,sourcePieces:128};await page.locator('#tab-fracture').click();await page.locator('#fr-enabled').uncheck();await importFile(legacyFile);

  await preset('plankPath'); const planks = await snapshot();
  assert.equal(planks.patternRanges.length, planks.meshes, 'Every board locks its local material coordinates');
  assert.ok(planks.patternRanges.every(part => part.dimensions[1] > part.dimensions[2]), 'Board grain axis follows its long local axis');
  await page.locator('#tab-fracture').click(); await page.locator('#fr-method').selectOption('simple');
  for (const [id, value] of [['fr-fragmentCount', 2], ['fr-gravity', 0], ['fr-impulse', 0]]) await page.locator(`#${id}`).evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await page.locator('#fr-enabled').check(); await page.waitForFunction(() => window.rockLab.fracture?.getStats().enabled); await page.locator('#fr-pause').click();
  const beforeTap = await snapshot();
  const hit = await page.evaluate(() => {
    const lab = window.rockLab, meshes = lab.fracture.getMeshes();
    const mesh = meshes[Math.floor(meshes.length / 2)]; mesh.geometry.computeBoundingSphere(); mesh.updateWorldMatrix(true, false);
    const point = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).project(lab.camera), rect = lab.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  });
  await page.mouse.click(hit.x, hit.y); await page.waitForFunction(() => window.rockLab.fracture.getStats().generation === 1 && !window.rockLab.fracture.getStats().busy);
  const broken = await snapshot(); assert.equal(broken.stats.fracture.fragments, 2); assert.equal(broken.meshes, beforeTap.meshes + 1); assert.ok(broken.bindings && broken.finite); await capture('plank-path-pointer-fracture');
  await page.locator('#fr-reset').click(); await page.waitForFunction(() => window.rockLab.fracture.getStats().generation === 0); const reset = await snapshot(); assert.equal(reset.meshes, beforeTap.meshes); assert.equal(reset.geometryHash, beforeTap.geometryHash); report.checks.onePiecePointerFractureAndReset = { originalMeshes: beforeTap.meshes, fragments: broken.stats.fracture.fragments };

  await contactSheet([...terrain, ...pathIds]); await page.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); observe(mobile);
  await mobile.goto(report.url); await mobile.waitForFunction(() => window.rockLab?.ready); await preset('brickPath', mobile);
  const touchCircle = mobile.locator('#path-editor [data-path-point="1"]'); await touchCircle.scrollIntoViewIfNeeded(); const touchBox = await touchCircle.boundingBox();
  const touchBefore = await snapshot(mobile), client = await mobile.context().newCDPSession(mobile);
  const x = touchBox.x + touchBox.width / 2, y = touchBox.y + touchBox.height / 2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 5; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 3, y: y - i * 2 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await waitGeneration(touchBefore.stats.generationCount, mobile);
  const touchAfter = await snapshot(mobile); assert.notEqual(touchAfter.geometryHash, touchBefore.geometryHash); assert.notDeepEqual(touchAfter.recipe.options.pathPoints, touchBefore.recipe.options.pathPoints); framed(touchAfter, 'Mobile edited path');
  await mobile.locator('#path-add-point').tap(); await mobile.waitForFunction(() => window.rockLab.state.pathPoints.length === 5); await advance(mobile);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await mobile.screenshot({ path: path.join(output, 'path-editor-mobile-touch.png') });
  report.checks.mobileTouchPathEditing = { points: (await snapshot(mobile)).recipe.options.pathPoints, changedGeometry: true, noHorizontalOverflow: true }; await client.detach(); await mobile.close();
  assert.deepEqual(report.errors, []); assert.deepEqual(await sourceHashes(), report.sourceHashes, 'One frozen source revision must cover the complete run'); report.passed = true;
  console.log(JSON.stringify({ passed: true, objects: Object.keys(report.objects).length, checks: Object.keys(report.checks), errors: report.errors, warnings: report.warnings, output }, null, 2));
} catch (error) { report.passed = false; report.failure = error.stack; if (!page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
