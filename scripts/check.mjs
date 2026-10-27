#!/usr/bin/env node
// Static checks on the built site in dist/. Node built-ins only; build.mjs runs them
// last and fails the build on any problem, so nothing that breaks these rules reaches
// main or Railway. Run on their own with `node scripts/check.mjs [dir]`.
//
//   1.16  dist/ holds only site files: no .md, package.json, src/, scripts/, docs/,
//         dotfiles or anything outside the allowed file types.
//   1.16  every inline <script> that runs has its sha256 in the CSP in serve.json,
//         and no page uses inline event handlers or javascript: URLs (the CSP blocks them).
//   6.3   every login link is exactly LOGIN; nothing else links to the app hosts; each page
//         has 0 login links (until labs. is live) or 2 (header and footer), never 1 or 3+;
//         no page holds a form, a password field, an iframe, an embed or a meta refresh.
//   6.5   a script from another site loads only if it is on THIRD_PARTY_SCRIPTS (today: Google
//         Analytics with GA_ID), and the CSP's script-src names no source beyond SCRIPT_HOSTS.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOGIN, APP_HOST_PATTERNS, THIRD_PARTY_SCRIPTS, SCRIPT_HOSTS, SITE, CSP_BASE, SECURITY_HEADERS } from './config.mjs';

const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico',
  '.mp4', '.webm', '.xml', '.txt', '.webmanifest', '.woff2']);
const BANNED_NAMES = new Set(['package.json', 'package-lock.json', 'readme.md', 'serve.json']);
const BANNED_DIRS = new Set(['src', 'scripts', 'docs', 'node_modules', 'test', '.git', '.github']);
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

export function checkDist(dist, { login = LOGIN, serveJson = join(dist, '..', 'serve.json') } = {}) {
  const problems = [...checkLoginConstant(login)];
  if (!existsSync(dist)) return [`${dist}: does not exist; run node scripts/build.mjs`];
  const files = walk(dist);
  for (const f of files) {
    const rel = relative(dist, f).split(sep).join('/');
    const parts = rel.split('/');
    const name = parts[parts.length - 1];
    if (parts.some((s) => s.startsWith('.'))) problems.push(`${rel}: dotfile in dist/`);
    else if (parts.slice(0, -1).some((d) => BANNED_DIRS.has(d.toLowerCase()))) problems.push(`${rel}: source folder in dist/`);
    else if (BANNED_NAMES.has(name.toLowerCase()) || /\.(md|mjs|cjs|ts|map|json|lock|env|yml|yaml)$/i.test(name)) problems.push(`${rel}: not a site file`);
    else {
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
      if (!ALLOWED_EXT.has(ext)) problems.push(`${rel}: file type ${ext || '(none)'} is not on the allowed list`);
    }
  }
  const scriptSrc = scriptSrcFromServeJson(serveJson, problems);
  let pages = 0;
  for (const f of files.filter((x) => x.endsWith('.html'))) {
    const rel = relative(dist, f).split(sep).join('/');
    pages++;
    problems.push(...checkHtml(rel, readFileSync(f, 'utf8'), scriptSrc, login).problems);
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
