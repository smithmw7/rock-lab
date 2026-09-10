import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Independent, real-browser checks. Screenshots are actual WebGL output; the
// contact sheet only arranges those captures for review. Never uses the user's
// browser or changes app modules.
const project = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(project, 'output', 'object-library');
const newShapes = [
  'smallBlock', 'mediumBlock', 'largeBlock', 'lowRamp', 'steepRamp', 'cornerRamp', 'platform',
  'roundArch', 'pointedArch', 'flatArch', 'bridge', 'roundColumn', 'squareColumn', 'brokenColumn', 'plinth', 'doorway',
  'bench', 'table', 'chair', 'stool',
];
const familyCounts = { all: 38, natural: 6, primitives: 13, structures: 6, architecture: 9, furniture: 4 };
const report = { url: process.env.ROCK_LAB_URL || 'http://127.0.0.1:5207/', checks: {}, shapes: {}, browserErrors: [], warnings: [] };
const sourceFiles = ['src/geometry.js', 'src/kit-geometry.js', 'src/catalog.js', 'src/library.js', 'src/main.js'];
async function sourceHashes() {
  return Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash('sha256').update(await fs.readFile(path.join(project, file))).digest('hex')])));
}
report.sourceHashes = await sourceHashes();
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
function watch(page) {
  page.on('pageerror', error => report.browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') report.browserErrors.push(message.text());
    if (message.type() === 'warning') report.warnings.push(message.text());
  });
}
watch(page);

