import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const project = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(project, 'output', 'tooltips');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const report = { url: process.env.ROCK_LAB_URL || 'http://127.0.0.1:5207/', checks: {}, errors };
const observe = page => {
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
};
const visibleTip = page => page.locator('.parameter-tooltip:not([hidden])');
async function ensureTip(page, text) {
  await visibleTip(page).waitFor({ state: 'visible' });
  assert.equal(await visibleTip(page).count(), 1, 'Exactly one visual tooltip is open');
  if (text) assert.match(await visibleTip(page).textContent(), text);
  const bounds = await visibleTip(page).boundingBox();
  const view = page.viewportSize();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= view.width + 1 && bounds.y + bounds.height <= view.height + 1, 'Tooltip stays within the viewport');
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  observe(page); await page.goto(report.url); await page.waitForFunction(() => window.rockLab?.ready);
  const coverage = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('label, legend')].filter(label => !label.closest('button,[role="button"],[role="tab"],summary'));
    const missing = labels.filter(label => !label.querySelector('.parameter-help-label')).map(label => ({ text: label.textContent, for: label.htmlFor }));
    const lostAssociations = labels.filter(label => label.tagName === 'LABEL' && !label.control).map(label => label.textContent);
    const badDescriptions = [...document.querySelectorAll('input:not([type="file"]),select,textarea')].filter(control => {
      const ids = (control.getAttribute('aria-describedby') || '').split(/\s+/);
      return !ids.some(id => document.getElementById(id)?.getAttribute('role') === 'tooltip');
    }).map(control => control.id);
    const actionHelp = document.querySelectorAll('button .parameter-help-label,[role="button"] .parameter-help-label,[role="tab"] .parameter-help-label,button[title],[role="button"][title],[role="tab"][title]').length;
    return { labels: labels.length, tooltips: document.querySelectorAll('[role="tooltip"]').length, missing, lostAssociations, badDescriptions, actionHelp };
  });
  assert.deepEqual(coverage.missing, []); assert.deepEqual(coverage.lostAssociations, []); assert.deepEqual(coverage.badDescriptions, []); assert.equal(coverage.actionHelp, 0);
  report.checks.coverage = coverage;

  await page.locator('label[for="displacement"] .parameter-help-label').hover();
  await ensureTip(page, /actual mesh vertices/);
  const tipBox = await visibleTip(page).boundingBox();
  await page.mouse.move(tipBox.x + tipBox.width / 2, tipBox.y + tipBox.height / 2);
  await page.waitForTimeout(200); await ensureTip(page, /actual mesh vertices/);
  await page.screenshot({ path: path.join(output, 'desktop-label-help.png') });
  await page.keyboard.press('Escape'); assert.equal(await visibleTip(page).count(), 0);
  report.checks.hoverableAndEscape = true;

  const seedLabel = page.locator('label[for="seed"] .parameter-help-label');
  await seedLabel.focus(); await ensureTip(page, /repeatable shape variation/);
  assert.equal(await page.evaluate(() => document.activeElement.closest('label')?.htmlFor), 'seed');
  await page.keyboard.press('Escape'); assert.equal(await visibleTip(page).count(), 0);
  await page.keyboard.press('Space'); await ensureTip(page);
  await page.keyboard.press('Space'); assert.equal(await visibleTip(page).count(), 0);
  await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'seed');
  report.checks.keyboardLabelFocusAndControlTabOrder = true;

  await page.locator('#tab-material').click();
  await page.locator('[data-material-family="optical"]').click(); await page.locator('[data-surface="quartz"]').click();
  await page.locator('label[for="attenuationDistance"] .parameter-help-label').hover();
  await ensureTip(page, /Lower values create stronger color/);
  await page.locator('#tab-fracture').click();
  await page.locator('#fr-method').selectOption('slice');
  await page.locator('label[for="fr-sliceNormal-x"] .parameter-help-label').hover();
  await ensureTip(page, /X component/);
  const errorPreservation = await page.locator('#fr-sliceNormal-x').getAttribute('aria-describedby');
  assert.ok(errorPreservation.split(/\s+/).includes('fr-sliceNormal-error'));
  await page.locator('#fr-sliceNormal-x').fill('0'); await page.locator('#fr-sliceNormal-y').fill('0'); await page.locator('#fr-sliceNormal-z').fill('0'); await page.locator('#fr-sliceNormal-z').blur();
  assert.equal(await page.locator('#fr-sliceNormal-x').getAttribute('aria-invalid'), 'true');
  assert.match(await page.locator('#fr-sliceNormal-error').textContent(), /non-zero/);
  await page.locator('fieldset').filter({ has: page.locator('#fr-sliceNormal-x') }).locator('legend .parameter-help-label').focus();
  await ensureTip(page, /perpendicular to the slice plane/);
  await page.screenshot({ path: path.join(output, 'fracture-vector-help.png') });
  report.checks.opticalAndVectorHelpPreservesValidation = true;

  // Discover controls added after initialization. Existing ARIA error/note
  // tokens and live text edits must survive enhancement and later cleanup.
  await page.mouse.move(1400, 20);
  await page.evaluate(() => {
    const field = document.createElement('div'); field.id = 'tooltip-dynamic-fixture';
    field.innerHTML = '<label for="qa-dynamic" data-parameter-help="Lower values make this test quieter; higher values increase its intensity.">Dynamic parameter</label><input id="qa-dynamic" aria-describedby="qa-note" type="range"><p id="qa-note">Existing note</p>';
    document.body.append(field);
  });
  await page.locator('#tooltip-dynamic-fixture .parameter-help-label').waitFor();
  assert.ok((await page.locator('#qa-dynamic').getAttribute('aria-describedby')).includes('qa-note'));
  await page.locator('#tooltip-dynamic-fixture .parameter-help-label').focus(); await ensureTip(page, /test quieter/);
  await page.evaluate(() => document.querySelector('#tooltip-dynamic-fixture').remove());
  await page.waitForTimeout(50); assert.equal(await visibleTip(page).count(), 0);
  assert.equal(await page.locator('[role="tooltip"]').count(), coverage.tooltips);
  const cleanupCheck = await page.evaluate(async () => {
    const { setupParameterTooltips } = await import('/src/tooltips.js');
    const fixture = document.createElement('div'); fixture.innerHTML = '<label for="qa-isolated" data-parameter-help="A custom description.">Isolated parameter</label><input id="qa-isolated" type="number" aria-describedby="old-note">';
    const cleanup = setupParameterTooltips(fixture); // Detached, scoped root.
    const enhanced = !!fixture.querySelector('.parameter-help-label');
    const sameCleanup = cleanup === setupParameterTooltips(fixture);
    fixture.querySelector('input').setAttribute('aria-describedby', `${fixture.querySelector('input').getAttribute('aria-describedby')} added-note`);
    cleanup(); cleanup();
    return { enhanced, sameCleanup, description: fixture.querySelector('input').getAttribute('aria-describedby'), label: fixture.querySelector('label').textContent, children: fixture.querySelector('label').children.length };
  });
  assert.deepEqual(cleanupCheck, { enhanced: true, sameCleanup: true, description: 'old-note added-note', label: 'Isolated parameter', children: 0 });
  report.checks.dynamicDiscoveryAndIdempotentCleanup = true;
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  observe(mobile); await mobile.goto(report.url); await mobile.waitForFunction(() => window.rockLab?.ready);
  await mobile.locator('#tab-studio').tap();
  const turntableLabel = mobile.locator('label').filter({ has: mobile.locator('#rotate') }).locator('.parameter-help-label');
  const before = await mobile.locator('#rotate').isChecked();
  await turntableLabel.tap(); await ensureTip(mobile, /Automatically turns/);
  assert.equal(await mobile.locator('#rotate').isChecked(), before, 'Touching label help must not toggle turntable');
  await mobile.screenshot({ path: path.join(output, 'mobile-touch-help.png') });
  await turntableLabel.tap(); assert.equal(await visibleTip(mobile).count(), 0);
  await mobile.locator('#rotate').tap(); assert.equal(await mobile.locator('#rotate').isChecked(), !before, 'Actual switch remains directly operable');
  await mobile.locator('#tab-fracture').tap();
  const physicsBeforeHelp = await mobile.locator('#fr-enabled').isChecked();
  await mobile.locator('label[for="fr-enabled"] .parameter-help-label').tap(); await ensureTip(mobile, /Enables tapping/);
  assert.equal(await mobile.locator('#fr-enabled').isChecked(), physicsBeforeHelp, 'Help must preserve the current physics setting');
  await mobile.locator('#tab-shape').tap(); assert.equal(await visibleTip(mobile).count(), 0);
  const offUrl = new URL(report.url); offUrl.searchParams.set('fracture', '0');
  await mobile.goto(offUrl.href); await mobile.waitForFunction(() => window.rockLab?.ready);
  await mobile.locator('#tab-fracture').tap();
  await mobile.locator('label[for="fr-enabled"] .parameter-help-label').tap(); await ensureTip(mobile, /Enables tapping/);
  assert.equal(await mobile.locator('#fr-enabled').isChecked(), false, 'Help must not enable disabled physics');
  assert.equal(await mobile.evaluate(() => window.rockLab.fracture), null, 'Help must not initialize a disabled physics controller');
  report.checks.touchDoesNotMutateOrInitializePhysics = true;
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
