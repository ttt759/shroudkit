import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { createServer as createViteDev, preview as createVitePreview } from 'vite';
import { launchBrowser, serveDist } from '../scripts/local-browser.mjs';

const output = resolve('.cache/verify');
const dist = resolve('dist');
const policy = "default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none';";

test('production on a subpath runs all four tools without external requests or console errors', { timeout: 90_000 }, async t => {
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  assert.ok(html.includes(policy));
  await mkdir(output, { recursive: true });

  const { origin, url: workbenchUrl, close } = await serveDist(dist);
  t.after(close);
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, locale: 'en-US',
    permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true,
  });
  const errors = [];
  const external = [];
  const violations = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/^https?:$/.test(url.protocol) && url.origin !== origin) {
      external.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  context.on('request', request => {
    const url = new URL(request.url());
    if (/^(https?|wss?):$/.test(url.protocol) && url.origin !== origin && !external.includes(url.href)) {
      external.push(url.href);
    }
  });
  await context.exposeBinding('reportCsp', (_, details) => violations.push(details));
  await context.addInitScript(() => window.addEventListener('securitypolicyviolation', event =>
    window.reportCsp(event.effectiveDirective + ' ' + event.blockedURI)));
  await context.addInitScript(() => {
    const revokedUrls = new Set();
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = url => {
      revokedUrls.add(url);
      revoke(url);
    };
    window.wasRevoked = url => revokedUrls.has(url);
  });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (!response.ok()) errors.push(response.status() + ' ' + response.url()); });
  page.on('websocket', socket => errors.push('Production websocket ' + socket.url()));
  const find = id => page.getByTestId(id);
  const screenshot = name => page.screenshot({ path: join(output, name + '.png'), fullPage: true, animations: 'disabled' });
  const download = async id => {
    const [result] = await Promise.all([page.waitForEvent('download'), find(id).click()]);
    assert.equal(await result.failure(), null);
    return result;
  };
  const withinFold = async id => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const bounds = await find(id).boundingBox();
    assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 900, id + ' fits within the desktop viewport');
  };

  await page.goto(workbenchUrl);
  const heroHeight = (await page.locator('.hero').boundingBox()).height;
  assert.ok(heroHeight >= 120 && heroHeight <= 145, 'desktop hero height: ' + heroHeight);
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), policy);
  await find('shield').click();
  assert.equal(await find('audit-count').textContent(), '0');
  assert.equal(await find('audit-policy').textContent(), policy);
  await screenshot('06-security-audit');
  await find('shield').click();
  await screenshot('00-workspace');
  await find('en').click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await find('theme-toggle').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await screenshot('05-light-en');
  await find('theme-toggle').click();
  await find('zh').click();
  await context.setOffline(true);
  await find('offline-status').filter({ hasText: '离线' }).waitFor();

  await find('watermark-sample').click();
  await find('watermark-preview').waitFor();
  await find('watermark-enhance').check();
  await find('watermark-preset-1').click();
  await withinFold('watermark-download');
  const rendered = await download('watermark-download');
  const png = await readFile(await rendered.path());
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(!png.includes(Buffer.from('eXIf')));
  await find('watermark-copy').click();
  await find('watermark-status').filter({ hasText: '已复制' }).waitFor();
  await screenshot('01-watermark');
  const { default: JSZip } = await import('jszip');
  await find('watermark-files').setInputFiles([
    { name: 'same.png', mimeType: 'image/png', buffer: png },
    { name: 'same.png', mimeType: 'image/png', buffer: png },
  ]);
  await download('watermark-zip').then(async zip => {
    assert.equal(zip.suggestedFilename(), 'shroudkit-watermarked.zip');
    const archive = await JSZip.loadAsync(await readFile(await zip.path()));
    assert.deepEqual(Object.keys(archive.files).sort(), ['same-watermarked-2.png', 'same-watermarked.png']);
  });
  await find('watermark-clear').click();
  assert.equal(await find('watermark-preview').count(), 0);
  assert.ok(await find('watermark-download').isDisabled());
  await find('watermark-sample').click();

  await find('nav-metadata').click();
  await find('metadata-sample').click();
  await find('metadata-location').waitFor();
  assert.match(await find('metadata-location').textContent(), /31\.2304° N.*121\.4737° E/);
  await find('metadata-clean').click();
  await find('metadata-verified').waitFor();
  assert.match(await find('metadata-verified').textContent(), /11 → 0/);
  await withinFold('metadata-download');
  const clean = await download('metadata-download');
  assert.ok(clean.suggestedFilename().endsWith('.jpg'));
  await screenshot('02-metadata');

  // Batch exports keep same-name inputs separate and use no network.
  const picture = await readFile(await rendered.path());
  await find('metadata-files').setInputFiles([
    { name: 'same.png', mimeType: 'image/png', buffer: picture },
    { name: 'same.png', mimeType: 'image/png', buffer: picture },
  ]);
  await find('metadata-file-1').waitFor();
  await find('metadata-clean').click();
  const zip = await download('metadata-zip');
  assert.equal(zip.suggestedFilename(), 'shroudkit-cleaned.zip');
  const batch = await JSZip.loadAsync(await readFile(await zip.path()));
  assert.equal(Object.keys(batch.files).length, 2);

  const phonePhoto = await readFile(resolve('tests/fixtures/orientation-6.jpg'));
  const previewUrl = await page.locator('.photo-card img').getAttribute('src');
  await find('metadata-clear').click();
  assert.equal(await find('metadata-file-0').count(), 0);
  assert.equal(await page.locator('.photo-card img').count(), 0);
  assert.ok(previewUrl && await page.evaluate(src => window.wasRevoked(src), previewUrl));
  // Dispatch an image paste to the active tool without requiring OS clipboard access.
  const pastePortrait = () => page.evaluate(bytes => {
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([new Uint8Array(bytes)], 'portrait.jpg', { type: 'image/jpeg' }));
    return !document.body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
  }, [...phonePhoto]);
  await find('nav-vault').click();
  assert.equal(await pastePortrait(), false);
  await find('nav-metadata').click();
  assert.equal(await find('metadata-file-0').count(), 0);
  assert.equal(await pastePortrait(), true);
  await find('metadata-orientation-notice').waitFor();
  await screenshot('07-orientation-warning');
  await find('metadata-auto-orient').click();
  assert.equal(await find('metadata-orientation-notice').count(), 0);
  await find('metadata-clean').click();
  const upright = await download('metadata-download');
  const uprightPng = await readFile(await upright.path());
  assert.deepEqual([uprightPng.readUInt32BE(16), uprightPng.readUInt32BE(20)], [48, 80]);
  assert.equal(uprightPng.includes(Buffer.from('eXIf')), false);
  const [top, bottom] = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return [[...ctx.getImageData(10, 10, 1, 1).data], [...ctx.getImageData(10, 65, 1, 1).data]];
  }, [...uprightPng]);
  assert.ok(top[0] > top[2] && bottom[2] > bottom[0], '90° clockwise rotation is baked into the output pixels');
  await find('metadata-lossless').check();
  await find('metadata-sample').click();
  await find('metadata-location').waitFor();
  await find('metadata-clean').click();
  await find('metadata-verified').waitFor();

  await find('nav-vault').click();
  await find('vault-sample').click();
  await find('vault-generate').click();
  const password = await find('vault-password').inputValue();
  assert.ok(password.length >= 24);
  await find('vault-run').click();
  const sealed = await download('vault-download');
  assert.match(sealed.suggestedFilename(), /^sealed-\d{8}-[a-f0-9]{4}\.shroud$/);
  await withinFold('vault-run');
  assert.equal((await readFile(await sealed.path())).subarray(0, 4).toString(), 'SHRD');
  await find('vault-run').click();
  const again = await download('vault-download');
  assert.notEqual(again.suggestedFilename(), sealed.suggestedFilename());
  await find('vault-anonymous').uncheck();
  await find('vault-run').click();
  assert.equal((await download('vault-download')).suggestedFilename(), '虚构租房合同样本.shroud');
  await screenshot('03-vault');
  await find('vault-file').setInputFiles({
    name: 'verified.shroud', mimeType: 'application/octet-stream', buffer: await readFile(await sealed.path()),
  });
  assert.equal(await find('vault-decrypt').getAttribute('aria-pressed'), 'true');
  await find('vault-password').fill('invalid');
  await find('vault-run').click();
  await find('vault-error').waitFor();
  await find('vault-password').fill(password);
  await find('vault-run').click();
  const unsealed = await download('vault-download');
  assert.equal(unsealed.suggestedFilename(), '虚构租房合同样本.txt');
  const expected = await readFile(resolve('src/core/vault.ts'), 'utf8');
  const original = expected.match(/export const sampleContract = '([^']+)'/)[1].replaceAll('\\n', '\n');
  assert.deepEqual(await readFile(await unsealed.path()), Buffer.from(original));
  await find('vault-clear').click();
  assert.equal(await find('vault-password').inputValue(), '');
  assert.equal(await find('vault-confirm').inputValue(), '');
  assert.equal(await find('vault-password').getAttribute('type'), 'password');
  assert.equal(await find('vault-download').count(), 0);
  assert.ok(await find('vault-anonymous').isChecked());
  assert.ok(await find('vault-run').isDisabled());
  await find('vault-sample').click();
  await find('vault-generate').click();
  await page.evaluate(() => {
    const deriveKey = crypto.subtle.deriveKey;
    crypto.subtle.deriveKey = async function (...args) {
      await new Promise(resolve => { window.resumeVaultKdf = resolve; });
      crypto.subtle.deriveKey = deriveKey;
      const key = await deriveKey.apply(this, args);
      window.vaultKdfResolved = true;
      return key;
    };
  });
  await find('vault-run').click();
  await page.waitForFunction(() => typeof window.resumeVaultKdf === 'function');
  await find('vault-clear').click();
  await page.evaluate(() => window.resumeVaultKdf());
  await page.waitForFunction(() => window.vaultKdfResolved === true);
  assert.equal(await find('vault-password').inputValue(), '');
  assert.equal(await find('vault-download').count(), 0);
  assert.equal(await find('vault-error').count(), 0);
  await find('vault-sample').click();

  await find('nav-scrubber').click();
  await find('scrubber-sample').click();
  const source = await find('scrubber-input').inputValue();
  const scrubbed = await find('scrubber-output').inputValue();
  assert.match(scrubbed, /\[PHONE_1\]/);
  assert.match(scrubbed, /\[ID_1\]/);
  assert.ok(scrubbed.includes('999999199602190020'));
  await withinFold('scrubber-drawer');
  await find('scrubber-drawer').click();
  await find('scrubber-reply').fill(scrubbed);
  await find('scrubber-restore').click();
  assert.equal(await find('scrubber-restored').inputValue(), source);
  await screenshot('04-scrubber');
  await find('scrubber-shred').click();
  assert.equal(await find('scrubber-input').inputValue(), '');
  assert.equal(await find('scrubber-reply').inputValue(), '');
  assert.equal(await find('scrubber-restored').inputValue(), '');
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).sort()), ['shroudkit-language', 'shroudkit-theme']);
  await find('scrubber-sample').click();

  await page.setViewportSize({ width: 390, height: 844 });
  for (const tool of ['watermark', 'metadata', 'vault', 'scrubber']) {
    await find('nav-' + tool).click();
    for (const locale of ['zh', 'en']) {
      await find(locale).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, tool + ' / ' + locale);
    }
    await find('zh').click();
    if (tool === 'scrubber') {
      const apiToken = page.locator('.mapping-table dt').filter({ hasText: /^\[API_KEY_1\]$/ });
      assert.equal(await apiToken.evaluate(element => getComputedStyle(element).whiteSpace), 'nowrap');
      assert.equal(await apiToken.evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      }), 1);
    }
    await screenshot('mobile-' + tool);
  }
  await context.setOffline(false);
  await find('shield').click();
  assert.equal(await find('audit-count').textContent(), '0');
  assert.deepEqual(external, []);
  assert.deepEqual(violations, []);
  assert.deepEqual(errors, []);
});

