import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const project = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(project, 'output', 'publication');
const remoteUrl = process.env.ROCK_LAB_URL;
const mode = remoteUrl ? 'remote' : 'local';
const report = { mode, checks: {}, responses: [], requestFailures: [], workers: [], errors: [], forbiddenRequests: [] };
await fs.mkdir(output, { recursive: true });
let server, browser, page;

async function serveBuild() {
  const directory = path.join(project, 'dist');
  await fs.access(path.join(directory, 'index.html'));
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wav': 'audio/wav', '.wasm': 'application/wasm', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (!pathname.startsWith('/rock-lab/')) { response.writeHead(404); response.end('Outside nested project path'); return; }
      let filename = path.resolve(directory, pathname.slice('/rock-lab/'.length) || 'index.html');
      if (!filename.startsWith(`${directory}${path.sep}`)) { response.writeHead(403); response.end(); return; }
      if ((await fs.stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
      const contents = await fs.readFile(filename);
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(contents);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}/rock-lab/`;
}

try {
  report.url = remoteUrl || await serveBuild();
  const origin = new URL(report.url).origin;
  const prefix = new URL(report.url).pathname.replace(/\/?$/, '/');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  context.on('response', response => report.responses.push({ url: response.url(), status: response.status(), type: response.request().resourceType() }));
  context.on('requestfailed', request => report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  context.on('request', request => { if (/\/audio\/private\/|reference\.png|refart|^file:/i.test(request.url())) report.forbiddenRequests.push(request.url()); });
  page.on('worker', worker => report.workers.push(worker.url()));
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  const navigation = await page.goto(report.url);
  assert.equal(navigation.status(), 200);
  await page.waitForFunction(() => window.rockLab?.ready && window.rockLab.audio.getState().loaded === 16);
  await page.evaluate(() => document.fonts.ready);
  // Let shader compilation and the initial FPS window settle before capturing
  // the unmodified studio UI for the social preview.
  await page.waitForTimeout(1500);
  const initial = await page.evaluate(() => ({ audio: window.rockLab.audio.getState(), shape: window.rockLab.state.shape, stats: window.rockLab.getStats() }));
  assert.equal(initial.audio.library, 'public');
  assert.equal(initial.audio.expected, 16); assert.equal(initial.audio.failed, 0);
  assert.equal(initial.audio.playCount, 0);
  assert.equal(initial.stats.fracture.enabled, true, 'The published app starts with tap destruction enabled');
  assert.equal(await page.locator('#looks [data-look]').count(), 56);
  assert.equal(await page.locator('#looks button').first().getAttribute('id'), 'random-look');
  assert.equal(await page.locator('#grounds [data-ground]').count(), 12);
  assert.equal(await page.locator('#lighting option').count(), 8);
  assert.equal(await page.locator('#reference, #reference-dialog, button[title]').count(), 0);
  report.checks.publicBuildReady = { passed: true, library: initial.audio.library, decoded: initial.audio.loaded, shape: initial.shape, geometries: initial.stats.geometries };
  const screenshot = path.join(output, `${mode}-studio.png`);
  await page.screenshot({ path: screenshot });
  report.screenshot = screenshot;
  if (!remoteUrl && process.env.ROCK_LAB_CAPTURE_PREVIEW === '1') {
    const preview = path.join(project, 'public', 'social-preview.png');
    await fs.copyFile(screenshot, preview);
    report.socialPreview = preview;
  }

  await page.locator('#tab-fracture').click();
  await page.locator('#fr-method').selectOption('simple');
  await page.locator('#fr-fragmentCount').evaluate(element => { element.value = '6'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#fr-enabled').check();
  await page.waitForFunction(() => window.rockLab.fracture?.getStats().enabled);
  // With default-on destruction, the first viewport gesture unlocks audio.
  const point = await page.evaluate(() => {
    const lab = window.rockLab, mesh = lab.fracture.getMeshes()[0];
    mesh.updateWorldMatrix(true, false); mesh.geometry.computeBoundingSphere();
    const center = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).project(lab.camera);
    const rect = lab.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (center.x + 1) * rect.width / 2, y: rect.top + (1 - center.y) * rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => window.rockLab.fracture.getStats().fragments > 0 && !window.rockLab.fracture.getStats().busy && window.rockLab.audio.getState().eventCounts.break > 0, null, { timeout: 20000 });
  const broken = await page.evaluate(() => ({ fracture: window.rockLab.fracture.getStats(), audio: window.rockLab.audio.getState() }));
  assert.equal(broken.audio.contextState, 'running');
  assert.equal(broken.audio.library, 'public');
  assert.ok(broken.audio.lastEvents.some(event => event.type === 'break' && event.family === 'rock'));
  report.checks.productionTap = { passed: true, fragments: broken.fracture.fragments, worker: broken.fracture.worker, breakEvent: broken.audio.lastEvents.find(event => event.type === 'break') };
  await page.screenshot({ path: path.join(output, `${mode}-destruction.png`) });
  await page.locator('#fr-reset').click();
  await page.waitForFunction(() => window.rockLab.fracture.getStats().fragments === 0 && window.rockLab.audio.getState().eventCounts.restore > 0);
  const reset = await page.evaluate(() => ({ fracture: window.rockLab.fracture.getStats(), audio: window.rockLab.audio.getState() }));
  report.checks.productionReset = { passed: true, fragments: reset.fracture.fragments, restoreEvents: reset.audio.eventCounts.restore };

  const recipe = await page.evaluate(() => window.rockLab.recipe());
  await page.locator('#menu-file').click();
  const downloadEvent = page.waitForEvent('download'); await page.locator('#save-recipe').click();
  const download = await downloadEvent, recipeFile = path.join(output, `${mode}-recipe.json`);
  await download.saveAs(recipeFile); assert.equal(await download.failure(), null);
  assert.deepEqual(JSON.parse(await fs.readFile(recipeFile, 'utf8')), recipe);
  report.checks.productionDownload = { passed: true, file: recipeFile, suggestedFilename: download.suggestedFilename() };

  await page.locator('#open-scene-gallery').click();
  const thumbnails = page.locator('[data-scene-preset] img');
  assert.equal(await thumbnails.count(), 8);
  const images = [];
  for (const image of await thumbnails.all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(node => node.decode());
    const preview = await image.evaluate(node => ({ url: node.currentSrc, width: node.naturalWidth, height: node.naturalHeight }));
    assert.equal(preview.width, 640); assert.equal(preview.height, 400);
    assert.equal(new URL(preview.url).origin, origin);
    assert.ok(new URL(preview.url).pathname.startsWith(`${prefix}scene-gallery/`));
    images.push(preview);
  }
  await page.locator('[data-scene-preset="alpine-crossing"]').click();
  await page.waitForFunction(() => !document.querySelector('#scene-gallery-dialog').open && window.rockLab.workspaceMode === 'scene');
  assert.equal(await page.evaluate(() => window.rockLab.sceneEditor.getSnapshot().instances), 14);
  await page.locator('#open-scene-gallery').click();
  await page.locator('#restore-previous-scene').click();
  await page.waitForFunction(() => !document.querySelector('#scene-gallery-dialog').open && window.rockLab.workspaceMode === 'object');
  assert.deepEqual(await page.evaluate(() => window.rockLab.recipe()), recipe);
  report.checks.productionGallery = { passed: true, thumbnails: images, loaded: 'alpine-crossing', exactObjectRestore: true };

  await page.locator('#mode-scene').click();
  const sceneBeforeAdd = await page.evaluate(() => window.rockLab.sceneEditor.serialize());
  await page.locator('#scene-add').click();
  const sceneAfterAdd = await page.evaluate(() => window.rockLab.sceneEditor.serialize());
  assert.equal(sceneAfterAdd.objects.length, sceneBeforeAdd.objects.length + 1);
  await page.locator('#scene-undo').click();
  assert.deepEqual(await page.evaluate(() => window.rockLab.sceneEditor.serialize()), sceneBeforeAdd);
  await page.locator('#scene-redo').click();
  assert.deepEqual(await page.evaluate(() => window.rockLab.sceneEditor.serialize()), sceneAfterAdd);
  await page.locator('#scene-position-y').fill('1.25');
  await page.locator('#scene-position-y').press('Enter');
  assert.equal(await page.evaluate(() => window.rockLab.sceneEditor.getSnapshot().selection.position[1]), 1.25);
  await page.locator('[data-scene-tool="select"]').focus();
  await page.keyboard.press('Control+z');
  assert.deepEqual(await page.evaluate(() => window.rockLab.sceneEditor.serialize()), sceneAfterAdd);
  await page.screenshot({ path: path.join(output, `${mode}-scene-undo.png`) });
  report.checks.productionSceneUndo = { passed: true, exactAddUndoRedo: true, numericTransformKeyboardUndo: true };
  await page.locator('#mode-object').click();
  await page.locator('#looks [data-look="alpine"]').click();
  const lookBefore = await page.evaluate(() => ({ ...window.rockLab.state }));
  await page.locator('#looks [data-look="alpine"]').click();
  const lookAfter = await page.evaluate(() => ({ ...window.rockLab.state }));
  assert.notEqual(lookAfter.seed, lookBefore.seed);
  delete lookAfter.seed; delete lookBefore.seed; assert.deepEqual(lookAfter, lookBefore);
  report.checks.productionStudioExpansion = { passed: true, presets: 56, grounds: 12, lighting: 8, repeatPresetChangesOnlySeed: true };

  const assets = report.responses.filter(response => ['script', 'stylesheet'].includes(response.type) || /\.(?:js|css|wav|wasm|webp)(?:\?|$)/i.test(response.url));
  assert.ok(assets.some(asset => asset.url.includes('/assets/index-') && asset.url.endsWith('.js')));
  assert.ok(assets.some(asset => asset.url.includes('/assets/index-') && asset.url.endsWith('.css')));
  assert.ok(assets.some(asset => /\/assets\/rapier-[^/]+\.js/.test(asset.url)), 'Rapier dynamic import must be fetched from the nested deployment');
  assert.ok(assets.some(asset => /\/assets\/fracture-worker-[^/]+\.js/.test(asset.url)), 'Fracture worker must be fetched from the nested deployment');
  assert.ok(report.workers.some(url => /fracture-worker-/.test(url)));
  const wavs = new Set(assets.filter(asset => asset.url.endsWith('.wav')).map(asset => asset.url));
  assert.equal(wavs.size, 16);
  for (const asset of assets) {
    assert.equal(asset.status, 200, `Asset failed: ${asset.url}`);
    if (new URL(asset.url).origin === origin) assert.ok(new URL(asset.url).pathname.startsWith(prefix), `Asset escaped project base path: ${asset.url}`);
  }
  assert.deepEqual(report.forbiddenRequests, []);
  assert.deepEqual(report.requestFailures, []);
  assert.deepEqual(report.errors, []);
  report.checks.assetPaths = { passed: true, prefix, assetRequests: assets.length, publicWavs: wavs.size, workerUrls: report.workers, allStatuses: 200, forbiddenRequests: 0 };
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = error.stack;
  report.failureState = await page?.evaluate(() => window.render_game_to_text?.()).catch(() => null);
  await page?.screenshot({ path: path.join(output, `${mode}-failure.png`) }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  const reportPath = path.join(output, `${mode}-report.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, mode, url: report.url, checks: Object.keys(report.checks), report: reportPath, socialPreview: report.socialPreview, errors: report.errors }, null, 2));
}
