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
// VERIFY_STUB_FONTS=1 answers Google Fonts with an empty stylesheet and Google's and Microsoft Clarity's
// tags with an empty script, for machines without internet; the CSP still applies to both, so a blocked host fails.
// Exit code 0 when every check passes, 1 when any fails, 2 on the overall timeout.
//
// The quote box (lane 16): Cloudflare Turnstile is answered by a stub under its real URL (so the CSP
// still decides whether it may load) that hands back a fixed token, and /api/quote-request is a local
// stand-in for the Worker. On / and /contact/ at 375 and 1440 px: the two-step flow ends on the
// thank-you with the token and the fields posted; a failing endpoint shows the error and the phone
// number, never the thank-you; on / at 1440 px each of the international, drayage and parcel tabs
// sends, and the truck tab hands off to /quote/ with both ZIPs. The quote page (/quote/) at 375 and
// 1440 px: prefill from the box and from the map, items added and removed, options picked on the
// page and in the explainer dialog, the send (posted once as kind "quote_page" with the token), a
// failing endpoint, and a missing weight caught before anything is sent. VERIFY_SHOTS=<folder>
// saves screenshots of the box (steps 1, 2 and 3) and the quote page at both widths.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs';
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
// The Worker's stand-in: records each body and answers with quoteStatus.
const quotePosts = [];
let quoteStatus = 200;
const TURNSTILE_STUB = "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('stub-token')},30);return 'w1'},reset:function(){},remove:function(){}};";
const server = createServer((req, res) => {
  if (req.url === '/api/quote-request') {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      try { quotePosts.push(JSON.parse(raw)); } catch { quotePosts.push(null); }
      res.writeHead(quoteStatus, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: quoteStatus === 200 }));
    });
    return;
  }
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
    await ctx.route(/^https:\/\/(www|scripts)\.clarity\.ms\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  }
  await ctx.route(/^https:\/\/challenges\.cloudflare\.com\/turnstile\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: TURNSTILE_STUB }));
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
      ok(`${tag} clarity queue set up`, await page.evaluate(() => typeof window.clarity === 'function'));
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

