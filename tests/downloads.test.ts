import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { buildZip, fileStem } from '../src/core/downloads';

test('ZIP preserves bytes for equal output names, case variants, and a pre-existing numbered name', async () => {
  const names = ['front.png', 'front.jpg', 'FRONT.webp', 'front-watermarked-2.png'];
  const outputs = names.map((name, index) => ({
    name: index < 3 ? fileStem(name) + '-watermarked.png' : name,
    blob: new Blob([name]),
  }));
  const archive = await JSZip.loadAsync(await buildZip(outputs));
  const archivedNames = Object.keys(archive.files);
  assert.equal(new Set(archivedNames.map(name => name.toLowerCase())).size, 4);
  assert.equal(await archive.file('front-watermarked.png')?.async('string'), 'front.png');
  assert.equal(await archive.file('front-watermarked-2.png')?.async('string'), 'front-watermarked-2.png');
  const contents = await Promise.all(archivedNames.map(name => archive.files[name].async('string')));
  assert.deepEqual(contents.sort(), names.sort());
});
