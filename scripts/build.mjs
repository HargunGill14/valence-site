#!/usr/bin/env node
// Builds the static site from src/pages/*.html into dist/. Node built-ins only.
// Run from anywhere: `node scripts/build.mjs`. dist/ is committed and is the only
// folder the host serves (`serve dist`), so source files, docs and package.json are
// never public. The build ends with scripts/check.mjs and fails if any check fails.
//
// dist/ gets the built pages, 404.html, sitemap.xml and copies of assets/ and the
// root files in STATIC_FILES. serve.json (directory listing off, the security headers,
// the CSP's script-src hash computed from the inline head script) is written next to
// dist/, not inside it, and `npm start` passes it with --config. src/lastmod.json
// records each page's content hash and the date it last changed; commit it with dist/.
//
// Each page in src/pages starts with a JSON comment:
//   <!--{"out":"space/index.html","title":"…","description":"…","footer":"light"}-->
// and may use these directives anywhere in its body:
//   <!-- @header -->                       sticky site header
//   <!-- @footer -->                       site footer ("dark" or "light", from the page JSON)
//   <!-- @cta label="Book a 15-minute call" -->   green closing section
//   <!-- @mark variant="light" size="36" label="Valence" -->   the V mark
//   <!-- @img name="heroes/space" ratio="4/5" alt="…" label="photo: …" sizes="…" -->
//   <!-- @proof -->                        the logo carousel
// An @img renders a <picture> when assets/img/<name>-{800,1600}.{jpg,webp} exist,
// and a sized placeholder otherwise, so a missing photo never breaks the layout.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, CSP_BASE, SECURITY_HEADERS, ASSET_CACHE, GA_ID, GA_TAG_URL, SCRIPT_HOSTS } from './config.mjs';
import { checkDist, sha256 } from './check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const EMAIL = 'ops@valencesupplychain.com';
const PHONE = '(628) 212-9947';
const PHONE_TEL = '+16282129947';
// Customer login is off the site until labs.valencesupplychain.com is live (2026-10-15, plan 6.1).
// The approved URL is LOGIN in scripts/config.mjs. When it is live, add one link to LOGIN back to
// the header and one to the footer Contact column; check.mjs allows 0 or 2 per page, each exactly LOGIN.

