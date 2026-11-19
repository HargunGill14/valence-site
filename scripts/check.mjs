#!/usr/bin/env node
// Static checks on the built site in dist/. Node built-ins only; build.mjs runs them
// last and fails the build on any problem, so nothing that breaks these rules reaches
// main or the host. Run on their own with `node scripts/check.mjs [dir]`.
//
//   1.16  dist/ holds only site files: no .md, package.json, src/, scripts/, docs/,
//         dotfiles or anything outside the allowed file types.
//   1.16  every inline <script> that runs has its sha256 in the CSP in serve.json,
//         and no page uses inline event handlers or javascript: URLs (the CSP blocks them).
//   6.3   every login link is exactly LOGIN; nothing else links to the app hosts; each page
//         has 0 login links (until labs. is live) or 2 (header and footer), never 1 or 3+;
//         no page holds a form, a password field, an iframe, an embed or a meta refresh.
//   6.5   a script from another site loads only if it is on THIRD_PARTY_SCRIPTS (today: Google
//         Analytics with GA_ID, Microsoft Clarity with CLARITY_ID and Cloudflare Turnstile), and the
//         CSP's script-src names no source beyond SCRIPT_HOSTS.
//   16    dist/_headers (what Cloudflare serves) is exactly headersFile(serve.json), so the live
//         headers are the ones checked above; no file in dist/ holds a Slack webhook URL or names
//         a secret; Turnstile loads only on a page that holds a quote form (the box, the map's
//         pick-a-lane or the quote page), and every such page loads it once; all three post only to
//         QUOTE_ENDPOINT; the map's places are exactly scripts/map-places.mjs (what the Worker
//         accepts); the quote page's explainers in quote.js cover exactly the options in
//         scripts/quote-fields.mjs; _redirects holds only same-site 301s; and no page or script
//         breaks the quote copy rules (Hargun, Nov 18): nothing says a person, our desk or our team
//         prices it, and no "within the hour", "business hours", "AI pricing" or the lines Jesse
//         took out.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOGIN, APP_HOST_PATTERNS, THIRD_PARTY_SCRIPTS, SCRIPT_HOSTS, SITE, CSP_BASE, SECURITY_HEADERS, TURNSTILE_SCRIPT_URL, LEAD_ENDPOINT } from './config.mjs';
import { headersFile } from './headers.mjs';
import { QUOTE_ENDPOINT, QUOTE_OPTIONS } from './quote-fields.mjs';
import { MAP_CITIES, MAP_STATES } from './map-places.mjs';

const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico',
  '.mp4', '.webm', '.xml', '.txt', '.webmanifest', '.woff2']);