function browserSnapshot({ fractured = false, aperture = false } = {}) {
  const lab = window.rockLab;
  const roots = [];
  lab.scene.traverseVisible(object => { if (object.userData.generated && object.userData.options) roots.push(object); });
  const meshes = fractured ? lab.fracture.getMeshes() : roots.flatMap(root => {
    const items = []; root.traverseVisible(object => { if (object.isMesh) items.push(object); }); return items;
  });
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], triangles = [];
  let vertices = 0, finite = true, signature = 2166136261;
  const hash = value => { signature ^= Math.round(value * 100000); signature = Math.imul(signature, 16777619); };
  const rootData = roots.map(root => {
    let value = 2166136261;
    root.traverse(object => {
      if (!object.isMesh) return;
      for (const key of ['position', 'aFaceTone', 'aBevel']) {
        const attribute = object.geometry.attributes[key];
        if (attribute) for (const n of attribute.array) { value ^= Math.round(n * 100000); value = Math.imul(value, 16777619); }
      }
    });
    return { seed: root.userData.options.seed, shape: root.userData.options.shape, chunks: root.userData.chunks, signature: (value >>> 0).toString(16) };
  });
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const positions = mesh.geometry.attributes.position, index = mesh.geometry.index;
    const world = [];
    const point = mesh.position.clone();
    for (let i = 0; i < positions.count; i++) {
      mesh.localToWorld(point.set(positions.getX(i), positions.getY(i), positions.getZ(i)));
      const xyz = point.toArray();
      finite &&= xyz.every(Number.isFinite);
      for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], xyz[axis]); max[axis] = Math.max(max[axis], xyz[axis]); hash(xyz[axis]); }
      world.push(xyz); vertices++;
    }
    if (aperture) for (let i = 0, count = index?.count ?? positions.count; i < count; i += 3) {
      triangles.push([0, 1, 2].map(offset => world[index ? index.getX(i + offset) : i + offset]));
    }
  }
  // A z-directed ray tested against actual transformed triangles. This ignores
  // the ground and does not mistake mesh bounding boxes for filled geometry.
  function blocked(x, y) {
    return triangles.some(([a, b, c]) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1];
      const determinant = ux * vy - uy * vx;
      if (Math.abs(determinant) < 1e-9) return false;
      const px = x - a[0], py = y - a[1];
      const u = (px * vy - py * vx) / determinant, v = (ux * py - uy * px) / determinant;
      return u > 0.00001 && v > 0.00001 && u + v < 0.99999;
    });
  }
  const width = max[0] - min[0], height = max[1] - min[1], cx = (min[0] + max[0]) / 2;
  return {
    shape: lab.state.shape, seed: lab.state.seed, roots: rootData, meshes: meshes.length, vertices, finite,
    bounds: { min, max, dimensions: max.map((n, i) => n - min[i]) }, signature: (signature >>> 0).toString(16),
    stats: lab.getStats(), textState: JSON.parse(window.render_game_to_text()),
    aperture: aperture ? {
      center: [0.20, 0.32, 0.44].map(y => ({ heightFraction: y, blocked: blocked(cx, min[1] + height * y) })),
      supports: [-0.40, 0.40].map(x => ({ widthFraction: x, blocked: blocked(cx + width * x, min[1] + height * 0.15) })),
    } : null,
  };
}
const snapshot = options => page.evaluate(browserSnapshot, options);
async function range(selector, value, target = page) {
  await target.locator(selector).evaluate((element, value) => { element.value = String(value); element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
async function selectShape(id, target = page) {
  await target.locator('#tab-shape').click();
  await target.locator('#shape-search').fill('');
  await target.locator('[data-family="all"]').click();
  const previous = await target.evaluate(() => window.rockLab.getStats().generationCount);
  await target.locator(`#shapes [data-shape="${id}"]`).click();
  await target.waitForFunction(({ id, previous }) => window.rockLab.state.shape === id && window.rockLab.getStats().generationCount > previous, { id, previous });
  await target.waitForTimeout(120);
}
async function fileMenu(item) { await page.locator('#menu-file').click(); await page.locator(item).click(); }
async function piecePoint() {
  return page.evaluate(() => {
    const lab = window.rockLab, mesh = lab.fracture.getMeshes()[0];
    mesh.updateWorldMatrix(true, false); mesh.geometry.computeBoundingSphere();
    const point = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).project(lab.camera);
    const rect = lab.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  });
}

async function createContactSheet() {
  // Arrange the real canvas captures; no substitute or generated asset visuals.
  const sheet = await context.newPage();
  const cards = [];
  for (const id of newShapes) {
    const data = await fs.readFile(path.join(output, `${id}.png`));
    cards.push(`<figure><img src="data:image/png;base64,${data.toString('base64')}"/><figcaption>${id}</figcaption></figure>`);
  }
  await sheet.setViewportSize({ width: 1600, height: 1800 });
  await sheet.setContent(`<html><head><style>body{margin:0;background:#111a22;color:#e9edf2;font:18px system-ui}main{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px}figure{margin:0;background:#17212a}img{display:block;width:100%;height:305px;object-fit:contain}figcaption{height:34px;padding:4px 14px}</style></head><body><main>${cards.join('')}</main></body></html>`);
  await sheet.screenshot({ path: path.join(output, 'all-new-shapes-contact-sheet.png'), fullPage: true });
  await sheet.close();
}


try {
  await page.goto(report.url);
  await page.waitForFunction(() => window.rockLab?.ready);
  assert.equal(await page.locator('[data-family="all"]').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#shapes [data-shape]').count(), 38);
  await page.locator('#sound-toggle').click();

  for (const id of newShapes) {
    await selectShape(id);
    const data = await snapshot({ aperture: ['roundArch', 'pointedArch', 'flatArch', 'doorway', 'bridge'].includes(id) });
    assert.equal(data.shape, id); assert.equal(data.textState.shape, id);
    assert.equal(data.roots.length, 1); assert.equal(data.roots[0].shape, id);
    assert.ok(data.finite && data.vertices > 24 && data.meshes >= 1, `${id} must have finite rendered geometry`);
    assert.ok(data.bounds.dimensions.every(value => value > .1), `${id} must be three-dimensional`);
    assert.ok(Math.abs(data.bounds.min[1]) < .001, `${id} must sit on the ground`);
    assert.equal(await page.locator(`[data-shape="${id}"]`).getAttribute('aria-pressed'), 'true');
    const filename = path.join(output, `${id}.png`);
    await page.locator('#stage canvas').screenshot({ path: filename });
    const bytes = await fs.readFile(filename);
    assert.ok(bytes.length > 20000, `${id} screenshot should contain a rendered object`);
    report.shapes[id] = { ...data, screenshot: `${id}.png`, pngSha256: createHash('sha256').update(bytes).digest('hex') };
  }
  await createContactSheet();
  assert.equal(new Set(Object.values(report.shapes).map(shape => shape.pngSha256)).size, 20);
  report.checks.allNewShapesRender = { passed: true, count: 20, actualCanvasCaptures: 20 };
  const dimensions = ['smallBlock', 'mediumBlock', 'largeBlock'].map(id => report.shapes[id].bounds.dimensions);
  for (let axis = 0; axis < 3; axis++) assert.ok(dimensions[0][axis] < dimensions[1][axis] * .8 && dimensions[1][axis] < dimensions[2][axis] * .8, 'Size presets must differ in actual world geometry');
  report.checks.blockDimensions = { passed: true, small: dimensions[0], medium: dimensions[1], large: dimensions[2] };
  for (const id of ['roundArch', 'pointedArch', 'flatArch', 'doorway', 'bridge']) {
    const result = report.shapes[id].aperture;
    assert.ok(result.center.some(ray => !ray.blocked), `${id} needs a real open aperture`);
    assert.ok(result.supports.every(ray => ray.blocked), `${id} needs supports on both sides`);
  }
  report.checks.apertures = { passed: true, shapes: ['roundArch', 'pointedArch', 'flatArch', 'doorway', 'bridge'] };

  report.checks.filters = {};
  for (const [family, count] of Object.entries(familyCounts)) {
    await page.locator(`[data-family="${family}"]`).click();
    assert.equal(await page.locator('#shapes [data-shape]').count(), count);
    report.checks.filters[family] = { passed: true, count };
  }
  await page.locator('[data-family="all"]').click();
  await page.locator('#shape-search').fill('stool');
  assert.equal(await page.locator('#shapes [data-shape]').count(), 1);
  assert.equal(await page.locator('#shapes [data-shape]').getAttribute('data-shape'), 'stool');
  await page.locator('#shapes [data-shape="stool"]').click();
  assert.equal((await snapshot()).shape, 'stool');
  await page.locator('#clear-shape-search').click();
  assert.equal(await page.locator('#shape-search').inputValue(), '');
  await page.locator('#shape-search').fill('no-such-object-qa-937');
  assert.equal(await page.locator('#shapes [data-shape]').count(), 0);
  assert.equal(await page.locator('#shape-empty').isVisible(), true);
  await page.screenshot({ path: path.join(output, 'search-empty.png') });
  await page.locator('#reset-shape-filters').click();
  assert.equal(await page.locator('#shape-search').inputValue(), '');
  assert.equal(await page.locator('#shapes [data-shape]').count(), 38);
  report.checks.search = { passed: true, lastItemFound: 'stool', clearWorks: true, emptyStateAndReset: true };

  const list = page.locator('#shapes');
  const listRect = await list.boundingBox();
  await list.hover(); await page.mouse.wheel(0, 2200); await page.waitForTimeout(150);
  assert.ok(await list.evaluate(element => element.scrollTop > 0), 'Long list must actually scroll');
  await page.locator('#seed').scrollIntoViewIfNeeded();
  await page.locator('#seed').fill('53821'); await page.locator('#seed').press('Tab');
  await page.waitForFunction(() => window.rockLab.state.seed === 53821);
  report.checks.scrollAndSeed = { passed: true, listHeight: listRect.height, seed: 53821 };
  await page.locator('#shapes [data-shape]').first().focus();
  const beforeFocusNavigation = await page.evaluate(() => ({ shape: window.rockLab.state.shape, generations: window.rockLab.getStats().generationCount }));
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.shape), 'stool');
  assert.deepEqual(await page.evaluate(() => ({ shape: window.rockLab.state.shape, generations: window.rockLab.getStats().generationCount })), beforeFocusNavigation, 'Focus navigation must not regenerate or select an object');
  await page.keyboard.press('Enter');
  assert.equal((await snapshot()).shape, 'stool');
  await page.keyboard.press('Home');
  const firstShape = await page.locator('#shapes [data-shape]').first().getAttribute('data-shape');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.shape), firstShape);
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.shape), await page.locator('#shapes [data-shape]').nth(1).getAttribute('data-shape'));
  await page.keyboard.press('Space');
  assert.equal((await snapshot()).shape, await page.evaluate(() => document.activeElement.dataset.shape));
  report.checks.keyboard = { passed: true, keys: ['End', 'Enter', 'Home', 'ArrowDown', 'Space'] };

  await selectShape('chair');
  await page.locator('#seed').fill('58203'); await page.locator('#seed').press('Tab');
  await page.locator('#tab-material').click();
  await page.locator('[data-material-target="outer"]').click();
  await page.locator('[data-surface="desert"]').click();
  await range('#materialRoughness', .61); await range('#noiseAmount', .29);
  await page.locator('[data-material-target="inner"]').click();
  await page.locator('[data-surface="obsidian"]').click();
  const expectedRecipe = await page.evaluate(() => window.rockLab.recipe());
  const downloadEvent = page.waitForEvent('download');
  await fileMenu('#save-recipe');
  const download = await downloadEvent, recipePath = path.join(output, 'chair-recipe.json');
  await download.saveAs(recipePath);
  assert.deepEqual(JSON.parse(await fs.readFile(recipePath, 'utf8')), expectedRecipe);
  await selectShape('smallBlock');
  await page.locator('[data-family="primitives"]').click();
  await page.locator('#shape-search').fill('sphere');
  const chooserEvent = page.waitForEvent('filechooser');
  await fileMenu('#load-recipe');
  await (await chooserEvent).setFiles(recipePath);
  await page.waitForFunction(() => window.rockLab.state.shape === 'chair' && window.rockLab.state.seed === 58203);
  assert.deepEqual(await page.evaluate(() => window.rockLab.recipe()), expectedRecipe);
  assert.equal(await page.locator('#shapes [data-shape="chair"]').isVisible(), true);
  assert.equal(await page.locator('#shapes [data-shape="chair"]').getAttribute('aria-pressed'), 'true');
  report.checks.recipe = { passed: true, shape: 'chair', seed: 58203, outer: 'desert', inner: 'obsidian', filename: download.suggestedFilename(), selectionRevealedAfterHiddenFilter: true };

  await page.locator('#view-lineup').click();
  await page.waitForTimeout(200);
  const lineup = await snapshot();
  assert.equal(lineup.stats.viewMode, 'lineup'); assert.equal(lineup.roots.length, 5);
  assert.equal(new Set(lineup.roots.map(root => root.seed)).size, 5);
  assert.equal(new Set(lineup.roots.map(root => root.signature)).size, 5);
  await page.locator('#stage canvas').screenshot({ path: path.join(output, 'chair-variations.png') });
  report.checks.variations = { passed: true, roots: lineup.roots };
  await page.locator('#view-single').click();

  report.checks.fracture = {};
  for (const shape of ['roundArch', 'chair', 'bridge']) {
    await selectShape(shape);
    await page.locator('#tab-fracture').click();
    await page.locator('#fr-method').selectOption('simple');
    await range('#fr-fragmentCount', 6);
    await page.locator('#fr-enabled').check();
    await page.waitForFunction(() => window.rockLab.fracture?.getStats().enabled && window.rockLab.fracture.getMeshes().length > 0);
    const intact = await snapshot({ fractured: true });
    const point = await piecePoint();
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.rockLab.fracture.getStats().fragments > 0 && !window.rockLab.fracture.getStats().busy, null, { timeout: 45000 });
    const broken = await snapshot({ fractured: true });
    assert.ok(broken.stats.fracture.fragments > 0); assert.ok(broken.finite);
    await page.locator('#stage canvas').screenshot({ path: path.join(output, `${shape}-fractured.png`) });
    await page.locator('#fr-reset').click();
    await page.waitForFunction(() => window.rockLab.fracture.getStats().fragments === 0);
    const restored = await snapshot({ fractured: true });
    assert.equal(restored.signature, intact.signature, `${shape} reset restores exact source geometry and transforms`);
    assert.equal(restored.meshes, intact.meshes);
    assert.equal(restored.stats.fracture.generation, 0);
    report.checks.fracture[shape] = { passed: true, sourcePieces: intact.meshes, fragments: broken.stats.fracture.fragments, restoredSignature: restored.signature };
    await page.locator('#fr-enabled').uncheck();
  }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage(); watch(mobile);
  await mobile.goto(report.url); await mobile.waitForFunction(() => window.rockLab?.ready);
  await mobile.locator('#tab-shape').tap();
  const mobileList = mobile.locator('#shapes'); await mobileList.scrollIntoViewIfNeeded();
  const box = await mobileList.boundingBox();
  const cdp = await mobileContext.newCDPSession(mobile);
  const startY = box.y + box.height - 30, endY = box.y + 30, x = box.x + box.width * .6;
  const beforeScroll = await mobileList.evaluate(element => element.scrollTop);
  for (let swipe = 0; swipe < 4; swipe++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: startY + (endY - startY) * step / 8 }] });
      await mobile.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await mobile.waitForTimeout(100);
  }
  const afterScroll = await mobileList.evaluate(element => element.scrollTop);
  assert.ok(afterScroll > beforeScroll, 'A real touch swipe should scroll the mobile object list');
  await mobile.locator('#shape-search').fill('stool');
  await mobile.locator('[data-shape="stool"]').tap();
  await mobile.waitForFunction(() => window.rockLab.state.shape === 'stool');
  await mobile.screenshot({ path: path.join(output, 'mobile-search-stool.png') });
  await mobile.locator('#clear-shape-search').tap();
  await mobile.locator('[data-family="furniture"]').tap();
  assert.equal(await mobile.locator('#shapes [data-shape]').count(), 4);
  await mobile.locator('[data-shape="chair"]').tap();
  await mobile.locator('#seed').fill('27419'); await mobile.locator('#seed').blur();
  await mobile.waitForFunction(() => window.rockLab.state.shape === 'chair' && window.rockLab.state.seed === 27419);
  const layout = await mobile.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, selected: window.rockLab.state.shape, seed: window.rockLab.state.seed }));
  assert.ok(layout.documentWidth <= layout.viewport, 'Mobile layout must not overflow horizontally');
  await mobile.screenshot({ path: path.join(output, 'mobile-furniture-controls.png') });
  report.checks.mobile = { passed: true, actualTouchSwipes: 4, beforeScroll, afterScroll, ...layout };
  await mobileContext.close();

  assert.deepEqual(report.browserErrors, []);
  assert.deepEqual(await sourceHashes(), report.sourceHashes, 'App source must remain unchanged during the browser capture run');
  report.checks.stableSource = { passed: true, files: sourceFiles.length };
  report.passed = true;
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: true, checks: Object.keys(report.checks), captures: 20, output, warnings: [...new Set(report.warnings)] }, null, 2));
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally { await browser.close(); }
