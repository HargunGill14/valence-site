#!/usr/bin/env node
// Builds the static site from src/pages/*.html. Node built-ins only.
// Run from anywhere: `node scripts/build.mjs`. The output is committed, so the
// site itself has no build step: any static host can serve the repo as is.
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

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.valencesupplychain.com';
const EMAIL = 'ops@valencesupplychain.com';
const PHONE = '(628) 218-8500';
const PHONE_TEL = '+16282188500';
const LOGIN = 'https://app.substrate-lab.com';
const MAILTO = `mailto:${EMAIL}?subject=${encodeURIComponent("What's eating our week")}`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attrs = (s) => Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

// ───────────── logo mark ─────────────
// The V is the one on the office door in the intro: a thick stroke down, a thin stroke up, round ends.
// The ring is an orbit, and the clay electron travels it, passing behind the V on the far side.
let markSeq = 0;
const MARK = {
  dark: { v: '#15140F', ring: '#5F7A64' },
  light: { v: '#EEEDE8', ring: '#98AE9C' },
};
const DOT = '#B9573A';
function mark({ variant = 'dark', size = '30', label = '' } = {}) {
  const { v, ring } = MARK[variant];
  const id = `vm${++markSeq}`;
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
  const orbit = 'M 88 0 A 88 30 0 1 1 -88 0 A 88 30 0 1 1 88 0';
  const electron = `<g transform="rotate(-18)"><circle r="7.5" fill="${DOT}"><animateMotion dur="7s" repeatCount="indefinite" path="${orbit}"/></circle></g>`;
  const ellipse = `<ellipse rx="88" ry="30" transform="rotate(-18)" fill="none" stroke="${ring}" stroke-width="5"/>`;
  return `<svg class="mark" viewBox="-100 -100 200 200" width="${size}" height="${size}" ${a11y}>`
    + `<defs><clipPath id="${id}b"><polygon points="-100,-100 100,-100 100,-32.49 -100,32.49"/></clipPath>`
    + `<clipPath id="${id}f"><polygon points="-100,32.49 100,-32.49 100,100 -100,100"/></clipPath></defs>`
    + `<g clip-path="url(#${id}b)">${electron}</g>${ellipse}`
    + `<path d="M-46 -48 L0 46" fill="none" stroke="${v}" stroke-width="22" stroke-linecap="round"/>`
    + `<path d="M0 46 L46 -48" fill="none" stroke="${v}" stroke-width="8" stroke-linecap="round"/>`
    + `<g clip-path="url(#${id}f)">${ellipse}${electron}</g></svg>`;
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
      <a class="wordmark" href="/" aria-label="Valence, home">${mark({ variant: 'dark', size: '30' })}<span>Valence</span></a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-menu"><span class="menu-toggle__bars" aria-hidden="true"></span><span class="menu-toggle__label">Menu</span></button>
      <div class="site-menu" id="site-menu">
        <nav class="site-nav" aria-label="Main">
          ${links}
        </nav>
        <a class="site-login" href="${LOGIN}">Customer login</a>
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
      <div class="site-footer__col"><span class="site-footer__label">Contact</span><a href="#contact">Talk to us</a><a href="${LOGIN}">Customer login</a><a href="mailto:${EMAIL}">${EMAIL}</a><a href="tel:${PHONE_TEL}">${PHONE}</a></div>
      <div class="site-footer__note">${mark({ variant: variant === 'dark' ? 'light' : 'dark', size: '36' })}</div>
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

// ───────────── head ─────────────
function head(page) {
  const url = SITE + '/' + page.out.replace(/index\.html$/, '');
  const robots = page.out === '404.html' ? '\n  <meta name="robots" content="noindex">' : '';
  const title = esc(page.title);
  const desc = esc(page.description);
  const jsonld = page.out === 'index.html' ? `\n  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Valence Supply Chain LLC', alternateName: 'Valence', url: SITE + '/',
    logo: SITE + '/valence-mark-512.png', email: EMAIL, telephone: '+1-628-218-8500',
    address: { '@type': 'PostalAddress', addressLocality: 'Los Angeles', addressRegion: 'CA', addressCountry: 'US' },
    knowsAbout: ['Supplier management', 'Inventory reconciliation', 'Freight', 'Food and beverage', 'Aerospace logistics', 'Project freight'],
  })}</script>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <script>if(location.hostname==='valencesupplychain.com'){location.replace('https://www.valencesupplychain.com'+location.pathname+location.search+location.hash)}document.documentElement.className+=' js';</script>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title}</title>
  <meta name="description" content="${desc}">${robots}
  <link rel="canonical" href="${url}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta name="theme-color" content="#F4F1EA">
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
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap">
  <link rel="stylesheet" href="/assets/css/site.css">${jsonld}
</head>`;
}

// ───────────── build ─────────────
const pagesDir = join(ROOT, 'src/pages');
const built = [];
for (const file of readdirSync(pagesDir).filter((f) => f.endsWith('.html')).sort()) {
  markSeq = 0;
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
  const html = `${head(page)}\n<body class="${page.bodyClass || ''}">\n  <a class="skip-link" href="#main">Skip to content</a>\n${body.trim()}\n${scripts}\n</body>\n</html>\n`;
  const out = join(ROOT, page.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  built.push(page.out);
}

// sitemap from the pages that were built
const today = new Date().toISOString().slice(0, 10);
const listed = built.filter((o) => o !== '404.html').sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${listed.map((o) => `  <url><loc>${SITE}/${o.replace(/index\.html$/, '')}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
console.log(`built ${built.length} pages: ${built.join(', ')}`);
