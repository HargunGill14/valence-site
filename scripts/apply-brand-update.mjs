#!/usr/bin/env node
// Applies the brand / contact / SEO / media update to index.html (a bundled
// Claude Design export). Idempotent: a second run changes nothing. Node
// built-ins only. Run from anywhere: `node scripts/apply-brand-update.mjs`.
//
// index.html is four non-executing <script> "islands" plus an outer shell:
//   __bundler/manifest  JSON {uuid: {mime, compressed, data(base64)}}
//   __bundler/template  the real page as one JSON string; `</` escaped as `</`
// This script parses both, edits them, and re-serialises them.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'index.html');
const log = [];
const note = (m) => log.push(m);
const assert = (c, m) => { if (!c) throw new Error(m); };

// ───────────────────────── constants ─────────────────────────
const CANON = 'https://www.valencesupplychain.com/';
const TITLE = 'Valence Supply Chain | Freight Brokerage';
const DESC = 'Valence Supply Chain is a freight brokerage matching your loads with vetted carriers nationwide, with live tracking and a real person on the line 24/7.';
const PHONE_DISPLAY = '628-218-8500';
const PHONE_TEL = '+16282188500';
const EMAIL = 'jesse@valencesupplychain.com';

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization', '@id': CANON + '#org',
      name: 'Valence Supply Chain LLC', alternateName: 'Valence Supply Chain', url: CANON,
      logo: CANON + 'valence-mark-512.png', email: EMAIL, telephone: '+1-628-218-8500', areaServed: 'US',
      knowsAbout: ['Freight brokerage', 'CPG', 'Automotive', 'Pharma', 'Retail', 'Distribution', 'Manufacturing'],
      contactPoint: {
        '@type': 'ContactPoint', contactType: 'customer service', telephone: '+1-628-218-8500', email: EMAIL,
        areaServed: 'US', availableLanguage: 'en',
        hoursAvailable: { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '00:00', closes: '23:59' }
      }
    },
    { '@type': 'WebSite', '@id': CANON + '#site', name: 'Valence Supply Chain', url: CANON, publisher: { '@id': CANON + '#org' } }
  ]
};

// Identical in the outer shell <head> (what crawlers and link previews read)
// and the template <head> (what becomes the live head after render).
const HEAD_TAGS = [
  `<title>${TITLE}</title>`,
  `<meta name="description" content="${DESC}">`,
  `<link rel="canonical" href="${CANON}">`,
  `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
  `<link rel="icon" href="/favicon.ico" sizes="32x32">`,
  `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
  `<link rel="manifest" href="/site.webmanifest">`,
  `<meta name="theme-color" content="#111315">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:site_name" content="Valence Supply Chain">`,
  `<meta property="og:title" content="${TITLE}">`,
  `<meta property="og:description" content="${DESC}">`,
  `<meta property="og:url" content="${CANON}">`,
  `<meta property="og:image" content="${CANON}og-image.png">`,
  `<meta property="og:image:width" content="1200">`,
  `<meta property="og:image:height" content="630">`,
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:title" content="${TITLE}">`,
  `<meta name="twitter:description" content="${DESC}">`,
  `<meta name="twitter:image" content="${CANON}og-image.png">`,
  `<script type="application/ld+json">${JSON.stringify(JSON_LD)}</script>`
].join('\n');

// Backup only: the real apex → www redirect is a DNS / hosting setting.
const REDIRECT_SCRIPT = `<script>if(location.hostname==='valencesupplychain.com'){location.replace('https://www.valencesupplychain.com'+location.pathname+location.search+location.hash)}</script>`;

const SPLASH_CSS = `    #valence-splash {
      --valence-ink: #111315;
      --valence-ring: #98AE9C;
      --valence-dot: #3F5E48;
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      background: #FFFFFF;
    }
    #valence-splash svg { width: 96px; height: 96px; }`;

