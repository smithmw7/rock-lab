import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const project = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(project, 'output', 'menus');
await fs.mkdir(output, { recursive: true });
const report = { url: process.env.ROCK_LAB_URL || 'http://127.0.0.1:5207/', checks: {}, errors: [], referenceRequests: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
function track(target) {
  target.setDefaultTimeout(45000);
  target.on('pageerror', error => report.errors.push(error.message));
  target.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  target.on('request', request => { if (/reference\.png/.test(request.url())) report.referenceRequests.push(request.url()); });
}
track(page);
const focused = () => page.evaluate(() => document.activeElement.id || document.activeElement.dataset.menuAction);
async function open(menu) { await page.locator(`#menu-${menu}`).click(); assert.equal(await page.locator(`#menu-${menu}`).getAttribute('aria-expanded'), 'true'); }
async function action(menu, name) { await open(menu); await page.locator(`[data-menu-action="${name}"]`).click(); }

try {
  await page.goto(report.url); await page.waitForFunction(() => window.rockLab?.ready);
  assert.equal(await page.locator('#reference, #reference-dialog, img[src*="reference"]').count(), 0);
  assert.equal(await page.locator('button[title], button .parameter-help-label').count(), 0);
  assert.equal(await page.locator('.app-menu-trigger').count(), 3);
  assert.equal(await page.locator('.app-menu-panel:not([hidden])').count(), 0);
  report.checks.header = { passed: true, menus: ['File', 'View', 'Help'], removedReference: true, buttonTooltips: 0 };

  await page.locator('#menu-file').focus(); await page.keyboard.press('ArrowDown');
  assert.equal(await focused(), 'new-seed');
  await page.keyboard.press('ArrowDown'); assert.equal(await focused(), 'load-recipe');
  await page.keyboard.press('End'); assert.equal(await focused(), 'reset');
  await page.keyboard.press('Home'); assert.equal(await focused(), 'new-seed');
  await page.keyboard.press('s'); assert.equal(await focused(), 'save-recipe');
  await page.keyboard.press('ArrowRight'); assert.equal(await focused(), 'single');
  assert.equal(await page.locator('#menu-file').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#menu-view').getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape'); assert.equal(await focused(), 'menu-view');
  await page.keyboard.press('ArrowLeft'); assert.equal(await focused(), 'menu-file');
  await page.keyboard.press('Enter'); assert.equal(await focused(), 'new-seed');
  await page.keyboard.press('Tab'); assert.equal(await focused(), 'sound-toggle');
  assert.equal(await page.locator('.app-menu-panel:not([hidden])').count(), 0);
  await open('file'); await page.locator('.brand').click();
  assert.equal(await page.locator('.app-menu-panel:not([hidden])').count(), 0);
  report.checks.keyboardAndDismissal = { passed: true, tested: ['arrow navigation', 'Home/End', 'typeahead', 'cross-menu arrows', 'Enter', 'Escape focus restoration', 'Tab exit', 'outside pointer'] };

  await page.locator('#seed').fill('87654'); await page.locator('#seed').blur();
  const beforeSave = await page.evaluate(() => window.rockLab.recipe());
  await open('file'); const recipeEvent = page.waitForEvent('download'); await page.locator('#save-recipe').click();
  const recipeDownload = await recipeEvent, recipePath = path.join(output, 'menu-recipe.json');
  await recipeDownload.saveAs(recipePath); assert.equal(await recipeDownload.failure(), null);
  assert.deepEqual(JSON.parse(await fs.readFile(recipePath, 'utf8')), beforeSave);
  assert.equal(await page.locator('#menu-file').getAttribute('aria-expanded'), 'false');
  await page.locator('#seed').fill('11111'); await page.locator('#seed').blur();
  await open('file'); const chooserEvent = page.waitForEvent('filechooser'); await page.locator('#load-recipe').click();
  await (await chooserEvent).setFiles(recipePath);
  await page.waitForFunction(() => window.rockLab.state.seed === 87654 && document.querySelector('#toast').textContent === 'Asset recipe restored');
  assert.deepEqual(await page.evaluate(() => window.rockLab.recipe()), beforeSave);
  report.checks.recipeDownloadAndFilePicker = { passed: true, file: recipePath, restoredSeed: 87654 };
  await open('file'); const imageEvent = page.waitForEvent('download'); await page.locator('#export-png').click();
  const imageDownload = await imageEvent, imagePath = path.join(output, 'menu-export.png');
  await imageDownload.saveAs(imagePath); assert.equal(await imageDownload.failure(), null);
  const png = await fs.readFile(imagePath);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.length > 10000);
  report.checks.imageDownload = { passed: true, file: imagePath, bytes: png.length, width: png.readUInt32BE(16), height: png.readUInt32BE(20) };

  await action('view', 'lineup'); assert.equal(await page.evaluate(() => window.rockLab.getStats().viewMode), 'lineup');
  await open('view'); assert.equal(await page.locator('[data-menu-action="lineup"]').getAttribute('aria-checked'), 'true');
  await page.locator('[data-menu-action="wireframe"]').click();
  assert.equal(await page.evaluate(() => window.rockLab.material.wireframe), true);
  await open('view'); assert.equal(await page.locator('[data-menu-action="wireframe"]').getAttribute('aria-checked'), 'true');
  await page.locator('[data-menu-action="wireframe"]').click();
  await action('view', 'turntable'); assert.equal(await page.locator('#rotate').isChecked(), true);
  await action('view', 'turntable'); assert.equal(await page.locator('#rotate').isChecked(), false);
  await action('view', 'single'); assert.equal(await page.evaluate(() => window.rockLab.getStats().viewMode), 'single');
  await page.evaluate(() => window.rockLab.camera.position.set(4, 9, 12));
  await action('view', 'frame');
  assert.deepEqual(await page.evaluate(() => window.rockLab.camera.position.toArray().map(value => +value.toFixed(5))), [7, 5.1, 8]);
  report.checks.viewActions = { passed: true, tested: ['Variations', 'Single asset', 'Frame asset', 'Turntable', 'Wireframe', 'checked-state synchronization'] };

  await action('help', 'controls'); assert.equal(await page.locator('#help-dialog').isVisible(), true);
  assert.match(await page.locator('#help-dialog').innerText(), /Hover, focus, or tap a parameter label/);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#help-dialog').isVisible(), false);
  assert.equal(await focused(), 'menu-help');
  await action('help', 'guide'); assert.equal(await page.locator('#panel-studio').isVisible(), true);
  assert.equal(await page.locator('#source-link').getAttribute('href'), 'https://github.com/smithmw7/rock-lab');
  await action('file', 'reset'); assert.equal(await page.evaluate(() => window.rockLab.state.seed), 18427);
  await page.locator('#tab-shape').click();
  const seedLabel = page.locator('label[for="seed"] .parameter-help-label');
  await seedLabel.hover();
  assert.equal(await page.locator('.parameter-tooltip:not([hidden])').count(), 1);
  assert.match(await page.locator('.parameter-tooltip:not([hidden])').innerText(), /repeatable shape variation/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.parameter-tooltip:not([hidden])').count(), 0);
  await seedLabel.focus(); assert.equal(await page.locator('.parameter-tooltip:not([hidden])').count(), 1);
  await open('file'); assert.equal(await page.locator('.parameter-tooltip:not([hidden])').count(), 0);
  await page.screenshot({ path: path.join(output, 'desktop-file-menu.png') });
  report.checks.helpAndParameterTooltips = { passed: true, helpDialog: true, guide: true, parameterHoverAndFocus: true, buttonTitles: await page.locator('button[title]').count() };
  await page.close();

  page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, acceptDownloads: true });
  track(page); await page.goto(report.url); await page.waitForFunction(() => window.rockLab?.ready);
  report.checks.mobile = { passed: true, menus: {} };
  for (const menu of ['file', 'view', 'help']) {
    await page.locator(`#menu-${menu}`).tap();
    await page.locator(`#menu-${menu}-items`).waitFor({ state: 'visible' });
    const box = await page.locator(`#menu-${menu}-items`).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, `${menu} menu must fit the mobile viewport`);
    await page.screenshot({ path: path.join(output, `mobile-${menu}-menu.png`) });
    await page.locator('.brand').tap(); assert.equal(await page.locator('.app-menu-panel:not([hidden])').count(), 0);
    report.checks.mobile.menus[menu] = box;
  }
  await page.locator('#menu-view').tap(); await page.locator('[data-menu-action="wireframe"]').tap();
  assert.equal(await page.evaluate(() => window.rockLab.material.wireframe), true);
  await page.locator('#sound-toggle').tap(); assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  await page.locator('#sound-toggle').tap(); assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.locator('#tab-shape').tap();
  await page.locator('label[for="seed"] .parameter-help-label').tap();
  assert.equal(await page.locator('.parameter-tooltip:not([hidden])').count(), 1);
  const tooltip = await page.locator('.parameter-tooltip:not([hidden])').boundingBox();
  assert.ok(tooltip.x >= 0 && tooltip.x + tooltip.width <= 390);
  await page.screenshot({ path: path.join(output, 'mobile-parameter-help.png') });
  await page.locator('label[for="seed"] .parameter-help-label').tap();
  assert.equal(await page.locator('.parameter-tooltip:not([hidden])').count(), 0);
  report.checks.mobile.touchActions = ['menu open/dismiss', 'wireframe', 'mute/unmute', 'parameter help pin/dismiss'];
  assert.equal(await page.locator('button[title], button .parameter-help-label').count(), 0);
  assert.deepEqual(report.referenceRequests, []); assert.deepEqual(report.errors, []);
  report.passed = true;
  await fs.rm(path.join(output, 'failure.png'), { force: true });
} catch (error) {
  report.passed = false; report.failure = error.stack;
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, checks: Object.keys(report.checks), errors: report.errors, output }, null, 2));
}
