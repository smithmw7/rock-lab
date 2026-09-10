import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');
const files = fs.readdirSync(dist, { recursive: true }).map(String);
assert(!files.some(file => /(^|[/\\])(private|local-assets|reference\.png|\.env)([/\\]|$)/.test(file)), 'Private inputs must never reach Pages');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const assetPaths = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"?#]+)"/g)].map(match => match[1]);
assert(assetPaths.length >= 2, 'Built entry script and stylesheet must use relative paths');
for (const asset of assetPaths) assert(fs.existsSync(path.join(dist, asset)), `Missing ${asset}`);
assert(fs.existsSync(path.join(dist, 'social-preview.png')), 'Public preview image must exist');
const wavs = files.filter(file => file.endsWith('.wav'));
assert.equal(wavs.length, 16, 'Only the sixteen original synthesized sounds should be published');
for (const file of wavs) {
  const data = fs.readFileSync(path.join(dist, file));
  assert.equal(data.toString('ascii', 0, 4), 'RIFF', `Invalid sound: ${file}`);
}
const textFiles = files.filter(file => /\.(html|js|css|json)$/.test(file));
for (const file of textFiles) {
  const text = fs.readFileSync(path.join(dist, file), 'utf8');
  assert(!text.includes('/Users/'), `Local source path leaked in ${file}`);
  assert(!text.includes('audio/private/'), `Private audio URL leaked in ${file}`);
}
console.log(`Publication checks passed: ${assetPaths.length} relative entry assets, ${wavs.length} public WAVs, preview image, no private inputs.`);