const BANNED_NAMES = new Set(['package.json', 'package-lock.json', 'readme.md', 'serve.json']);
const BANNED_DIRS = new Set(['src', 'scripts', 'docs', 'node_modules', 'test', 'worker', '.git', '.github', '.wrangler']);
// Files Cloudflare's static assets read as configuration, allowed at the top of dist/ only.
const HOST_FILES = new Set(['_headers', '_redirects']);
const REDIRECT_LINE = /^(\/[A-Za-z0-9._~\/-]*) (\/[A-Za-z0-9._~\/-]*) 301$/;
// Text that must never reach the public folder: a Slack webhook, or the name of a Worker secret
// (a sign that a config or env file was copied in).
const SECRET_MARKERS = [/hooks\.slack\.com\/(services|workflows|triggers)\//i, /SLACK_WEBHOOK_URL/, /TURNSTILE_SECRET_KEY/, /FORMSPREE_QUOTE_FORM_ID/];
// The only Formspree form a public file may name is the contact questionnaire's (LEAD_ENDPOINT).
// Any other form ID in dist/ is the quote form's secret ID leaking. When the ID is in the
// environment (FORMSPREE_QUOTE_FORM_ID, read with a hidden prompt), its exact value is scanned for too.
const FORMSPREE_FORM = /formspree\.io\/f\/([A-Za-z0-9]+)/gi;
const TEXT_EXT = /\.(html|css|js|svg|xml|txt|webmanifest)$|^_headers$|^_redirects$/i;

// The quote copy rules (Hargun, Nov 18 14:19; Jesse, Nov 18 14:17), checked on every page's visible
// text and meta description. Pricing will become agentic, so nothing says who prices a quote.
export const BANNED_COPY = [
  // "within the hour" about a quote or a price (a case study's "book a hot shot within the hour" is service, not a quote)
  [/\b(quotes?|quoted|pric\w*|reply|replies|respond\w*|back to you)\b[^.]{0,60}\bwithin the hour\b|\bwithin the hour\b[^.]{0,40}\b(quotes?|pric\w*)\b/i, '"within the hour" about a quote'],
  [/business hours/i, '"business hours"'],
  [/\bAI pricing\b|\bauto-?quote\b/i, 'a line about AI or automatic pricing'],
  [/\b(a person|someone|a human|our (quoting )?desk|our team|the team|our people)\b[^.]{0,40}\bpric(e|es|ed|ing)\b/i, 'a line saying a person, our desk or our team prices it'],
  [/\bpric(ed|es)\b[^.]{0,20}\bby (a person|a human|our (quoting )?desk|our team|someone)\b/i, 'a line saying a person, our desk or our team prices it'],
  [/\bquoting desk\b/i, '"quoting desk"'],
  [/chassis, fuel and the empty return/i, 'the all-in drayage line (Jesse: out for good)'],
  [/real sailings and flights/i, '"priced from real sailings and flights" (unconfirmed)'],
  [/freight-class quiz/i, '"no freight-class quiz" (unconfirmed)'],
];
export function checkCopy(rel, html) {
  const visible = stripTags(html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ').replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' '));
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => attr(m[0], 'content') || '').join(' ');
  const text = visible + ' ' + meta;
  return BANNED_COPY.filter(([re]) => re.test(text)).map(([, what]) => `${rel}: breaks the quote copy rules: ${what}`);
}

// The same rules on a script's text, for copy that only exists in JavaScript (the quote page's
// option explainers, the boxes' messages).
export function checkScriptCopy(rel, js) {
  return BANNED_COPY.filter(([re]) => re.test(js)).map(([, what]) => `${rel}: breaks the quote copy rules: ${what}`);
}

// The quote page: quote.js explains each option by id (COPY), and the page renders the options from
// QUOTE_OPTIONS, the lists the Worker accepts. Every option needs an explainer and every explainer an option.
export function checkQuoteExplainers(rel, js) {
  const body = (js.match(/var COPY = \{([\s\S]*?)\n {2}\};/) || [])[1];
  if (body === undefined) return [`${rel}: no COPY table of option explainers`];
  const have = new Set([...body.matchAll(/^\s*(\w+): \{/gm)].map((m) => m[1]));
  const want = new Set([...Object.keys(QUOTE_OPTIONS.pickup), ...Object.keys(QUOTE_OPTIONS.delivery)]);
  return [
    ...[...want].filter((id) => !have.has(id)).map((id) => `${rel}: the option ${id} in scripts/quote-fields.mjs has no explainer`),
    ...[...have].filter((id) => !want.has(id)).map((id) => `${rel}: explains ${id}, which is not an option in scripts/quote-fields.mjs`),
  ];
}

// The map's places: every city dot and state on the built map must be in scripts/map-places.mjs with
// the same ZIP or abbreviation, and every listed place must be on the map.
export function checkMapPlaces(rel, html) {
  const problems = [];
  const cities = [...html.matchAll(/<g\b[^>]*\sdata-city="([^"]*)"[^>]*>/g)].map((m) => [decode(m[1]), attr(m[0], 'data-zip')]);
  const states = [...html.matchAll(/<path\b[^>]*\sdata-state="([^"]*)"[^>]*>/g)].map((m) => [decode(m[1]), attr(m[0], 'data-abbr')]);
  if (!cities.length && !states.length) return problems;
  for (const [name, zip] of cities) if (MAP_CITIES[name] !== zip) problems.push(`${rel}: map city ${name} (${zip}) is not in scripts/map-places.mjs with that ZIP`);
  for (const [name, abbr] of states) if (MAP_STATES[name] !== abbr) problems.push(`${rel}: map state ${name} (${abbr}) is not in scripts/map-places.mjs`);
  const onMapC = new Set(cities.map(([n]) => n)), onMapS = new Set(states.map(([n]) => n));
  for (const n of Object.keys(MAP_CITIES)) if (!onMapC.has(n)) problems.push(`${rel}: scripts/map-places.mjs lists the city ${n}, which is not on the map`);
  for (const n of Object.keys(MAP_STATES)) if (!onMapS.has(n)) problems.push(`${rel}: scripts/map-places.mjs lists the state ${n}, which is not on the map`);
  return problems;
}
const LOGIN_WORDS = /\b(log\s*-?in|sign\s*-?in|logon|customer\s+portal)\b/i;
const LOGIN_PATH = /\/(login|signin|sign-in|logon|auth)(\/|$|\?)/i;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const stripTags = (s) => decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[1] ?? m[2] ?? m[3]) : null;
};
export const sha256 = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