const ORBIT = 'M 83.69 -27.19 A 88 30 -18 1 1 -83.69 27.19 A 88 30 -18 1 1 83.69 -27.19 Z';
const SPLASH_HTML = `<div id="valence-splash" role="status" aria-label="Loading Valence Supply Chain">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" aria-hidden="true">
      <defs>
        <clipPath id="vsplash-back"><polygon points="-100,-100 100,-100 100,-32.49 -100,32.49"/></clipPath>
        <clipPath id="vsplash-front"><polygon points="-100,32.49 100,-32.49 100,100 -100,100"/></clipPath>
      </defs>
      <g clip-path="url(#vsplash-back)"><circle r="7.5" style="fill:var(--valence-dot)"><animateMotion dur="2.4s" repeatCount="indefinite" path="${ORBIT}"/></circle></g>
      <ellipse rx="88" ry="30" transform="rotate(-18)" fill="none" stroke-width="5" style="stroke:var(--valence-ring)"/>
      <polygon points="-66,-60 -30,-60 0,26 30,-60 66,-60 17,64 -17,64" style="fill:var(--valence-ink)"/>
      <g clip-path="url(#vsplash-front)"><ellipse rx="88" ry="30" transform="rotate(-18)" fill="none" stroke-width="5" style="stroke:var(--valence-ring)"/><circle r="7.5" style="fill:var(--valence-dot)"><animateMotion dur="2.4s" repeatCount="indefinite" path="${ORBIT}"/></circle></g>
    </svg>
  </div>`;

// Plain text for crawlers and link previews before the JS runs. Mirrors what
// the rendered page says; no new claims.
const NOSCRIPT_HTML = `<noscript>
    <main style="max-width:720px;margin:0 auto;padding:48px 24px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#111315;line-height:1.5">
      <h1>Valence Supply Chain</h1>
      <p>${DESC}</p>
      <p>Industries: CPG, automotive, pharma, retail, distribution, manufacturing.</p>
      <p>24/7/365 live support.</p>
      <p>Phone: <a href="tel:${PHONE_TEL}">${PHONE_DISPLAY}</a><br>Email: <a href="mailto:${EMAIL}">${EMAIL}</a></p>
    </main>
  </noscript>`;

const OUTER_HEAD = `<head>
  ${REDIRECT_SCRIPT}
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
${HEAD_TAGS.split('\n').map(l => '  ' + l).join('\n')}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #FFFFFF; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    #__bundler_placeholder { color: #999; font-size: 14px; }
${SPLASH_CSS}
  </style>
  <noscript><style>#valence-splash { display: none; }</style></noscript>
</head>`;

// The two bundled Mixkit clips and their posters. uuid → public path.
const MEDIA = {
  'e4c9aab4-64d0-45ea-85ea-4f6834e9f8ff': 'videos/23852-poster.jpg',
  '1f8730f6-c059-4b0e-b77b-e403b9d54454': 'videos/23852-720.mp4',
  '99fefda9-0574-49e3-b8ad-d354346bdb57': 'videos/23852-360.mp4',
  'ee33aa0a-3689-407e-87fa-1307ca46923a': 'videos/41361-poster.jpg',
  'c2be3650-c3a9-4839-862f-0a1244f7157e': 'videos/41361-720.mp4',
  '579428a9-9317-4baf-a01d-317877adde23': 'videos/41361-360.mp4'
};

// ───────────────────────── helpers ─────────────────────────
let html = readFileSync(FILE, 'utf8');
const before = html.length;

function islandRange(type) {
  const open = `<script type="__bundler/${type}"`;
  const i = html.indexOf(open);
  assert(i >= 0, `missing island ${type}`);
  const s = html.indexOf('>', i) + 1;
  const e = html.indexOf('</script>', s);
  return { s, e };
}
function readIsland(type) { const { s, e } = islandRange(type); return html.slice(s, e); }
function writeIsland(type, body) { const { s, e } = islandRange(type); html = html.slice(0, s) + body + html.slice(e); }