// ── the quote box ──
const SHOTS = process.env.VERIFY_SHOTS ? resolve(process.env.VERIFY_SHOTS) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const tomorrow = () => { const d = new Date(Date.now() + 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const STEP1 = {
  truck: async (b) => { await b.locator('[data-for="truck"] [data-rate="from"]').fill('90058'); await b.locator('[data-for="truck"] [data-rate="to"]').fill('75247'); },
  intl: async (b) => { await b.locator('[data-for="intl"] [data-rate="from"]').fill('Shanghai'); await b.locator('[data-for="intl"] [data-rate="to"]').fill('Port of Long Beach'); },
  dray: async (b) => { await b.locator('[data-for="dray"] [data-rate="from"]').selectOption('Port of Oakland'); await b.locator('[data-for="dray"] [data-rate="to"]').fill('94607'); await b.locator('[data-seg="container"][data-val="20 ft"]').click(); },
  parcel: async (b) => { const r = b.locator('[data-for="parcel"]'); await r.locator('[data-rate="from"]').fill('100 Main St, Fresno CA 93725'); await r.locator('[data-rate="to"]').fill('200 Elm St, Denver CO 80216'); await r.locator('[data-rate="weight"]').fill('12.5'); await r.locator('[data-rate="box"]').fill('12 x 10 x 8 in'); },
};
// scope: '#rate' is the box at the top (home, /contact/); '#contact' is the closing band's box.
async function quoteFlow(path, w, mode, { status = 200, shots = false, scope = '#rate' } = {}) {
  const tag = `[${w} quote ${mode}${status === 200 ? '' : ' ' + status}${scope === '#contact' ? ' closing band' : ''}] ${path}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 812 : 900 } });
  await ctx.route(/^https:\/\/challenges\.cloudflare\.com\/turnstile\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: TURNSTILE_STUB }));
  await ctx.route(/^https:\/\/(fonts\.(googleapis|gstatic)\.com|www\.googletagmanager\.com|(www|scripts)\.clarity\.ms)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  ctx.setDefaultTimeout(10000);
  try {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.exposeFunction('__cspViolation', (v) => errs.push(`CSP blocked ${v}`)).catch(() => {});
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.__cspViolation(`${e.violatedDirective} ${e.blockedURI || ''}`.trim())));
    await page.goto(BASE + path + scope, { waitUntil: 'load' });
    const box = page.locator(`${scope} [data-rate-box]`);
    await box.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-in')));
    const shot = async (n) => { if (shots && SHOTS) await page.locator(scope).screenshot({ path: join(SHOTS, `quote-${path === '/' ? 'home' : path.replace(/\//g, '')}${scope === '#contact' ? '-band' : ''}-${w}-step${n}.png`), animations: 'disabled' }); };
    await box.locator(`.rate__tab[data-mode="${mode}"]`).click();
    await STEP1[mode](box);
    await shot(1);
    if (mode === 'truck') {
      // The truck tab hands off to the quote page with both ZIPs; nothing is posted from the box.
      const before = quotePosts.length;
      await Promise.all([page.waitForURL(/\/quote\/\?from=90058&to=75247$/, { timeout: 10000 }), box.locator('[data-for="truck"] [data-rate-next]').click()]);
      await page.locator('[data-quote]').waitFor();
      const got = await page.evaluate(() => [document.querySelector('[data-q="from"]').value, document.querySelector('[data-q="to"]').value, document.querySelector('[data-q-place="from"]').textContent, document.querySelector('[data-q-place="to"]').textContent]);
      ok(`${tag} hands off to /quote/ with both ZIPs and their states`, got.join('|') === '90058|75247|California|Texas' && quotePosts.length === before, got.join('|'));
      ok(`${tag} no page errors or CSP blocks`, errs.length === 0, errs.join(' | '));
      return;
    }
    await box.locator(`[data-for="${mode}"] [data-rate-next]`).click();
    ok(`${tag} step 2 shows`, await box.locator('[data-rate-step="2"]').isVisible());
    if (mode === 'truck') await box.locator('[data-rate="equipment"]').selectOption('Full truckload · reefer');
    if (mode === 'intl') await box.locator('[data-rate="intlmode"]').selectOption('Air');
    await box.locator('[data-rate="date"]').fill(tomorrow());
    if (mode !== 'parcel') await box.locator('[data-rate="weight2"]').fill('42,000');
    await box.locator('[data-rate="name"]').fill('Test Shipper');
    await box.locator('[data-rate="company"]').fill('Verify Foods');
    await box.locator('[data-rate="email"]').fill('test@verify.example');
    await shot(2);
    quoteStatus = status;
    const before = quotePosts.length;
    await box.locator('[data-rate-submit]').click();
    if (status === 200) {
      await box.locator('[data-rate-step="3"]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      ok(`${tag} thank-you shows`, await box.locator('[data-rate-step="3"]').isVisible());
      const body = quotePosts[before];
      ok(`${tag} posted once with the Turnstile token and the tab`, quotePosts.length === before + 1 && body && body.token === 'stub-token' && body.mode === mode && body.website === '' && body.email === 'test@verify.example', JSON.stringify(body));
      await shot(3);
    } else {
      await box.locator('[data-rate-error2]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      const msg = await box.locator('[data-rate-error2]').textContent();
      ok(`${tag} error with the phone number, no thank-you`, /\(628\) 212-9947/.test(msg || '') && !(await box.locator('[data-rate-step="3"]').isVisible()), msg);
      ok(`${tag} send button usable again`, await box.locator('[data-rate-submit]').isEnabled());
    }
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${tag} no horizontal scroll`, over <= 0, `${over}px too wide`);
    ok(`${tag} no page errors or CSP blocks`, errs.length === 0, errs.join(' | '));
  } finally {
    quoteStatus = 200;
    await ctx.close().catch(() => {});
  }
}
for (const w of [375, 1440]) {
  for (const path of ['/', '/contact/']) {
    await withLimit(`[${w} quote truck] ${path}`, PAGE_MS, () => quoteFlow(path, w, 'truck'));
    await withLimit(`[${w} quote dray] ${path}`, PAGE_MS, () => quoteFlow(path, w, 'dray', { shots: path === '/' }));
    await withLimit(`[${w} quote intl 502] ${path}`, PAGE_MS, () => quoteFlow(path, w, 'intl', { status: 502 }));
  }
}
for (const mode of ['intl', 'parcel']) await withLimit(`[1440 quote ${mode}] /`, PAGE_MS, () => quoteFlow('/', 1440, mode));
await withLimit('[375 quote 429] /', PAGE_MS, () => quoteFlow('/', 375, 'dray', { status: 429 }));
// the closing band's box: the homepage's second box, and three other pages
for (const [path, w] of [['/', 1440], ['/about/', 375]]) {
  await withLimit(`[${w} quote truck closing band] ${path}`, PAGE_MS, () => quoteFlow(path, w, 'truck', { scope: '#contact' }));
}
for (const [path, w] of [['/about/', 375], ['/cpg/', 1440], ['/case-studies/rivian/', 375]]) {
  await withLimit(`[${w} quote dray closing band] ${path}`, PAGE_MS, () => quoteFlow(path, w, 'dray', { scope: '#contact', shots: path === '/about/' }));
}
await withLimit('[1440 quote 502 closing band] /cpg/', PAGE_MS, () => quoteFlow('/cpg/', 1440, 'intl', { status: 502, scope: '#contact' }));

// ── the homepage map: pick a lane, and "Quote this lane" (to /quote/) ──
async function mapFlow(w, mode, { status = 200, shots = false } = {}) {
  const tag = `[${w} map ${mode}${status === 200 ? '' : ' ' + status}] /`;
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 812 : 900 } });
  await ctx.route(/^https:\/\/challenges\.cloudflare\.com\/turnstile\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: TURNSTILE_STUB }));
  await ctx.route(/^https:\/\/(fonts\.(googleapis|gstatic)\.com|www\.googletagmanager\.com|(www|scripts)\.clarity\.ms)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  ctx.setDefaultTimeout(10000);
  try {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.exposeFunction('__cspViolation', (v) => errs.push(`CSP blocked ${v}`)).catch(() => {});
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.__cspViolation(`${e.violatedDirective} ${e.blockedURI || ''}`.trim())));
    await page.goto(BASE + '/#net', { waitUntil: 'load' });
    await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-in')));
    const card = page.locator('[data-pick-card]');
    await page.locator('[data-net]').scrollIntoViewIfNeeded();
    // a real click on a city dot, then a state (dispatched: a state's centre can sit under a city dot)
    await page.locator('.net__city[data-city="Los Angeles"] .net__hit').click({ force: true });
    await page.locator('.net__state[data-state="Texas"]').dispatchEvent('click');
    ok(`${tag} the form opens with the lane`, await card.locator('[data-pick-form]').isVisible() && /Los Angeles/.test(await card.locator('[data-pick-from]').textContent()) && /Texas \(TX\)/.test(await card.locator('[data-pick-to]').textContent()));
    await card.locator('[data-pick-mode]').selectOption(mode);
    if (mode === 'dray') { await card.locator('[data-pick-port]').selectOption('Port of Long Beach'); await card.locator('[data-pick-seg="45 ft"]').click(); }
    if (mode === 'truck') await card.locator('[data-pick-equipment]').selectOption('Full truckload · reefer');
    if (mode === 'parcel') { await card.locator('[data-pick-weight]').fill('12.5'); await card.locator('[data-pick-box]').fill('12 x 10 x 8 in'); }
    if (mode === 'intl') await card.locator('[data-pick-intl]').selectOption('Air');
    await card.locator('[data-pick-email]').fill('test@verify.example');
    if (shots && SHOTS) await page.locator('#net').screenshot({ path: join(SHOTS, `map-${w}-form.png`), animations: 'disabled' });
    quoteStatus = status;
    const before = quotePosts.length;
    await card.locator('[data-pick-send]').click();
    if (status === 200) {
      await card.locator('[data-pick-done]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      ok(`${tag} "We have your request." shows`, await card.locator('[data-pick-done]').isVisible());
      const b = quotePosts[before];
      ok(`${tag} posted once to the Worker as kind map, with the token and the picks`, quotePosts.length === before + 1 && b && b.kind === 'map' && b.token === 'stub-token' && b.mode === mode && b.from === 'city:Los Angeles' && b.to === 'state:Texas' && b.website === '' && b.email === 'test@verify.example'
        && (mode !== 'dray' || (b.port === 'Port of Long Beach' && b.container === '45 ft')) && (mode !== 'truck' || b.equipment === 'Full truckload · reefer'), JSON.stringify(b));
      if (shots && SHOTS) await page.locator('#net').screenshot({ path: join(SHOTS, `map-${w}-done.png`), animations: 'disabled' });
    } else {
      await card.locator('[data-pick-error]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      const msg = await card.locator('[data-pick-error]').textContent();
      ok(`${tag} error with the phone number, no "done"`, /\(628\) 212-9947/.test(msg || '') && !(await card.locator('[data-pick-done]').isVisible()), msg);
      ok(`${tag} send button usable again`, await card.locator('[data-pick-send]').isEnabled());
    }
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${tag} no horizontal scroll`, over <= 0, `${over}px too wide`);
    ok(`${tag} no page errors or CSP blocks`, errs.length === 0, errs.join(' | '));
  } finally {
    quoteStatus = 200;
    await ctx.close().catch(() => {});
  }
}
for (const w of [375, 1440]) await withLimit(`[${w} map dray] /`, PAGE_MS, () => mapFlow(w, 'dray', { shots: true }));
for (const mode of ['truck', 'intl', 'parcel', 'unsure']) await withLimit(`[1440 map ${mode}] /`, PAGE_MS, () => mapFlow(1440, mode));
await withLimit('[375 map 502] /', PAGE_MS, () => mapFlow(375, 'dray', { status: 502 }));
await withLimit('[1440 map 429] /', PAGE_MS, () => mapFlow(1440, 'truck', { status: 429 }));

async function laneQuote(w) {
  const tag = `[${w} map quote this lane] /`;
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 812 : 900 } });
  await ctx.route(/^https:\/\/challenges\.cloudflare\.com\/turnstile\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: TURNSTILE_STUB }));
  await ctx.route(/^https:\/\/(fonts\.(googleapis|gstatic)\.com|www\.googletagmanager\.com|(www|scripts)\.clarity\.ms)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  ctx.setDefaultTimeout(10000);
  try {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(BASE + '/#net', { waitUntil: 'load' });
    const lane = page.locator('[data-net-lane="0"]');
    const want = { from: await lane.getAttribute('data-from-zip'), to: await lane.getAttribute('data-to-zip'), eq: await lane.getAttribute('data-eq'), mode: await lane.getAttribute('data-mode') };
    await lane.dispatchEvent('click');
    await Promise.all([page.waitForURL(/\/quote\/\?/), page.locator('[data-net-quote]').click()]);
    await page.locator('[data-quote]').waitFor();
    const eq = want.mode === 'LTL' ? 'LTL' : 'Full truckload · ' + want.eq.toLowerCase();
    const u = new URL(page.url());
    const got = { path: u.pathname, from: await page.locator('[data-q="from"]').inputValue(), to: await page.locator('[data-q="to"]').inputValue(), note: await page.locator('[data-q="note"]').inputValue(), qeq: u.searchParams.get('equipment') };
    ok(`${tag} opens /quote/ with both ZIPs and the lane's equipment`, got.path === '/quote/' && got.from === want.from && got.to === want.to && got.qeq === eq && got.note === eq + '. ', JSON.stringify({ want, got }));
    ok(`${tag} no page errors`, errs.length === 0, errs.join(' | '));
  } finally {
    await ctx.close().catch(() => {});
  }
}
for (const w of [375, 1440]) await withLimit(`[${w} map quote this lane] /`, PAGE_MS, () => laneQuote(w));

