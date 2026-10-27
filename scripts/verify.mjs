#!/usr/bin/env node
// Static checks first (scripts/check.mjs), then browser checks on dist/ served with the
// headers from serve.json, CSP included, so a CSP that blocks something fails here.
// Browser checks for the built site: every page at 375, 768 and 1440 px, three ways each
// (normal, reduced motion, JavaScript off). Fails on horizontal scroll, console errors, page
// errors and 4xx/5xx responses. Reduced motion: no CSS animation still running and no video
// playing. JavaScript off: the page heading shows. Home: scrolling through #intro in 40 steps
// throws nothing and ends with the site header in view.
//
// One-off tooling, nothing added to package.json. Playwright lives outside the repo:
//   npm i --prefix ~/.cache/valence-pw playwright && npx --prefix ~/.cache/valence-pw playwright install chromium
// then, after `node scripts/build.mjs`:
//   NODE_PATH=~/.cache/valence-pw/node_modules node scripts/verify.mjs
// It serves dist/ on a free local port. Each page gets 60 s, the whole run 10 min.
// VERIFY_STUB_FONTS=1 answers Google Fonts with an empty stylesheet and Google's analytics tag with an
// empty script, for machines without internet; the CSP still applies to both, so a blocked host fails.
// Exit code 0 when every check passes, 1 when any fails, 2 on the overall timeout.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const require = createRequire(join(ROOT, 'package.json')); // so NODE_PATH can supply playwright
const { chromium } = require('playwright');

// Every built page but 404.html, as the host serves it (dir/index.html at /dir/, x.html at /x),
// so a new page (the Valence Labs page, terms, support) is checked without editing this list.
const PAGES = readdirSync(DIST, { recursive: true }).map((f) => String(f).split(sep).join('/'))
  .filter((f) => f.endsWith('.html') && f !== '404.html' && !f.startsWith('assets/'))
  .map((f) => '/' + f.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, ''))
  .sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
const WIDTHS = [375, 768, 1440];
const MODES = ['normal', 'reduced motion', 'no JS'];
const PAGE_MS = 60000, RUN_MS = 10 * 60000;

const results = [];

// ── static checks (plan steps 1.16 and 6.3) ──
{
  const { checkDist } = await import('./check.mjs');
  const problems = checkDist(DIST);
  for (const x of problems) console.log(`FAIL  static: ${x}`);
  if (problems.length) { console.log(`\n${problems.length} static problem(s); run node scripts/build.mjs`); process.exit(1); }
  console.log('PASS  static checks on dist/');
}