// Replace every `from` with `to` in `str`. Idempotent: if `from` is gone and
// `to` is present, nothing to do. If neither is present the export has
// changed shape, so fail loudly instead of silently skipping.
function swapAll(str, from, to, label, expectCount) {
  const n = str.split(from).length - 1;
  if (n === 0) { assert(str.includes(to), `${label}: neither old nor new text found`); return str; }
  if (expectCount != null) assert(n === expectCount, `${label}: expected ${expectCount} match(es), found ${n}`);
  note(`${label}: ${n} replacement(s)`);
  return str.split(from).join(to);
}

// ───────────────────────── 1. media out of the bundle ─────────────────────────
const manifestRaw = readIsland('manifest');
const manifest = JSON.parse(manifestRaw);
let tpl = JSON.parse(readIsland('template'));
assert(typeof tpl === 'string', 'template island is not a JSON string');

let manifestChanged = false;
for (const [uuid, rel] of Object.entries(MEDIA)) {
  const abs = join(ROOT, rel);
  if (manifest[uuid]) {
    const entry = manifest[uuid];
    assert(!entry.compressed, `${rel}: compressed entries are not handled`);
    mkdirSync(dirname(abs), { recursive: true });
    if (!existsSync(abs)) { writeFileSync(abs, Buffer.from(entry.data, 'base64')); note(`wrote ${rel} (${entry.mime})`); }
    delete manifest[uuid];
    manifestChanged = true;
  } else {
    assert(existsSync(abs), `${rel}: not in manifest and not on disk`);
  }
  tpl = swapAll(tpl, uuid, '/' + rel, `template ref → /${rel}`, 1);
}
if (manifestChanged) {
  writeIsland('manifest', '\n' + JSON.stringify(manifest) + '\n  ');
  note(`manifest: ${Object.keys(manifest).length} entries remain (fonts and scripts stay bundled)`);
}

// ───────────────────────── 2. every <video> uses <source type="video/mp4"> ─────────────────────────
{
  const re = /(<video data-ind-video="\{\{ ind\.idx \}\}"[^>]*?) src="\{\{ ind\.src \}\}"([^>]*)><\/video>/;
  if (re.test(tpl)) {
    tpl = tpl.replace(re, (_, a, b) => `${a}${b}><source src="{{ ind.src }}" type="video/mp4"></video>`);
    note('industry frame <video>: src attribute → <source type="video/mp4">');
  } else {
    assert(tpl.includes('<source src="{{ ind.src }}" type="video/mp4"></video>'), 'industry <video> not found');
  }
  const videos = tpl.match(/<video[\s\S]*?<\/video>/g) || [];
  for (const v of videos) {
    for (const attr of ['sc-camel-auto-play="{{ true }}"', 'muted="{{ true }}"', 'loop="{{ true }}"', 'sc-camel-plays-inline="{{ true }}"', 'poster="']) {
      assert(v.includes(attr), `a <video> lacks ${attr}: ${v.slice(0, 120)}`);
    }
    assert(v.includes('type="video/mp4"'), `a <video> lacks <source type="video/mp4">: ${v.slice(0, 120)}`);
  }
  note(`checked ${videos.length} <video> tags for autoplay/muted/loop/playsinline/poster/source`);
}

// ───────────────────────── 3. outer shell: lang, head tags, splash, noscript ─────────────────────────
{
  const cut = islandRange('manifest').s - `<script type="__bundler/manifest">`.length;
  let shell = html.slice(0, cut), rest = html.slice(cut);
  assert(rest.startsWith('<script type="__bundler/manifest">'), 'manifest island boundary');

  if (shell.startsWith('<!DOCTYPE html>\n<html>\n')) { shell = shell.replace('<html>', '<html lang="en">'); note('outer <html lang="en">'); }
  assert(shell.startsWith('<!DOCTYPE html>\n<html lang="en">\n'), 'outer <html> tag unexpected');

  const headRe = /<head>[\s\S]*?<\/head>/;
  const curHead = (shell.match(headRe) || [])[0];
  assert(curHead, 'outer <head> not found');
  if (curHead !== OUTER_HEAD) {
    assert(curHead.includes('__bundler_thumbnail') || curHead.includes('valence-splash'), 'outer <head> is not the loader head we expect');
    shell = shell.replace(headRe, () => OUTER_HEAD);
    note('outer <head>: redirect script, viewport, SEO/share tags, JSON-LD, splash CSS; "Unpacking..." CSS removed');
  }

  const loaderRe = /<div id="__bundler_thumbnail">[\s\S]*?<\/div>\s*<div id="__bundler_loading">Unpacking\.\.\.<\/div>/;
  if (!shell.includes('id="valence-splash"')) {
    assert(loaderRe.test(shell), 'old loader markup not found');
    shell = shell.replace(loaderRe, () => SPLASH_HTML + '\n  ' + NOSCRIPT_HTML);
    note('outer <body>: diamond loader + "Unpacking..." pill → #valence-splash + <noscript> text');
  }
  html = shell + rest;
}