// Files at the repo root that the site serves. Everything else at the root stays private.
const STATIC_FILES = ['robots.txt', 'site.webmanifest', 'favicon.ico', 'favicon-48.png', 'favicon-96.png',
  'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'og-image.png', 'valence-mark-512.png'];

// Plan step 7.15: the apex still answers with a copy of the site, so the head script
// sends apex visitors to www. Once Cloudflare's 301 for the apex is live and V3 passes,
// set this to false; the CSP hash follows automatically.
const APEX_JS_REDIRECT = true;
const HEAD_SCRIPT = (APEX_JS_REDIRECT
  ? "if(location.hostname==='valencesupplychain.com'){location.replace('https://www.valencesupplychain.com'+location.pathname+location.search+location.hash)}"
  : '') + "document.documentElement.className+=' js';";
const MAILTO = `mailto:${EMAIL}?subject=${encodeURIComponent("What's eating our week")}`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attrs = (s) => Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

// ───────────── logo ─────────────
// The mark is the silver knot with the V inside it (assets/img/brand, cut from the brand files by
// scripts/brand-assets.py). The words are the lockup's own lettering, as a picture, navy or paper.
function mark({ size = '30', label = '', eager = '' } = {}) {
  const alt = label ? esc(label) : '';
  const hidden = label ? '' : ' aria-hidden="true"';
  return `<picture class="mark"${hidden}><source srcset="/assets/img/brand/valence-mark.webp" type="image/webp">`
    + `<img src="/assets/img/brand/valence-mark.png" alt="${alt}" width="${size}" height="${size}" decoding="async"${eager ? '' : ' loading="lazy"'}></picture>`;
}
function words({ light = false } = {}) {
  return `<img class="wordmark__words" src="/assets/img/brand/valence-words${light ? '-light' : ''}.png" alt="Valence Supply Chain" width="762" height="52" decoding="async">`;
}

// ───────────── shared blocks ─────────────
const NAV = [
  ['Industries', '/#industries'],
  ['Services', '/services/'],
  ['How we work', '/how-we-work/'],
  ['Case studies', '/case-studies/', true],
  ['About', '/about/'],
];
function header(page) {
  const links = NAV.map(([t, h, blank]) => {
    const current = page.nav === t ? ' aria-current="page"' : '';
    const nt = blank && page.nav !== t ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${h}"${nt}${current}>${t}</a>`;
  }).join('\n          ');
  return `<header class="site-header">
    <div class="container site-header__bar">
      <a class="wordmark" href="/" aria-label="Valence Supply Chain, home">${mark({ size: '36', eager: '1' })}${words()}</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-menu"><span class="menu-toggle__bars" aria-hidden="true"></span><span class="menu-toggle__label">Menu</span></button>
      <div class="site-menu" id="site-menu">
        <nav class="site-nav" aria-label="Main">
          ${links}
        </nav>
        <a class="btn btn--dark" href="#contact">Book a 15-minute call</a>
      </div>
    </div>
  </header>`;
}

function cta({ label = 'Book a 15-minute call' } = {}) {
  return `<section id="contact" class="cta" aria-labelledby="cta-title">
    <div class="container cta__grid">
      <div>
        <h2 id="cta-title" class="cta__title">Tell us what's eating your week.</h2>
        <p class="cta__lede">Fifteen minutes, no deck. We'll say what we'd take first.</p>
        <p class="cta__direct"><a href="${MAILTO}">${EMAIL}</a><span aria-hidden="true"> · </span><a href="tel:${PHONE_TEL}">${PHONE}</a></p>
      </div>
      <div class="cta__action"><a class="btn btn--paper" href="${MAILTO}">${esc(label)}</a></div>
    </div>
  </section>`;
}

function footer(page) {
  const variant = page.footer === 'light' ? 'light' : 'dark';
  return `<footer class="site-footer site-footer--${variant}">
    <div class="container site-footer__grid">
      <div class="site-footer__col"><span class="site-footer__label">Industries</span><a href="/food-and-beverage/">Food and beverage</a><a href="/space/">Space and aerospace</a><a href="/data-centers-and-construction/">Data centers and construction</a></div>
      <div class="site-footer__col"><span class="site-footer__label">Company</span><a href="/services/">Services</a><a href="/how-we-work/">How we work</a><a href="/case-studies/">Case studies</a><a href="/about/">About</a></div>
      <div class="site-footer__col"><span class="site-footer__label">Contact</span><a href="#contact">Talk to us</a><a href="mailto:${EMAIL}">${EMAIL}</a><a href="tel:${PHONE_TEL}">${PHONE}</a></div>
      <div class="site-footer__col"><span class="site-footer__label">Legal</span><a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a><a href="/sms-terms" target="_blank" rel="noopener">SMS Terms</a></div>
      <div class="site-footer__note">${mark({ size: '44' })}</div>
    </div>
    <div class="container site-footer__fine">© 2026 Valence Supply Chain LLC · Los Angeles</div>
  </footer>`;
}

// ───────────── image slots ─────────────
function img({ name, ratio = '4/3', alt = '', label = '', sizes = '100vw', eager = '' }) {
  const base = `assets/img/${name}`;
  const has = ['800.jpg', '1600.jpg', '800.webp', '1600.webp'].every((s) => existsSync(join(ROOT, `${base}-${s}`)));
  const [w, h] = ratio.split('/').map(Number);
  const style = `aspect-ratio:${w}/${h}`;
  if (!has) {
    return `<div class="slot slot--empty" style="${style}" role="img" aria-label="${esc(alt)}"><span>${esc(label)}</span></div>`;
  }
  const H = (px) => Math.round((px * h) / w);
  const load = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<picture class="slot" style="${style}">`
    + `<source type="image/webp" srcset="/${base}-800.webp 800w, /${base}-1600.webp 1600w" sizes="${sizes}">`
    + `<img src="/${base}-800.jpg" srcset="/${base}-800.jpg 800w, /${base}-1600.jpg 1600w" sizes="${sizes}" width="800" height="${H(800)}" alt="${esc(alt)}" ${load} decoding="async">`
    + `</picture>`;
}

// ───────────── proof conveyor ─────────────
// Logos only, in one neutral color. A brand with a file at assets/logos/<slug>.svg
// (single color, inlined so it takes currentColor) or .png shows the logo; a brand
// without one shows its name as plain text at the same size.
const BRANDS = [
  'Walmart', 'Anheuser-Busch', 'Volvo', 'Aldi', 'Rivian', 'Labatt', 'Ingredion', 'TreeHouse Foods',
  'Refresco', 'Rich Products', 'Ferrara', 'Harvest Hill Beverage', 'FGF Brands', 'Premium Waters',
  'LT Foods Americas', 'Canadian Canning', 'Johanna Foods', 'F.X. Matt Brewing', 'Sanders Candy', 'Astor Chocolate',
];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function logoItem(name, hidden) {
  const s = slug(name);
  const file = ['svg', 'png'].map((x) => `assets/logos/${s}.${x}`).find((p) => existsSync(join(ROOT, p)));
  // The duplicate set only exists for the loop: hide it from assistive tech, and label nothing in it.
  const label = hidden ? 'aria-hidden="true" focusable="false"' : `role="img" aria-label="${esc(name)}" focusable="false"`;
  let inner;
  if (file && file.endsWith('.svg')) {
    inner = readFileSync(join(ROOT, file), 'utf8')
      .replace(/<title>[\s\S]*?<\/title>/g, '')
      .replace(/<\?xml[^>]*>/, '')
      .replace(/\s(width|height|role)="[^"]*"/g, '')
      .replace('<svg', `<svg class="logo" ${label} fill="currentColor" preserveAspectRatio="xMidYMid meet"`)
      .trim();
  } else if (file) {
    inner = `<img class="logo" src="/${file}" alt="${hidden ? '' : esc(name)}" loading="lazy" decoding="async">`;
  } else {
    inner = `<span class="logo-name">${esc(name)}</span>`;
  }
  return `<li class="logos__item"${hidden ? ' aria-hidden="true"' : ''}>${inner}</li>`;
}
function proof() {
  const first = BRANDS.map((b) => logoItem(b, false)).join('');
  const second = BRANDS.map((b) => logoItem(b, true)).join('');
  return `<div class="marquee" tabindex="0" role="region" aria-labelledby="proof-title"><ul class="marquee__track">${first}${second}</ul></div>`;
}

// ───────────── structured data (plan step 7.14) ─────────────
// Organization on every page; a Service on pages whose header names one ("service");
// a BreadcrumbList on pages whose header names a crumb ("crumb", the case studies).
const ORG_ID = SITE + '/#organization';
const AREA_SERVED = [{ '@type': 'Country', name: 'United States' }, { '@type': 'Country', name: 'Canada' }];
const ORGANIZATION = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'Valence Supply Chain LLC', alternateName: 'Valence', url: SITE + '/',
  logo: SITE + '/valence-mark-512.png', email: EMAIL, telephone: '+1-628-212-9947',
  address: { '@type': 'PostalAddress', addressLocality: 'Los Angeles', addressRegion: 'CA', addressCountry: 'US' },
  areaServed: AREA_SERVED,
  knowsAbout: ['Supplier management', 'Inventory reconciliation', 'Freight', 'Food and beverage', 'Aerospace logistics', 'Project freight'],
};
function structuredData(page, url) {
  const graph = [ORGANIZATION];
  if (page.service) {
    graph.push({
      '@type': 'Service',
      '@id': url + '#service',
      name: page.service.name,
      serviceType: page.service.type,
      description: page.description.replace(/\s*Book a 15-minute call[^.]*\.$/, ''),
      url,
      provider: { '@id': ORG_ID },
      areaServed: AREA_SERVED,
    });
  }
  if (page.crumb) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Case studies', item: SITE + '/case-studies/' },
        { '@type': 'ListItem', position: 3, name: page.crumb, item: url },
      ],
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

// ───────────── head ─────────────
// FAQ structured data, read from the page's own <details class="faq__item"> blocks so it never drifts
function faqJsonld(body) {
  const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"');
  const items = [...body.matchAll(/<details class="faq__item"[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
    .map(([, q, a]) => ({ '@type': 'Question', name: strip(q), acceptedAnswer: { '@type': 'Answer', text: strip(a) } }));
  return items.length ? `\n  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items })}</script>` : '';
}

function head(page, body = '') {
  const url = SITE + '/' + page.out.replace(/index\.html$/, '').replace(/(?<!^404)\.html$/, '');   // privacy.html is served at /privacy
  const robots = page.out === '404.html' ? '\n  <meta name="robots" content="noindex">' : '';
  const title = esc(page.title);
  const desc = esc(page.description);
  const jsonld = page.out === '404.html' ? '' : `\n  <script type="application/ld+json">${JSON.stringify(structuredData(page, url)).replace(/</g, '\\u003c')}</script>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <script>${HEAD_SCRIPT}</script>
  <script async src="${GA_TAG_URL}"></script>
  <script async src="/assets/js/analytics.js"></script>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title}</title>
  <meta name="description" content="${desc}">${robots}
  <link rel="canonical" href="${url}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96">
  <link rel="icon" href="/favicon-48.png" type="image/png" sizes="48x48">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta name="theme-color" content="#F8F9FA">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Valence Supply Chain">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${SITE}/og-image.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=Manrope:wght@300;400;500&display=swap">
  <link rel="stylesheet" href="/assets/css/site.css">${jsonld}${faqJsonld(body)}
