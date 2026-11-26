import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { launchBrowser, serveDist } from './local-browser.mjs';

const dist = resolve('dist');
const output = resolve('docs/assets');
await access(join(dist, 'index.html')).catch(() => {
  throw new Error('Build the production app with npm run build before generating screenshots.');
});

const server = await serveDist(dist);
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5,
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === server.origin) return route.continue();
    errors.push('Unexpected request: ' + route.request().url());
    return route.abort();
  });
  const find = id => page.getByTestId(id);
  await page.goto(server.url);
  const capture = () => page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });

  await find('nav-metadata').click();
  await find('metadata-sample').click();
  await find('metadata-location').waitFor();
  await page.locator('.photo-card img').evaluate(image => image.decode());
  await find('metadata-clean').click();
  await find('metadata-verified').waitFor();
  assert.match(await find('metadata-verified').textContent(), /11 → 0/);
  const dark = await capture();
  await find('en').click();
  await find('theme-toggle').click();
  await find('nav-watermark').click();
  await find('watermark-sample').click();
  await find('watermark-preset-1').click();
  await find('watermark-preview').waitFor();
  await find('watermark-download').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  const light = await capture();
  assert.deepEqual(errors, []);

  await mkdir(output, { recursive: true });
  for (const [name, image] of [['workbench-dark.png', dark], ['watermark-light.png', light]]) {
    await writeFile(join(output, name), image);
    console.log('Wrote docs/assets/' + name);
  }
} finally {
  try { await browser?.close(); }
  finally { await server.close(); }
}
