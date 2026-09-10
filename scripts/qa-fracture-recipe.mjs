import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Checks the actual download and file-picker paths, plus pointer gesture routing.
// Uses a separate Chrome session and never connects to the user's browser.
const project = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(project, 'output', 'fracture-recipe');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
const browserErrors = [];
page.on('pageerror', error => browserErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
const report = { url: process.env.ROCK_LAB_URL || 'http://127.0.0.1:5207/', checks: {} };

async function importFile(filename, expectedSeed) {
  await page.locator('#menu-file').click();
  const chooserEvent = page.waitForEvent('filechooser');
  await page.locator('#load-recipe').click();
  const chooser = await chooserEvent;
  await chooser.setFiles(filename);
  await page.waitForFunction(seed => window.rockLab.state.seed === seed, expectedSeed);
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Asset recipe restored');
}
async function snapshot() {
  return page.evaluate(() => ({ recipe: window.rockLab.recipe(), stats: window.rockLab.getStats().fracture }));
}
async function rangeValue(selector, value) {
  await page.locator(selector).evaluate((input, next) => {
    input.value = next;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, String(value));
}
async function pieceScreenPosition() {
  return page.evaluate(() => {
    const lab = window.rockLab;
    const mesh = lab.fracture.getMeshes()[0];
    mesh.updateWorldMatrix(true, false);
    mesh.geometry.computeBoundingSphere();
    const point = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).project(lab.camera);
    const rect = lab.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  });
}

try {
  await page.goto(report.url);
  await page.waitForFunction(() => window.rockLab?.ready);
  await page.locator('#tab-material').click();
  await page.locator('[data-material-target="outer"]').click();
  await page.locator('[data-surface="basalt"]').click();
  await page.locator('[data-material-target="inner"]').click();
  await page.locator('[data-surface="ice"]').click();
  await page.locator('#tab-fracture').click();
  await page.locator('#fr-method').selectOption('simple');
  await rangeValue('#fr-fragmentCount', 6);
  await page.locator('#fr-seed').fill('12345');
  await page.locator('#fr-seed').blur();
  await page.locator('#fr-break').click();
  await page.waitForFunction(() => window.rockLab.fracture?.getStats().fragments > 0 && !window.rockLab.fracture.getStats().busy);
  const beforeExport = await snapshot();
  assert.equal(beforeExport.recipe.options.surface, 'basalt');
  assert.equal(beforeExport.recipe.innerMaterial.surface, 'ice');
  assert.equal(beforeExport.recipe.fracture.method, 'simple');
  assert.equal(beforeExport.recipe.fracture.fragmentCount, 6);
  assert.equal(beforeExport.recipe.fracture.seed, 12345);
  assert.equal(beforeExport.recipe.fracture.enabled, true);
  assert.ok(beforeExport.stats.fragments > 0);
  await page.locator('#menu-file').click();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#save-recipe').click();
  const download = await downloadEvent;
  const actualExport = path.join(output, 'actual-export-v4.json');
  await download.saveAs(actualExport);
  assert.equal(await download.failure(), null);
  const exportedText = await fs.readFile(actualExport, 'utf8');
  const exported = JSON.parse(exportedText);
  assert.deepEqual(exported, beforeExport.recipe);
  report.download = {
    file: actualExport,
    suggestedFilename: download.suggestedFilename(),
    bytes: Buffer.byteLength(exportedText),
    sha256: createHash('sha256').update(exportedText).digest('hex'),
    fragmentsWhenSaved: beforeExport.stats.fragments,
  };

  await page.locator('#tab-studio').click();
  await page.locator('#reset').click();
  const changed = await snapshot();
  assert.notEqual(changed.recipe.options.surface, exported.options.surface);
  assert.notEqual(changed.recipe.innerMaterial.surface, exported.innerMaterial.surface);
  assert.notEqual(changed.recipe.fracture.method, exported.fracture.method);
  await importFile(actualExport, exported.options.seed);
  await page.waitForFunction(() => window.rockLab.fracture?.getStats().enabled);
  const restored = await snapshot();
  assert.deepEqual(restored.recipe, exported);
  assert.equal(restored.stats.fragments, 0);
  assert.equal(restored.stats.generation, 0);
  assert.equal(restored.stats.meshes, restored.stats.sourcePieces);
  report.checks.v4DownloadAndFilePickerRoundtrip = { passed: true, restored };

  const dragStart = await pieceScreenPosition();
  const cameraBefore = await page.evaluate(() => window.rockLab.camera.position.toArray());
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 94, dragStart.y + 24, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const afterDrag = await snapshot();
  const cameraAfter = await page.evaluate(() => window.rockLab.camera.position.toArray());
  assert.equal(afterDrag.stats.fragments, 0);
  assert.equal(afterDrag.stats.generation, 0);
  assert.notDeepEqual(cameraAfter, cameraBefore);
  const tapPoint = await pieceScreenPosition();
  await page.mouse.click(tapPoint.x, tapPoint.y);
  await page.waitForFunction(() => window.rockLab.fracture.getStats().fragments > 0 && !window.rockLab.fracture.getStats().busy);
  const afterTap = await snapshot();
  assert.equal(afterTap.stats.generation, 1);
  assert.ok(afterTap.stats.fragments > 0);
  report.checks.orbitVersusTap = { passed: true, cameraMoved: true, fragmentsAfterDrag: afterDrag.stats.fragments, fragmentsAfterTap: afterTap.stats.fragments };
  await page.screenshot({ path: path.join(output, 'v4-roundtrip-tap.png') });

  const v1 = { generator: 'procedural-rock-lab', version: 1, options: { seed: 34151, shape: 'slab', surface: 'ice', facets: .45, roughness: .35, bevel: .6, snow: .4, detail: .55, contrast: .7, lighting: 'soft' } };
  const v2 = { generator: 'procedural-rock-lab', version: 2, options: { seed: 48172, shape: 'wall', surface: 'granite', facets: .32, roughness: .16, bevel: .64, displacement: .13, geometryNoiseScale: 2.5, noiseScale: 3.7, noiseAmount: .61, normalStrength: .52, materialRoughness: .72, snow: 0, detail: .48, contrast: .62, lighting: 'sunset', ground: 'concrete', reflection: .41, groundWetness: .23, groundScale: 1.4, mapView: 'beauty' } };
  const v3 = { generator:'procedural-rock-lab',version:3,options:{...v2.options,seed:53914,shape:'chair',surface:'desert'},innerMaterial:{surface:'obsidian',tint:'#6e79ad',tintAmount:.3,materialRoughness:.18},fracture:{method:'simple',fragmentCount:7,enabled:false} };
  for (const fixture of [v1, v2, v3]) {
    const filename = path.join(output, `compatibility-fixture-v${fixture.version}.json`);
    await fs.writeFile(filename, `${JSON.stringify(fixture, null, 2)}\n`);
    await importFile(filename, fixture.options.seed);
    const loaded = await snapshot();
    for (const [key, value] of Object.entries(fixture.options)) assert.equal(loaded.recipe.options[key], value, `v${fixture.version} option ${key}`);
    assert.equal(loaded.recipe.version, 4);
    assert.equal(loaded.recipe.innerMaterial.surface, fixture.innerMaterial?.surface??'limestone');
    for(const [key,value] of Object.entries(fixture.innerMaterial??{}))assert.equal(loaded.recipe.innerMaterial[key],value);
    assert.equal(loaded.recipe.fracture.method, fixture.fracture?.method??'voronoi');
    assert.equal(loaded.recipe.options.latheProfile,null);
    assert.equal(loaded.recipe.options.hammerHead,'club');
    assert.equal(loaded.recipe.partMaterials.handle.outer.surface,'oak');
    assert.equal(loaded.recipe.partMaterials.trim.outer.surface,'brass');
    assert.equal(loaded.recipe.fracture.enabled, false);
    assert.equal(loaded.stats.fragments, 0);
    report.checks[`v${fixture.version}Compatibility`] = { passed: true, fixture: filename, restored: loaded };
  }
  assert.deepEqual(browserErrors, []);
  report.browserErrors = browserErrors;
  report.passed = true;
  await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: true, checks: Object.keys(report.checks), download: report.download, output }, null, 2));
} catch (error) {
  report.passed = false;
  report.error = error.message;
  report.browserErrors = browserErrors;
  await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
