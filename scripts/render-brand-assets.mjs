#!/usr/bin/env node
// Renders the PNG / ICO brand files from the SVG masters with headless Chromium.
// The OG image uses Instrument Serif and Instrument Sans from Google Fonts.
//
// One-off tooling, nothing added to package.json. Run with:
//   npm install --no-save --no-package-lock playwright png-to-ico
//   npx playwright install chromium        (skip if Chromium is already installed)
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
const img = (s, size) => `<img src="${dataUri(s)}" width="${size}" height="${size}">`;

const PAPER = '#F4F1EA', INK = '#15140F';
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const browser = await chromium.launch({ proxy });
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function shot(htmlBody, width, height, out, { transparent = false, bg = '#FFFFFF' } = {}) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500&family=Instrument+Serif:ital@0;1&display=block">
    <style>html,body{margin:0;width:${width}px;height:${height}px;background:${transparent ? 'transparent' : bg};overflow:hidden}img{display:block}</style>
  </head><body>${htmlBody}</body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width, height }, omitBackground: transparent });
  if (out) writeFileSync(join(ROOT, out), buf);
  return buf;
}

// favicon.svg is the rounded ink tile; iOS gets a square tile because the OS rounds it.
const fav = svg('favicon.svg');
const square = fav.replace(' rx="40"', '');

const ico32 = await shot(img(fav, 32), 32, 32, null, { transparent: true });
const ico16 = await shot(img(fav, 16), 16, 16, null, { transparent: true });
writeFileSync(join(ROOT, 'favicon.ico'), await pngToIco([ico32, ico16]));
await shot(img(square, 180), 180, 180, 'apple-touch-icon.png');
await shot(img(fav, 192), 192, 192, 'icon-192.png', { transparent: true });
await shot(img(fav, 512), 512, 512, 'icon-512.png', { transparent: true });
await shot(img(svg('assets/valence-mark-dark-static.svg'), 512), 512, 512, 'valence-mark-512.png', { bg: PAPER });

// OG image: paper background, mark, serif wordmark, positioning line.
await shot(`<div style="width:1200px;height:630px;box-sizing:border-box;padding:0 96px;display:flex;flex-direction:column;justify-content:center;color:${INK}">
  <div style="display:flex;align-items:center;gap:24px">${img(svg('assets/valence-mark-dark-static.svg'), 120)}
    <span style="font:400 104px/1 'Instrument Serif',serif;letter-spacing:-.02em">Valence</span></div>
  <div style="margin-top:56px;font:400 56px/1.1 'Instrument Serif',serif;letter-spacing:-.01em">Full view. Your call. <em style="color:#4F6B55">Our hands.</em></div>
  <div style="margin-top:28px;font:500 22px/1 'Instrument Sans',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#5F5B50">Boutique supply chain partner · Los Angeles</div>
</div>`, 1200, 630, 'og-image.png', { bg: PAPER });

await browser.close();
console.log('rendered favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, valence-mark-512.png, og-image.png');
