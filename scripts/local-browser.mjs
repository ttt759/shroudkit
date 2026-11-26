import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const mount = '/shroudkit/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

export function launchBrowser() {
  const paths = [
    process.env.BROWSER_EXECUTABLE,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const executablePath = paths.find(path => existsSync(path));
  if (!executablePath) throw new Error('Set BROWSER_EXECUTABLE to the system Chrome or Edge path.');
  return chromium.launch({ executablePath, args: ['--disable-background-networking'] });
}

export async function serveDist(base) {
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (!path.startsWith(mount)) throw new Error('Not found');
      const relative = decodeURIComponent(path.slice(mount.length)) || 'index.html';
      const file = resolve(base, relative);
      if (!file.startsWith(base + sep)) throw new Error('Invalid path');
      const body = await readFile(file);
      response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      response.end(body);
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  const origin = 'http://127.0.0.1:' + server.address().port;
  return { origin, url: origin + mount, close: () => new Promise(resolve => server.close(resolve)) };
}