// ───────────────────────── 4. template head: identical tags ─────────────────────────
{
  const re = /^<!DOCTYPE html>\n<html(?: lang="en")?><head>\n([\s\S]*?)<\/head>/;
  const m = tpl.match(re);
  assert(m, 'template <head> not found');
  const runtime = (m[1].match(/<script src="[0-9a-f-]{36}"><\/script>/) || [])[0];
  assert(runtime, 'template runtime <script src="uuid"> not found');
  const newHead = `<!DOCTYPE html>\n<html lang="en"><head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${HEAD_TAGS}\n${runtime}\n</head>`;
  if (m[0] !== newHead) { tpl = tpl.replace(re, () => newHead); note('template <head>: lang="en" + the same SEO/share tags and JSON-LD'); }
}

// ───────────────────────── 5. header: mark + phone-width values ─────────────────────────
{
  const MARK = `<picture><source srcset="/valence-mark-white-animated.svg" media="(prefers-reduced-motion: no-preference)"><img src="/valence-mark-white.svg" alt="" style="display:block;flex:none;width:{{ markPx }}px;height:{{ markPx }}px"></picture>`;
  tpl = swapAll(tpl,
    `<a href="#top" style="display:flex;align-items:center;gap:12px;padding:0 clamp(18px,3vw,40px);color:#EEEDE8">`,
    `<a href="#top" style="display:flex;align-items:center;gap:{{ navGap }};padding:{{ navPad }};color:#EEEDE8">\n    ${MARK}`,
    'header link: mark + bound gap/padding', 1);
  tpl = swapAll(tpl,
    `<span style="font:800 26px/1 'Archivo',sans-serif;font-stretch:88%;letter-spacing:.14em">VALENCE</span>`,
    `<span style="font:800 {{ navWordPx }}/1 'Archivo',sans-serif;font-stretch:88%;letter-spacing:.14em">VALENCE</span>`,
    'header "VALENCE" size', 1);
  tpl = swapAll(tpl,
    `<span style="font:500 9px/1 'IBM Plex Mono',monospace;letter-spacing:.28em;opacity:.7;margin-top:4px">SUPPLY CHAIN</span>\n    </span>\n  </a>`,
    `<span style="font:500 {{ navSubPx }}/1 'IBM Plex Mono',monospace;letter-spacing:.28em;opacity:.7;margin-top:{{ navSubMt }}">SUPPLY CHAIN</span>\n    </span>\n  </a>`,
    'header "SUPPLY CHAIN" size/margin', 1);
  tpl = swapAll(tpl,
    `gap:10px;padding:0 clamp(20px,2.6vw,36px);background:var(--acc);color:#111315;font:700 16px/1 'Archivo'`,
    `gap:10px;padding:{{ ctaPad }};background:var(--acc);color:#111315;font:700 {{ ctaPx }}/1 'Archivo'`,
    'header "Get a Quote" padding/size', 1);

  // Render values, computed from vw like the existing svcCols / navWide.
  const anchor = `    const vw = this.state.w || 1200;\n`;
  const block = anchor +
`    const narrow = vw <= 420, tight = vw <= 375;
    const brand = {
      markPx: narrow ? 30 : 52,
      navGap: narrow ? '8px' : '12px',
      navPad: tight ? '0 10px' : narrow ? '0 14px' : '0 clamp(18px,3vw,40px)',
      navWordPx: narrow ? '22px' : '26px',
      navSubPx: narrow ? '8px' : '9px',
      navSubMt: narrow ? '3px' : '4px',
      ctaPad: tight ? '0 10px' : narrow ? '0 14px' : '0 clamp(20px,2.6vw,36px)',
      ctaPx: narrow ? '14px' : '16px',
      phoneHref: '+1' + String(phone).replace(/\\D/g, '')
    };
`;
  if (!tpl.includes('const brand = {')) {
    tpl = swapAll(tpl, anchor, block, 'renderVals: brand values', 1);
    tpl = swapAll(tpl, `      email, phone, hasPhone: !!phone,\n`, `      email, phone, hasPhone: !!phone, ...brand,\n`, 'renderVals: spread brand values', 1);
  }
}

