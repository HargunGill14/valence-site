#!/usr/bin/env node
// Renders the static fallback image for the home page map demo with headless Chromium,
// using the same Leaflet code, data and styles as the page. The image is what visitors
// see without JavaScript, before the map loads, if tiles fail, or while no tile URL is set.
//
// One-off tooling, nothing added to package.json. Run with:
//   npm install --no-save --no-package-lock playwright
//   npx playwright install chromium        (skip if Chromium is already installed)
//   node scripts/render-portal-map.mjs
// Needs cwebp on the PATH (brew install webp).
//
// Tiles default to openstreetmap.org (a one-off render of a few dozen tiles). Once a tile
// provider is chosen, re-render with the same tile URL and attribution set on the page, so the
// image matches the interactive map:
//   TILES='<provider tile URL>' ATTRIBUTION='<provider attribution>' node scripts/render-portal-map.mjs
// then update the "Map image" credit under the map in src/pages/home.html and docs/MEDIA-CREDITS.md.
//
// Outputs: assets/img/portal/map-{800,1600}.{jpg,webp} (16:11), then run `node scripts/build.mjs`.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const { chromium } = require('playwright');

const TILES = process.env.TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = process.env.ATTRIBUTION || '© OpenStreetMap contributors';
const OUT = join(ROOT, 'assets/img/portal');
const W = 800, H = 550;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif&display=block">
<link rel="stylesheet" href="/assets/css/site.css">
<link rel="stylesheet" href="/assets/vendor/leaflet/1.9.4/leaflet.css">
<style>html,body{margin:0;background:#E8E4DA}.demo{margin:0}#stage{position:relative;width:${W}px;height:${H}px}</style>
</head><body><div class="demo" id="demo"><div id="stage"><div class="demo__map" data-map style="position:absolute;inset:0"></div></div></div>
<script src="/assets/vendor/leaflet/1.9.4/leaflet.js"></script>
<script src="/assets/js/portal-map-data.js"></script>
<script src="/assets/js/portal-map.js"></script>
</body></html>`;

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/__render') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const scale of [1, 2]) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => { throw e; });
  await page.goto(`${base}/__render`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(({ tiles, attribution, retina }) => {
    window.ValenceMapDemo.mount(document.getElementById('demo'), { tiles, attribution, reduce: true, render: true, detectRetina: retina });
  }, { tiles: TILES, attribution: ATTRIBUTION, retina: scale > 1 && !TILES.includes('{r}') });
  await page.waitForSelector('#demo[data-map-ready]', { timeout: 30000 });
  await page.waitForTimeout(300);
  const name = `map-${W * scale}`;
  const png = join(OUT, `${name}.png`);
  await page.locator('#stage').screenshot({ path: png });
  await page.locator('#stage').screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 78 });
  execFileSync('cwebp', ['-quiet', '-q', '76', '-m', '6', png, '-o', join(OUT, `${name}.webp`)]);
  unlinkSync(png);
  for (const ext of ['jpg', 'webp']) {
    const kb = Math.round(statSync(join(OUT, `${name}.${ext}`)).size / 1024);
    console.log(`assets/img/portal/${name}.${ext}  ${kb} KB${kb >= 300 ? '  (over 300 KB)' : ''}`);
  }
  await page.close();
}
await browser.close();
server.close();