</head>`;
}

// ───────────── build ─────────────
const pagesDir = join(ROOT, 'src/pages');
const built = [];
const pageHashes = {};
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
for (const file of readdirSync(pagesDir).filter((f) => f.endsWith('.html')).sort()) {
  const src = readFileSync(join(pagesDir, file), 'utf8');
  const m = src.match(/^<!--(\{[\s\S]*?\})-->\s*/);
  if (!m) throw new Error(`${file}: missing JSON header comment`);
  const page = JSON.parse(m[1]);
  let body = src.slice(m[0].length).replace(/<!--\s*@(\w+)([^>]*?)-->/g, (_, name, rest) => {
    const a = attrs(rest);
    switch (name) {
      case 'header': return header(page);
      case 'footer': return footer(page);
      case 'cta': return cta(a);
      case 'mark': return mark(a);
      case 'img': return img(a);
      case 'proof': return proof();
      default: throw new Error(`${file}: unknown directive @${name}`);
    }
  });
  const scripts = ['/assets/js/site.js', ...(page.scripts || [])].map((s) => `  <script src="${s}" defer></script>`).join('\n');
  const html = `${head(page, body)}\n<body class="${page.bodyClass || ''}">\n  <a class="skip-link" href="#main">Skip to content</a>\n${body.trim()}\n${scripts}\n</body>\n</html>\n`;
  const out = join(DIST, page.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  built.push(page.out);
  pageHashes[page.out] = createHash('sha256').update(html).digest('hex');
}

// ───────────── lastmod (plan step 7.16) ─────────────
// A page's lastmod is the day its built HTML last changed, not the build date, so
// Google can trust it. src/lastmod.json holds { out: { sha256, lastmod } }; a page
// whose hash differs from the recorded one gets today's date (UTC).
const LASTMOD_FILE = join(ROOT, 'src/lastmod.json');
const today = new Date().toISOString().slice(0, 10);
const previous = existsSync(LASTMOD_FILE) ? JSON.parse(readFileSync(LASTMOD_FILE, 'utf8')) : {};
const lastmod = {};
for (const out of [...built].sort()) {
  const prev = previous[out];
  lastmod[out] = prev && prev.sha256 === pageHashes[out] ? prev : { sha256: pageHashes[out], lastmod: today };
}
const lastmodJson = JSON.stringify(lastmod, null, 2) + '\n';
if (!existsSync(LASTMOD_FILE) || readFileSync(LASTMOD_FILE, 'utf8') !== lastmodJson) writeFileSync(LASTMOD_FILE, lastmodJson);

// ───────────── static files ─────────────
cpSync(join(ROOT, 'assets'), join(DIST, 'assets'), { recursive: true });
for (const f of STATIC_FILES) cpSync(join(ROOT, f), join(DIST, f));

// ───────────── Google Analytics (plan 7.26) ─────────────
// The setup lines Google gives as an inline <script>, written as a file on our own site so
// the CSP needs no 'unsafe-inline'. Google signals and ad personalization stay off.
writeFileSync(join(DIST, 'assets/js/analytics.js'), `// Google Analytics 4. Written by scripts/build.mjs from GA_ID in scripts/config.mjs; edit there.
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('set', 'allow_google_signals', false);
gtag('set', 'allow_ad_personalization_signals', false);
gtag('config', '${GA_ID}');
`);

// ───────────── serve.json: headers (plan steps 1.13, 1.14) ─────────────
// Lives at the repo root, outside the served folder; `serve dist --config ../serve.json`
// refuses to start if it is missing, so the site never runs without its headers.
// One CSP for every page; script-src lists the hash of every inline script the
// build wrote (today that is HEAD_SCRIPT alone, the same on every page).
const inlineHashes = [...new Set([sha256(HEAD_SCRIPT)])];
const csp = ["default-src 'self'", `script-src 'self' ${SCRIPT_HOSTS.join(' ')} ${inlineHashes.join(' ')}`, ...CSP_BASE.filter((d) => !d.startsWith('default-src'))].join('; ');
const serveJson = {
  directoryListing: false,
  headers: [
    { source: '**', headers: [{ key: 'Content-Security-Policy', value: csp }, ...Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value }))] },
    { source: 'assets/**', headers: [{ key: 'Cache-Control', value: ASSET_CACHE }] },
  ],
};
writeFileSync(join(ROOT, 'serve.json'), JSON.stringify(serveJson, null, 2) + '\n');

// sitemap from the pages that were built
const listed = built.filter((o) => o !== '404.html').sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${listed.map((o) => `  <url><loc>${SITE}/${o.replace(/index\.html$/, '').replace(/\.html$/, '')}</loc><lastmod>${lastmod[o].lastmod}</lastmod></url>`).join('\n')}
</urlset>
`);
console.log(`built ${built.length} pages into dist/: ${built.join(', ')}`);

// ───────────── checks (plan steps 1.16, 6.3) ─────────────
const problems = checkDist(DIST);
if (problems.length) {
  for (const x of problems) console.error(`FAIL  ${x}`);
  console.error(`\nbuild failed: ${problems.length} problem(s) in dist/`);
  process.exit(1);
}
console.log('check: dist/ passes');
