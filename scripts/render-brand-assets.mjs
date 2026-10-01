#!/usr/bin/env node
// Renders the PNG / ICO brand files from the SVG masters with headless
// Chromium, using the Archivo and IBM Plex Mono woff2 files bundled in
// index.html's manifest so the OG image uses the site's real fonts.
//
// One-off tooling, nothing added to package.json. Run with:
//   npm install --no-save --no-package-lock playwright png-to-ico
//   npx playwright install chromium
//   node scripts/render-brand-assets.mjs
//
// Outputs (repo root): favicon.ico (32 + 16), apple-touch-icon.png (180),
// icon-192.png, icon-512.png, valence-mark-512.png, og-image.png (1200×630).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const { chromium } = require('playwright');
const pngToIcoMod = require('png-to-ico'); const pngToIco = pngToIcoMod.default || pngToIcoMod;

const svg = (name) => readFileSync(join(ROOT, name), 'utf8');
const dataUri = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64');

// Fonts: pull the latin woff2 subsets out of the manifest by their @font-face rule.
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const island = (t) => { const i = html.indexOf(`<script type="__bundler/${t}"`); const s = html.indexOf('>', i) + 1; return html.slice(s, html.indexOf('</script>', s)); };
const manifest = JSON.parse(island('manifest'));
const tpl = JSON.parse(island('template'));
function fontData(family, weightRule) {
  const re = new RegExp(`/\\* latin \\*/\\s*@font-face \\{[^}]*font-family: '${family}';[^}]*font-weight: ${weightRule};[^}]*src: url\\("([0-9a-f-]{36})"\\)`);
  const m = tpl.match(re);
  if (!m || !manifest[m[1]]) throw new Error(`font ${family} not found in manifest`);
  return `data:font/woff2;base64,${manifest[m[1]].data}`;
}
const archivo = fontData('Archivo', '500 900');
const plexMono = fontData('IBM Plex Mono', '500');

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function shot(htmlBody, width, height, out, { transparent = false } = {}) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:'Archivo';font-weight:500 900;font-stretch:62% 125%;src:url(${archivo}) format('woff2')}
    @font-face{font-family:'IBM Plex Mono';font-weight:500;src:url(${plexMono}) format('woff2')}
    html,body{margin:0;width:${width}px;height:${height}px;background:${transparent ? 'transparent' : '#FFFFFF'};overflow:hidden}
    img{display:block}
  </style></head><body>${htmlBody}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width, height }, omitBackground: transparent });
  if (out) writeFileSync(join(ROOT, out), buf);
  return buf;
}

// Square tile (favicon.svg already has the rounded dark tile; iOS/Android icons
// get a plain square tile because the OS rounds them).
const tile = (size, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" width="${size}" height="${size}">`
  + `<rect x="-100" y="-100" width="200" height="200" ${rounded ? 'rx="40"' : ''} fill="#111315"/>`
  + `<g transform="scale(.86)">${svg('valence-mark-white.svg').replace(/<\/?svg[^>]*>/g, '').replace(/vmw-front/g, 'tile-front')}</g></svg>`;
const img = (s, size) => `<img src="${dataUri(s)}" width="${size}" height="${size}">`;

const ico32 = await shot(img(svg('favicon.svg'), 32), 32, 32, null, { transparent: true });
const ico16 = await shot(img(svg('favicon.svg'), 16), 16, 16, null, { transparent: true });
writeFileSync(join(ROOT, 'favicon.ico'), await pngToIco([ico32, ico16]));
await shot(img(tile(180, false), 180), 180, 180, 'apple-touch-icon.png');
await shot(img(tile(192, true), 192), 192, 192, 'icon-192.png', { transparent: true });
await shot(img(tile(512, true), 512), 512, 512, 'icon-512.png', { transparent: true });
await shot(img(svg('valence-mark.svg'), 512), 512, 512, 'valence-mark-512.png');

// OG image: mark 250px, 40px gap, "VALENCE" Archivo 800 118px .14em, "SUPPLY CHAIN" IBM Plex Mono 500 34px .28em 75%.
await shot(`<div style="width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#111315">
  ${img(svg('valence-mark.svg'), 250)}
  <div style="margin-top:40px;font:800 118px/1 'Archivo',sans-serif;font-stretch:88%;letter-spacing:.14em;text-indent:.14em">VALENCE</div>
  <div style="margin-top:18px;font:500 34px/1 'IBM Plex Mono',monospace;letter-spacing:.28em;text-indent:.28em;opacity:.75">SUPPLY CHAIN</div>
</div>`, 1200, 630, 'og-image.png');

await browser.close();
console.log('rendered favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, valence-mark-512.png, og-image.png');