test('Vite dev and preview boot without CSP or console errors', { timeout: 60_000 }, async t => {
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const host = '127.0.0.1';
  const dev = await createViteDev({ logLevel: 'error' });
  t.after(() => dev.close());
  await dev.listen();
  const preview = await createVitePreview({ logLevel: 'error' });
  t.after(() => new Promise(resolve => preview.httpServer.close(resolve)));

  for (const [server, isDev] of [[dev.httpServer, true], [preview.httpServer, false]]) {
    const origin = 'http://' + host + ':' + server.address().port;
    const page = await browser.newPage();
    const errors = [];
    const sockets = [];
    let ready;
    const hmrReady = new Promise(resolve => { ready = resolve; });
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
      if (message.text().includes('[vite] connected.')) ready();
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', socket => sockets.push(socket.url()));
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      errors.push('External request ' + route.request().url());
      return route.abort();
    });
    await page.goto(origin);
    await page.getByTestId('nav-watermark').waitFor();
    await page.getByTestId('shield').click();
    const activePolicy = await page.getByTestId('audit-policy').textContent();
    if (isDev) {
      assert.match(activePolicy, /connect-src 'self' ws:\/\/127\.0\.0\.1:\*/);
      await Promise.race([hmrReady, new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Vite HMR did not connect. ' + errors.join('\n'))), 8000);
        timer.unref();
      })]);
      assert.ok(sockets.length > 0 && sockets.every(url => new URL(url).hostname === host));
    } else {
      assert.equal(activePolicy, policy);
      assert.deepEqual(sockets, []);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
});