// ───────────────────────── 6. footer: mark + two-line wordmark linking to #top ─────────────────────────
tpl = swapAll(tpl,
  `<div style="display:flex;align-items:center;gap:12px;color:#EEEDE8"><span style="width:12px;height:12px;background:var(--acc);transform:rotate(45deg)"></span><span style="font:800 24px/1 'Archivo',sans-serif;font-stretch:88%;letter-spacing:.14em">VALENCE</span></div>`,
  `<a href="#top" style="display:flex;align-items:center;gap:12px;color:#EEEDE8;text-decoration:none"><img src="/valence-mark-white.svg" alt="" width="48" height="48" style="display:block;flex:none"><span style="display:flex;flex-direction:column;line-height:1"><span style="font:800 24px/1 'Archivo',sans-serif;font-stretch:88%;letter-spacing:.14em">VALENCE</span><span style="font:500 9px/1 'IBM Plex Mono',monospace;letter-spacing:.28em;opacity:.7;margin-top:4px">SUPPLY CHAIN</span></span></a>`,
  'footer: diamond + "VALENCE" → mark + two-line link', 1);

// ───────────────────────── 7. contact details and address typo ─────────────────────────
tpl = swapAll(tpl, '&quot;default&quot;:&quot;516-710-5656&quot;', `&quot;default&quot;:&quot;${PHONE_DISPLAY}&quot;`, 'props default phone', 1);
tpl = swapAll(tpl, `P.phone || '516-710-5656'`, `P.phone || '${PHONE_DISPLAY}'`, 'renderVals fallback phone', 1);
tpl = swapAll(tpl, '&quot;default&quot;:&quot;info@valencesupplychain.com&quot;', `&quot;default&quot;:&quot;${EMAIL}&quot;`, 'props default email', 1);
tpl = swapAll(tpl, `P.email ?? 'info@valencesupplychain.com'`, `P.email ?? '${EMAIL}'`, 'renderVals fallback email', 1);
tpl = swapAll(tpl, 'href="tel:{{ phone }}"', 'href="tel:{{ phoneHref }}"', 'tel: links → E.164', 2);
tpl = swapAll(tpl, '21008 N St #317790', '2108 N St #317790', 'address typo', 2);

for (const bad of ['516', '710-5656', '7105656', 'info@', '21008']) {
  assert(!tpl.includes(bad), `"${bad}" still present in template`);
}

// ───────────────────────── 8. phone widths: no sideways scroll ─────────────────────────
// At 360–375px three uppercase headings had a single word ("REQUIREMENT.",
// "PROFESSIONAL", "MANUFACTURING") wider than the viewport, which made the whole page scroll
// sideways. Lower the clamp() minimum of just those headings; nothing
// changes above phone width because the vw term wins there.
tpl = swapAll(tpl,
  `font:800 clamp(48px,6.4vw,104px)/.9 'Archivo',sans-serif;font-stretch:88%;text-transform:uppercase;text-wrap:balance">Every industry. Every requirement.</h2>`,
  `font:800 clamp(44px,6.4vw,104px)/.9 'Archivo',sans-serif;font-stretch:88%;text-transform:uppercase;text-wrap:balance">Every industry. Every requirement.</h2>`,
  'industries heading: phone min size 48px → 44px', 1);