function scriptSrcFromServeJson(file, problems) {
  if (!existsSync(file)) { problems.push('serve.json: missing, so no security headers are sent'); return null; }
  let config;
  try { config = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { problems.push(`serve.json: not valid JSON (${e.message})`); return null; }
  if (config.directoryListing !== false) problems.push('serve.json: directoryListing must be false');
  const all = (config.headers || []).find((h) => h.source === '**');
  const csp = all && all.headers.find((h) => h.key.toLowerCase() === 'content-security-policy');
  if (!csp) { problems.push('serve.json: no Content-Security-Policy on "**"'); return null; }
  // 1.13: every security header and every CSP directive exactly as scripts/config.mjs sets them,
  // so a hand edit to serve.json that weakens one fails the build.
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    const h = all.headers.find((x) => x.key.toLowerCase() === key.toLowerCase());
    if (!h) problems.push(`serve.json: ${key} is missing`);
    else if (h.value !== value) problems.push(`serve.json: ${key} is "${h.value}", expected "${value}"`);
  }
  const directives = csp.value.split(';').map((d) => d.trim()).filter(Boolean);
  for (const d of CSP_BASE) if (!directives.includes(d)) problems.push(`serve.json: CSP is missing or changed "${d}"`);
  for (const d of directives) if (!d.startsWith('script-src ') && !CSP_BASE.includes(d)) problems.push(`serve.json: CSP has an unexpected directive "${d}"`);
  const directive = csp.value.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src '));
  if (!directive) { problems.push('serve.json: CSP has no script-src'); return null; }
  const tokens = directive.split(/\s+/).slice(1);
  if (tokens.includes("'unsafe-inline'")) problems.push("serve.json: script-src must not allow 'unsafe-inline'");
  for (const t of tokens) {
    if (t === "'self'" || /^'sha256-[A-Za-z0-9+/=]+'$/.test(t) || SCRIPT_HOSTS.includes(t)) continue;
    problems.push(`serve.json: script-src allows ${t}, which is not on SCRIPT_HOSTS in scripts/config.mjs`);
  }
  return new Set(tokens);
}

function isAppHost(host) {
  return APP_HOST_PATTERNS.some((re) => re.test(host));
}

export function checkLoginConstant(login = LOGIN) {
  const problems = [];
  let u;
  try { u = new URL(login); } catch { return [`LOGIN is not a URL: ${login}`]; }
  if (u.protocol !== 'https:') problems.push(`LOGIN must be https: ${login}`);
  if (u.search || u.hash || u.username || u.password) problems.push(`LOGIN must have no query, fragment or credentials: ${login}`);
  if (!isAppHost(u.hostname)) problems.push(`LOGIN host ${u.hostname} is not an approved app host`);
  return problems;
}