// ── the headers serve sends, from serve.json (globs: ** and dir/**) ──
const SERVE = JSON.parse(readFileSync(join(ROOT, 'serve.json'), 'utf8'));
const globRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/(?<!\.)\*/g, '[^/]*') + '$');
function headersFor(path) {
  const out = {};
  for (const rule of SERVE.headers || []) {
    if (globRe(rule.source).test(path.replace(/^\//, ''))) for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
}
function ok(name, cond, extra = '') {
  const line = `${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && extra ? '  ' + extra : ''}`;
  results.push(line);
  console.log(line);
}
function summary() {
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed, of ${results.length}`);
  return failed;
}
const runTimer = setTimeout(() => { console.log(`\nOverall timeout after ${RUN_MS / 60000} min`); summary(); process.exit(2); }, RUN_MS);

// ── a static server that behaves like the host: /dir/ serves dir/index.html, misses get 404.html ──
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.xml': 'application/xml', '.txt': 'text/plain', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (path.endsWith('/')) path += 'index.html';
  else if (!extname(path)) path += '.html'; // serve's clean URLs: /privacy serves privacy.html
  const file = join(DIST, path);
  if (file.startsWith(DIST) && existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { ...headersFor(path), 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } else {
    res.writeHead(404, { ...headersFor('/404.html'), 'content-type': TYPES['.html'] });
    res.end(readFileSync(join(DIST, '404.html')));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

async function withLimit(name, ms, fn) {
  let t;
  try {
    await Promise.race([fn(), new Promise((_, no) => { t = setTimeout(() => no(new Error(`timed out after ${ms / 1000} s`)), ms); })]);
  } catch (e) {
    ok(`${name} finished`, false, String(e.message || e).split('\n')[0]);
  } finally { clearTimeout(t); }
}

// Scroll top to bottom so lazy images, on-screen players and the intro all run.
// behavior 'instant' because the page sets scroll-behavior: smooth.
async function scrollThrough(page) {
  const steps = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight / (innerHeight * 0.8)));
  for (let i = 1; i <= steps; i++) {
    await page.evaluate((k) => scrollTo({ top: k * innerHeight * 0.8, behavior: 'instant' }), i);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
}

async function checkPage(path, w, mode) {
  const tag = `[${w} ${mode}] ${path}`;
  const ctx = await browser.newContext({
    viewport: { width: w, height: w < 500 ? 812 : 900 },
    javaScriptEnabled: mode !== 'no JS',
    reducedMotion: mode === 'reduced motion' ? 'reduce' : 'no-preference',
  });
  if (process.env.VERIFY_STUB_FONTS) {
    await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await ctx.route(/^https:\/\/www\.googletagmanager\.com\/gtag\/js/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  }
  ctx.setDefaultTimeout(10000);
  ctx.setDefaultNavigationTimeout(20000);
  try {
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('response', (r) => { if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`); });
    // A browser abandons a video download it can't or won't play (Playwright's Chromium has no
    // H.264), which is not a site fault; a missing file is a 404 and a CSP block is caught below.
    const abandonedVideo = (r) => /\.(mp4|webm)$/i.test(new URL(r.url()).pathname) && r.failure()?.errorText === 'net::ERR_ABORTED';
    page.on('requestfailed', (r) => { if (r.url().startsWith(BASE) && !abandonedVideo(r)) errs.push(`failed ${r.url()}`); });
    await page.exposeFunction('__cspViolation', (v) => errs.push(`CSP blocked ${v}`)).catch(() => {});
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.__cspViolation(`${e.violatedDirective} ${e.blockedURI || ''} ${e.sample || ''}`.trim())));

    await page.goto(BASE + path, { waitUntil: 'load' });
    // timers never run in a JavaScript-off page, so bound the font wait from here
    await Promise.race([page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {}), page.waitForTimeout(3000)]);

    if (path === '/' && mode === 'normal') {
      const end = await page.evaluate(() => { const s = document.getElementById('intro'); return s ? s.offsetTop + s.offsetHeight - innerHeight : null; });
      ok(`${tag} has #intro`, end != null);
      if (end != null) {
        for (let i = 1; i <= 40; i++) {
          await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), Math.round((end * i) / 40));
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        }
        await page.waitForTimeout(500); // the header's own transition, if any
        const hdr = await page.evaluate(() => {
          const h = document.querySelector('.site-header'); if (!h) return null;
          const r = h.getBoundingClientRect(), cs = getComputedStyle(h);
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), shown: cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.9 };
        });
        ok(`${tag} intro scroll: header in view at the end`, !!hdr && hdr.shown && hdr.top >= -1 && hdr.bottom > 0, JSON.stringify(hdr));
        ok(`${tag} intro scroll: no errors`, errs.length === 0, errs.join(' | '));
      }
    }

    await scrollThrough(page);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${tag} no horizontal scroll`, over <= 0, `${over}px too wide`);

    if (mode === 'reduced motion') {
      const moving = await page.evaluate(() => ({
        anims: document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName || a.transitionProperty || 'animation'),
        videos: [...document.querySelectorAll('video')].filter((v) => !v.paused).length,
      }));
      ok(`${tag} nothing animating`, moving.anims.length === 0 && moving.videos === 0, JSON.stringify(moving));
    }
    if (mode !== 'no JS') {
      const ga = await page.evaluate(() => Array.isArray(window.dataLayer) && window.dataLayer.some((a) => a[0] === 'config'));
      ok(`${tag} analytics set up`, ga);
    }
    if (mode === 'no JS') {
      ok(`${tag} heading shows`, await page.locator('h1').first().isVisible());
    }
    ok(`${tag} no console errors, page errors or 4xx`, errs.length === 0, errs.join(' | '));
  } finally {
    await ctx.close().catch(() => {});
  }
}

for (const mode of MODES) {
  for (const w of WIDTHS) {
    for (const path of PAGES) {
      await withLimit(`[${w} ${mode}] ${path}`, PAGE_MS, () => checkPage(path, w, mode));
    }
  }
}

await browser.close();
server.close();
clearTimeout(runTimer);
process.exit(summary() ? 1 : 0);