// The map's "Add items and options first": the quote page, with the picks, the city ZIP and the equipment.
async function mapDetails(w) {
  const tag = `[${w} map add items and options] /`;
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 812 : 900 } });
  await ctx.route(/^https:\/\/challenges\.cloudflare\.com\/turnstile\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: TURNSTILE_STUB }));
  await ctx.route(/^https:\/\/(fonts\.(googleapis|gstatic)\.com|www\.googletagmanager\.com|(www|scripts)\.clarity\.ms)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  ctx.setDefaultTimeout(10000);
  try {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(BASE + '/#net', { waitUntil: 'load' });
    await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-in')));
    await page.locator('[data-net]').scrollIntoViewIfNeeded();
    await page.locator('.net__city[data-city="Los Angeles"] .net__hit').click({ force: true });
    await page.locator('.net__state[data-state="Texas"]').dispatchEvent('click');
    const card = page.locator('[data-pick-card]');
    await card.locator('[data-pick-equipment]').selectOption('LTL');
    await Promise.all([page.waitForURL(/\/quote\/\?/, { timeout: 10000 }), card.locator('[data-pick-details]').click()]);
    await page.locator('[data-quote]').waitFor();
    const got = await page.evaluate(() => ({ from: document.querySelector('[data-q="from"]').value, to: document.querySelector('[data-q="to"]').value, note: document.querySelector('[data-q-mapnote]').textContent, shown: !document.querySelector('[data-q-mapnote]').hidden, eq: document.querySelector('[data-q="note"]').value }));
    ok(`${tag} lands on /quote/ with the city ZIP, the picks and the equipment`, got.from === '90058' && got.to === '' && got.shown && /From the map: Los Angeles → Texas\. Add both ZIP codes above for an exact quote\./.test(got.note) && got.eq === 'LTL. ', JSON.stringify(got));
    ok(`${tag} no page errors`, errs.length === 0, errs.join(' | '));
  } finally {
    await ctx.close().catch(() => {});
  }
}
for (const w of [375, 1440]) await withLimit(`[${w} map add items and options] /`, PAGE_MS, () => mapDetails(w));