export function checkHtml(rel, html, scriptSrc, login = LOGIN) {
  const problems = [];
  const p = (msg) => problems.push(`${rel}: ${msg}`);

  // Inline scripts: JSON-LD is data (browsers don't run it); anything else needs its hash in the CSP.
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const [, attrs, body] = m;
    const type = (attr(`<x ${attrs}>`, 'type') || '').toLowerCase();
    const src = attr(`<x ${attrs}>`, 'src');
    if (src !== null) {
      let u = null;
      try { u = new URL(src, SITE + '/'); } catch { /* reported below */ }
      const ownSite = u && u.origin === new URL(SITE).origin && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(src.trim());
      if (!ownSite && !THIRD_PARTY_SCRIPTS.includes(src)) p(`third-party script not on THIRD_PARTY_SCRIPTS in scripts/config.mjs: ${src}`);
      continue;
    }
    if (type === 'application/ld+json') {
      try { JSON.parse(body); } catch (e) { p(`JSON-LD block is not valid JSON (${e.message})`); }
      continue;
    }
    const h = sha256(body);
    if (!scriptSrc || !scriptSrc.has(h)) p(`inline script ${h} is not in the CSP script-src: ${body.trim().slice(0, 60)}…`);
  }
  for (const m of html.matchAll(/<[a-z][^>]*\son[a-z]+\s*=\s*["'][^>]*>/gi)) p(`inline event handler (blocked by the CSP): ${m[0].slice(0, 80)}`);
  if (/(href|src|action)\s*=\s*["']\s*javascript:/i.test(html)) p('javascript: URL');

  // Nothing on a marketing page ever collects a password or frames another site (6.2).
  if (/<form\b/i.test(html)) p('has a <form>; the marketing site collects nothing');
  if (/<input\b[^>]*type\s*=\s*["']?password/i.test(html)) p('has a password field');
  for (const tag of ['iframe', 'frame', 'frameset', 'embed', 'object']) {
    if (new RegExp(`<${tag}\\b`, 'i').test(html)) p(`has an <${tag}>`);
  }
  if (/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(html)) p('has a meta refresh redirect');

  // Login links (6.3).
  let loginLinks = 0;
  for (const m of html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a\s*>/gi)) {
    const [, open, inner] = m;
    const href = attr(open, 'href');
    if (href === null) continue;
    const text = stripTags(inner) + ' ' + (attr(open, 'aria-label') || '') + ' ' + (attr(open, 'title') || '');
    let url = null;
    try { url = new URL(href, 'https://www.valencesupplychain.com/'); } catch { /* relative junk is caught below */ }
    const toAppHost = url && /^https?:$/.test(url.protocol) && isAppHost(url.hostname);
    const looksLikeLogin = LOGIN_WORDS.test(text) || (url && LOGIN_PATH.test(url.pathname)) || /\bsite-login\b/.test(attr(open, 'class') || '');
    if (!toAppHost && !looksLikeLogin) continue;
    loginLinks++;
    if (href !== login) p(`login link must be exactly ${login}, found ${href} ("${stripTags(inner).slice(0, 40)}")`);
    else if (attr(open, 'target') !== null) p(`login link must open in the same tab (remove target): ${open}`);
  }
  if (loginLinks !== 0 && loginLinks !== 2) p(`has ${loginLinks} login links; expected 0 (until labs. is live) or 2 (header and footer)`);
  return { problems, loginLinks };
}

export function checkDist(dist, { login = LOGIN, serveJson = join(dist, '..', 'serve.json'), formspreeQuoteId = process.env.FORMSPREE_QUOTE_FORM_ID || '' } = {}) {
  const problems = [...checkLoginConstant(login)];
  if (!existsSync(dist)) return [`${dist}: does not exist; run node scripts/build.mjs`];
  const files = walk(dist);
  for (const f of files) {
    const rel = relative(dist, f).split(sep).join('/');
    const parts = rel.split('/');
    const name = parts[parts.length - 1];
    if (parts.some((s) => s.startsWith('.'))) problems.push(`${rel}: dotfile in dist/`);
    else if (HOST_FILES.has(name) && parts.length === 1) { /* checked below */ }
    else if (parts.slice(0, -1).some((d) => BANNED_DIRS.has(d.toLowerCase()))) problems.push(`${rel}: source folder in dist/`);
    else if (BANNED_NAMES.has(name.toLowerCase()) || /\.(md|mjs|cjs|ts|map|json|lock|env|yml|yaml)$/i.test(name)) problems.push(`${rel}: not a site file`);
    else {
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
      if (!ALLOWED_EXT.has(ext)) problems.push(`${rel}: file type ${ext || '(none)'} is not on the allowed list`);
    }
  }
  const scriptSrc = scriptSrcFromServeJson(serveJson, problems);
  // _headers: what Cloudflare sends must be what serve.json says (and serve.json was just checked).
  const hf = join(dist, '_headers');
  if (!existsSync(hf)) problems.push('_headers: missing, so Cloudflare would serve the site without its security headers');
  else if (existsSync(serveJson)) {
    let expected = null;
    try { expected = headersFile(JSON.parse(readFileSync(serveJson, 'utf8'))); } catch { /* serve.json problems are reported above */ }
    if (expected !== null && readFileSync(hf, 'utf8') !== expected) problems.push('_headers: differs from serve.json; run node scripts/build.mjs (never edit _headers by hand)');
  }
  // _redirects: same-site 301s only, never to another host.
  const rf = join(dist, '_redirects');
  if (existsSync(rf)) {
    for (const line of readFileSync(rf, 'utf8').split('\n').filter((l) => l.trim())) {
      if (!REDIRECT_LINE.test(line) || line.includes('//')) problems.push(`_redirects: only "/from /to 301" lines on this site are allowed, found "${line.slice(0, 80)}"`);
    }
  }
  for (const f of files) {
    const rel = relative(dist, f).split(sep).join('/');
    if (!TEXT_EXT.test(rel.split('/').pop())) continue;
    const text = readFileSync(f, 'utf8');
    for (const re of SECRET_MARKERS) if (re.test(text)) problems.push(`${rel}: holds a secret or a secret's name (${re.source})`);
    const allowed = LEAD_ENDPOINT ? LEAD_ENDPOINT.split('/f/')[1] : null;
    for (const m of text.matchAll(FORMSPREE_FORM)) if (m[1] !== allowed) problems.push(`${rel}: names a Formspree form other than the questionnaire's (the quote form ID is a Worker secret)`);
    const quoteId = formspreeQuoteId;
    if (quoteId && text.includes(quoteId)) problems.push(`${rel}: holds the value of FORMSPREE_QUOTE_FORM_ID`);
    if (/^assets\/js\/[^/]+\.js$/.test(rel)) problems.push(...checkScriptCopy(rel, text));
    if (rel === 'assets/js/quote.js') problems.push(...checkQuoteExplainers(rel, text));
  }

  let pages = 0;
  for (const f of files.filter((x) => x.endsWith('.html'))) {
    const rel = relative(dist, f).split(sep).join('/');
    pages++;
    const html = readFileSync(f, 'utf8');
    problems.push(...checkHtml(rel, html, scriptSrc, login).problems);
    problems.push(...checkCopy(rel, html));
    problems.push(...checkMapPlaces(rel, html));
    // Turnstile only where a quote form is (the box, the map's pick-a-lane or the quote page), and wherever one is.
    const hasBox = /\s(?:data-rate-box|data-pick-card|data-quote)(?=[\s>])/.test(html);
    if (/\sdata-quote(?=[\s>])/.test(html) && !html.includes('<script src="/assets/js/quote.js" defer>')) problems.push(`${rel}: holds the quote page form but does not load /assets/js/quote.js`);
    const turnstile = html.split(`src="${TURNSTILE_SCRIPT_URL}"`).length - 1;
    if (hasBox && turnstile !== 1) problems.push(`${rel}: has a quote form but loads Turnstile ${turnstile} times (expected once)`);
    if (!hasBox && turnstile) problems.push(`${rel}: loads Turnstile without a quote form`);
    // Every quote form posts to the Worker endpoint and nowhere else.
    for (const m of html.matchAll(/<[a-z][^>]*\s(?:data-rate-box|data-pick-card|data-quote)(?=[\s>])[^>]*>/gi)) {
      const ep = attr(m[0], 'data-rate-endpoint') ?? attr(m[0], 'data-pick-endpoint') ?? attr(m[0], 'data-quote-endpoint');
      if (ep !== QUOTE_ENDPOINT) problems.push(`${rel}: a quote form posts to ${ep === null ? 'nothing' : ep}, not ${QUOTE_ENDPOINT}`);
    }
  }
  if (pages === 0) problems.push('dist/ has no pages');
  return problems;
}

// CLI
if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dist = resolve(process.argv[2] || join(ROOT, 'dist'));
  const problems = checkDist(dist);
  for (const x of problems) console.error(`FAIL  ${x}`);
  console.log(problems.length ? `\n${problems.length} problem(s) in ${dist}` : `check: ${dist} passes`);
  process.exit(problems.length ? 1 : 0);
}