tpl = swapAll(tpl,
  `font:800 clamp(44px,5.4vw,88px)/.9 'Archivo',sans-serif;font-stretch:88%;text-transform:uppercase;text-wrap:balance">Professional on every load.</h2>`,
  `font:800 clamp(40px,5.4vw,88px)/.9 'Archivo',sans-serif;font-stretch:88%;text-transform:uppercase;text-wrap:balance">Professional on every load.</h2>`,
  'our standard heading: phone min size 44px → 40px', 1);

tpl = swapAll(tpl,
  `<h3 style="margin:0;font:800 clamp(40px,4.4vw,68px)/.92 'Archivo',sans-serif;font-stretch:88%;text-transform:uppercase">`,
  `<h3 style="margin:0;font:800 clamp(38px,4.4vw,68px)/.92 'Archivo',sans-serif;font-stretch:88%;text-transform:uppercase">`,
  'industry row heading: phone min size 40px → 38px', 1);

// ───────────────────────── 9. hero: mark beside the heading, smaller heading, no hero button ─────────────────────────
// Mark first, then the heading and paragraph. A 2-column grid (not a flex
// row) so the mark is centred on the two heading lines only and the paragraph
// sits under the heading. At <= 600px the mark stacks above the heading.
{
  const HERO_P = `<p data-reveal="1" style="margin:0;`;
  const HERO_P_REST = `max-width:420px;font:400 clamp(15px,1.1vw,17px)/1.5 'IBM Plex Sans',sans-serif;color:rgba(238,237,232,.85);text-wrap:pretty">When your freight can't be late, we're the call you make. Vetted carriers, live tracking and a real person on the line 24/7.</p>`;
  const H1_FONT_OLD = `clamp(34px,4.4vw,68px)/.95`;
  const H1_FONT_NEW = `clamp(27px,3.52vw,54px)/.95`; // 80% of the old clamp (27.2 / 3.52 / 54.4)
  const H1_REST = ` 'Archivo',sans-serif;font-stretch:88%;text-transform:uppercase;letter-spacing:.005em">Valence.<br><span style="color:var(--acc)">Bonded to your deadline.</span></h1>`;
  const HERO_BUTTON = `      <a data-reveal="1" href="#quote" style="display:flex;align-items:center;gap:12px;padding:15px 24px;border:1px solid rgba(238,237,232,.6);color:#EEEDE8;font:700 14px/1 'Archivo',sans-serif;font-stretch:88%;letter-spacing:.14em;text-transform:uppercase;backdrop-filter:blur(6px)" style-hover="background:var(--acc);border-color:var(--acc);color:#111315">Request a Quote <span>→</span></a>\n`;
  // Hero-specific mark files: same geometry as valence-mark-white*.svg, ring
  // #98AE9C (accent) and dot #EEEDE8 instead of ring #5F7263 / dot #98AE9C,
  // because the dark ring was nearly invisible over the forest clips. The
  // header and footer keep the white files. The drop shadow holds the mark
  // up over bright frames.
  const HERO_MARK_IMG = (still, animated) => `<source srcset="${animated}" media="(prefers-reduced-motion: no-preference)"><img src="${still}" alt="" style="display:block;width:{{ heroMarkPx }};height:{{ heroMarkPx }}"></picture>`;
  const HERO_MARK_V1 = `<picture data-reveal="1" style="display:block;grid-row:1;grid-column:1">` + HERO_MARK_IMG('/valence-mark-white.svg', '/valence-mark-white-animated.svg');
  const HERO_MARK = `<picture data-reveal="1" style="display:block;grid-row:1;grid-column:1;filter:drop-shadow(0 2px 10px rgba(0,0,0,.45))">` + HERO_MARK_IMG('/valence-mark-hero.svg', '/valence-mark-hero-animated.svg');
  for (const f of ['valence-mark-hero.svg', 'valence-mark-hero-animated.svg']) assert(existsSync(join(ROOT, f)), `${f} missing`);

  const from =
`      <div style="display:flex;flex-direction:column;gap:18px">
      <h1 data-reveal="1" style="margin:0;font:800 ${H1_FONT_OLD}${H1_REST}
      ${HERO_P}${HERO_P_REST}
      </div>
${HERO_BUTTON}`;
  const to =
`      <div style="display:grid;grid-template-columns:{{ heroCols }};gap:18px 32px;align-items:center;justify-items:start;min-width:0;max-width:100%">
      ${HERO_MARK}
      <h1 data-reveal="1" style="margin:0;grid-row:{{ heroH1Row }};grid-column:{{ heroTextCol }};font:800 ${H1_FONT_NEW}${H1_REST}
      ${HERO_P}grid-row:{{ heroPRow }};grid-column:{{ heroTextCol }};${HERO_P_REST}
      </div>
`;
  const quoteLinksBefore = tpl.split('href="#quote"').length - 1;
  const hadButton = tpl.includes(HERO_BUTTON);
  // An index.html built by the first version of this step has the white
  // mark in the hero; bring it to the current markup before the main swap.
  if (tpl.includes(HERO_MARK_V1)) tpl = swapAll(tpl, HERO_MARK_V1, HERO_MARK, 'hero mark: white files → hero files + drop shadow', 1);
  tpl = swapAll(tpl, from, to, 'hero: mark + 80% heading in a grid, "Request a Quote" button removed', 1);
  const quoteLinksAfter = tpl.split('href="#quote"').length - 1;
  assert(quoteLinksAfter === quoteLinksBefore - (hadButton ? 1 : 0), 'hero: wrong number of #quote links removed');
  assert(quoteLinksAfter >= 4, 'hero: header / services / quote section / footer #quote links must remain');
  assert(!tpl.includes(HERO_BUTTON), 'hero button still present');
  assert(!tpl.includes(H1_FONT_OLD), 'old hero heading size still present');
  assert(tpl.split('/valence-mark-white-animated.svg').length - 1 === 1, 'expected the white animated mark in the header only');
  assert(tpl.split('/valence-mark-hero-animated.svg').length - 1 === 1, 'expected the hero animated mark once');
  assert(tpl.split('/valence-mark-hero.svg').length - 1 === 1, 'expected the hero still mark once');
  assert(tpl.split('/valence-mark-white.svg').length - 1 === 2, 'expected the white still mark in header + footer only');

  // Render values, computed from vw like `brand` above.
  const anchor = `      phoneHref: '+1' + String(phone).replace(/\\D/g, '')\n    };\n`;
  const block = anchor +
`    const heroStack = vw <= 600;
    const hero = {
      heroCols: heroStack ? 'minmax(0,1fr)' : 'auto minmax(0,1fr)',
      heroMarkPx: heroStack ? '64px' : 'clamp(88px,10.8vw,165px)',
      heroTextCol: heroStack ? '1' : '2',
      heroH1Row: heroStack ? '2' : '1',
      heroPRow: heroStack ? '3' : '2'
    };
`;
  if (!tpl.includes('const hero = {')) {
    tpl = swapAll(tpl, anchor, block, 'renderVals: hero values', 1);
    tpl = swapAll(tpl, `hasPhone: !!phone, ...brand,\n`, `hasPhone: !!phone, ...brand, ...hero,\n`, 'renderVals: spread hero values', 1);
  }
  assert(tpl.includes('...brand, ...hero,'), 'hero values not spread into render values');
}

// ───────────────────────── write ─────────────────────────
writeIsland('template', '\n' + JSON.stringify(tpl).replace(/<\//g, '<\\u002F') + '\n  ');
for (const bad of ['516-710-5656', 'info@valencesupplychain.com', '21008', 'id="__bundler_loading"', '>Unpacking...<', '__bundler_thumbnail']) {
  assert(!html.includes(bad), `"${bad}" still present in index.html`);
}

const original = readFileSync(FILE, 'utf8');
if (html === original) {
  console.log('index.html already up to date; nothing changed.');
} else {
  writeFileSync(FILE, html);
  console.log(log.map(l => ' - ' + l).join('\n'));
  console.log(`index.html: ${before.toLocaleString()} → ${html.length.toLocaleString()} bytes`);
}