// ── the quote page (/quote/) ──
async function quotePageFlow(w, { status = 200, query = '?from=90058&to=75247', shots = false, missingWeight = false } = {}) {
  const tag = `[${w} quote page${status === 200 ? '' : ' ' + status}${missingWeight ? ' missing weight' : ''}${query.includes('Place') ? ' from the map' : ''}] /quote/`;
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 812 : 900 } });
  await ctx.route(/^https:\/\/challenges\.cloudflare\.com\/turnstile\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: TURNSTILE_STUB }));
  await ctx.route(/^https:\/\/(fonts\.(googleapis|gstatic)\.com|www\.googletagmanager\.com|(www|scripts)\.clarity\.ms)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  ctx.setDefaultTimeout(10000);
  try {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.exposeFunction('__cspViolation', (v) => errs.push(`CSP blocked ${v}`)).catch(() => {});
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.__cspViolation(`${e.violatedDirective} ${e.blockedURI || ''}`.trim())));
    await page.goto(BASE + '/quote/' + query, { waitUntil: 'load' });
    await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-in')));
    const root = page.locator('[data-quote]');
    const shot = async (n) => { if (shots && SHOTS) await page.screenshot({ path: join(SHOTS, `quote-page-${w}-${n}.png`), fullPage: n !== 'dialog', animations: 'disabled' }); };
    if (query.includes('Place')) {
      ok(`${tag} the map note shows the picks`, await root.locator('[data-q-mapnote]').isVisible() && /Los Angeles → Texas/.test(await root.locator('[data-q-mapnote]').textContent()));
      await root.locator('[data-q="to"]').fill('75247');
    }
    ok(`${tag} ZIPs prefilled, with their states`, (await root.locator('[data-q="from"]').inputValue()) === '90058' && (await root.locator('[data-q-place="to"]').textContent()) === 'Texas');
    await root.locator('[data-q="date"]').fill(tomorrow());
    // items: one row to start; fill it, add two more, remove the last
    const rows = root.locator('.qitem');
    ok(`${tag} one item row to start`, (await rows.count()) === 1);
    await rows.nth(0).locator('[data-i="qty"]').fill('2');
    if (!missingWeight) await rows.nth(0).locator('[data-i="lbs"]').fill('1,250');
    for (const [k, v] of [['l', '48'], ['w', '40'], ['h', '60']]) await rows.nth(0).locator(`[data-i="${k}"]`).fill(v);
    await root.locator('[data-q-additem]').click();
    await rows.nth(1).locator('[data-i="type"]').selectOption('Crate');
    await rows.nth(1).locator('[data-i="lbs"]').fill('300');
    await root.locator('[data-q-additem]').click();
    await rows.nth(2).locator('[data-i-remove]').click();
    if (!missingWeight) ok(`${tag} two rows and the total`, (await rows.count()) === 2 && (await root.locator('[data-q-total]').textContent()) === '3 items · 2,800 lbs total', await root.locator('[data-q-total]').textContent());
    // options: one on the page, one from the explainer, and "Show all"
    await root.locator('[data-opt-pick="lift_pu"]').click();
    ok(`${tag} an option toggles on`, (await root.locator('[data-opt-pick="lift_pu"]').getAttribute('aria-pressed')) === 'true');
    ok(`${tag} hazmat hidden until "Show all"`, !(await root.locator('[data-opt="hazmat"]').isVisible()));
    await root.locator('[data-q-more="pickup"]').click();
    ok(`${tag} "Show all" shows the rest`, await root.locator('[data-opt="hazmat"]').isVisible() && (await root.locator('[data-q-more="pickup"]').getAttribute('aria-expanded')) === 'true');
    await root.locator('[data-opt-info="appt_dl"]').click();
    const dlg = page.locator('#qinfo');
    ok(`${tag} the explainer opens with the option`, await dlg.isVisible() && (await dlg.locator('[data-qinfo-title]').textContent()) === 'Delivery appointment' && (await dlg.locator('[data-qinfo-desc]').textContent()).length > 20 && (await dlg.locator('[data-qinfo-art] svg').count()) === 1);
    await shot('dialog');
    await dlg.locator('[data-qinfo-next]').click();
    ok(`${tag} next goes to the next delivery option`, (await dlg.locator('[data-qinfo-title]').textContent()) === 'Limited access delivery');
    await dlg.locator('[data-qinfo-prev]').click();
    await dlg.locator('[data-qinfo-toggle]').click();
    ok(`${tag} adding from the explainer picks it on the page`, (await root.locator('[data-opt-pick="appt_dl"]').getAttribute('aria-pressed')) === 'true' && /Added/.test(await dlg.locator('[data-qinfo-toggle]').textContent()));
    const overDlg = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${tag} no horizontal scroll with the explainer open`, overDlg <= 0, `${overDlg}px too wide`);
    await page.keyboard.press('Escape');
    ok(`${tag} Escape closes the explainer and focus returns to its button`, !(await dlg.isVisible()) && (await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-opt-info'))) === 'appt_dl');
    await root.locator('[data-q="name"]').fill('Test Shipper');
    await root.locator('[data-q="company"]').fill('Verify Foods');
    await root.locator('[data-q="email"]').fill('test@verify.example');
    await shot('filled');
    quoteStatus = status;
    const before = quotePosts.length;
    await root.locator('[data-q-submit]').click();
    if (missingWeight) {
      await root.locator('[data-q-error]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      ok(`${tag} caught on the page, nothing sent`, /weight in pounds/.test(await root.locator('[data-q-error]').textContent()) && quotePosts.length === before);
    } else if (status === 200) {
      await root.locator('[data-qstep="2"]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      ok(`${tag} thank-you shows`, await root.locator('[data-qstep="2"]').isVisible() && /We have your request\./.test(await root.locator('[data-qstep="2"]').textContent()));
      const b = quotePosts[before];
      ok(`${tag} posted once as kind quote_page with the token, items and options`, quotePosts.length === before + 1 && b && b.kind === 'quote_page' && b.token === 'stub-token' && b.website === ''
        && b.from === '90058' && b.to === '75247' && b.items.length === 2 && b.items[0].qty === '2' && b.items[0].lbs === '1,250' && b.items[0].h === '60' && b.items[1].type === 'Crate'
        && JSON.stringify(b.pickup) === '["lift_pu"]' && JSON.stringify(b.delivery) === '["appt_dl"]' && b.email === 'test@verify.example' && !('total_lbs' in b)
        && (query.includes('Place') ? b.fromPlace === 'city:Los Angeles' && b.toPlace === 'state:Texas' : !('fromPlace' in b)), JSON.stringify(b));
      await shot('done');
    } else {
      await root.locator('[data-q-error]').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      const msg = await root.locator('[data-q-error]').textContent();
      ok(`${tag} error with the phone number, no thank-you`, /\(628\) 212-9947/.test(msg || '') && !(await root.locator('[data-qstep="2"]').isVisible()), msg);
      ok(`${tag} send button usable again`, await root.locator('[data-q-submit]').isEnabled() && (await root.locator('[data-q-submit]').textContent()) === 'Get my quote');
    }
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${tag} no horizontal scroll`, over <= 0, `${over}px too wide`);
    ok(`${tag} no page errors or CSP blocks`, errs.length === 0, errs.join(' | '));
  } finally {
    quoteStatus = 200;
    await ctx.close().catch(() => {});
  }
}
for (const w of [375, 1440]) await withLimit(`[${w} quote page] /quote/`, PAGE_MS, () => quotePageFlow(w, { shots: true }));
await withLimit('[375 quote page from the map] /quote/', PAGE_MS, () => quotePageFlow(375, { query: '?from=90058&to=&fromPlace=city%3ALos%20Angeles&toPlace=state%3ATexas&equipment=LTL' }));
await withLimit('[1440 quote page 502] /quote/', PAGE_MS, () => quotePageFlow(1440, { status: 502 }));
await withLimit('[375 quote page 429] /quote/', PAGE_MS, () => quotePageFlow(375, { status: 429 }));
await withLimit('[1440 quote page missing weight] /quote/', PAGE_MS, () => quotePageFlow(1440, { missingWeight: true }));

await browser.close();
server.close();
clearTimeout(runTimer);
process.exit(summary() ? 1 : 0);
