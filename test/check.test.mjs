// Tests for scripts/check.mjs (plan steps 1.16 and 6.3, verification V21). `node --test`.
// Each case copies the real dist/ and serve.json into a temp folder, breaks one thing,
// and expects checkDist to name it. The first case is the control: the real build passes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDist, checkLoginConstant } from '../scripts/check.mjs';
import { LOGIN, GA_ID, GA_TAG_URL, SCRIPT_HOSTS, CLARITY_ID, CLARITY_TAG_URL, TURNSTILE_ORIGIN, TURNSTILE_SCRIPT_URL, TURNSTILE_SITE_KEY, LEAD_ENDPOINT } from '../scripts/config.mjs';
import { QUOTE_ENDPOINT, MAP_MODES, PORTS, EQUIPMENT, ITEM_TYPES, ITEM_LIMITS, QUOTE_OPTIONS, QUOTE_OPTIONS_SHOWN, MAX } from '../scripts/quote-fields.mjs';
import { MAP_CITIES, MAP_STATES } from '../scripts/map-places.mjs';
import { headersFile } from '../scripts/headers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function copy() {
  const dir = mkdtempSync(join(tmpdir(), 'valence-check-'));
  cpSync(join(ROOT, 'dist'), join(dir, 'dist'), { recursive: true });
  cpSync(join(ROOT, 'serve.json'), join(dir, 'serve.json'));
  return dir;
}
function withCopy(fn) {
  const dir = copy();
  try { return fn(join(dir, 'dist'), dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const editPage = (dist, rel, f) => writeFileSync(join(dist, rel), f(readFileSync(join(dist, rel), 'utf8')));
const expectProblem = (problems, re) => assert.ok(problems.some((p) => re.test(p)), `expected a problem matching ${re}, got:\n${problems.join('\n')}`);

test('control: the real build passes', () => {
  withCopy((dist) => assert.deepEqual(checkDist(dist), []));
});

test('LOGIN is the labs. sign-in host', () => {
  assert.equal(LOGIN, 'https://labs.valencesupplychain.com');
});

test('every built page has 0 login links (until labs. is live) or 2 (header and footer), all exactly LOGIN', () => {
  const pages = readdirSync(join(ROOT, 'dist'), { recursive: true }).filter((f) => String(f).endsWith('.html'));
  assert.ok(pages.length >= 15, `only ${pages.length} pages built`);
  for (const rel of pages) {
    const html = readFileSync(join(ROOT, 'dist', rel), 'utf8');
    const links = html.match(new RegExp(`href="${LOGIN.replace(/[.]/g, '\\.')}"`, 'g')) || [];
    assert.ok(links.length === 0 || links.length === 2, `${rel}: ${links.length} login links`);
  }
});

// ---- 6.3: login links (V21) -------------------------------------------------
// The site has no login link until labs. is live, so each case adds the links it needs.
const loginLink = (href, extra = '') => `<a class="site-login" href="${href}"${extra}>Customer login</a>`;
const addLinks = (dist, rel, ...links) => editPage(dist, rel, (h) => h.replace('</main>', links.join('') + '</main>'));

test('two login links, both exactly LOGIN, pass (the button coming back)', () => {
  withCopy((dist) => {
    addLinks(dist, 'about/index.html', loginLink(LOGIN), loginLink(LOGIN));
    assert.deepEqual(checkDist(dist), []);
  });
});

test('a page with one login link, or three, fails', () => {
  withCopy((dist) => {
    addLinks(dist, 'about/index.html', loginLink(LOGIN));
    expectProblem(checkDist(dist), /about\/index\.html: has 1 login links; expected 0 .* or 2/);
  });
  withCopy((dist) => {
    addLinks(dist, 'about/index.html', loginLink(LOGIN), loginLink(LOGIN), loginLink(LOGIN));
    expectProblem(checkDist(dist), /about\/index\.html: has 3 login links/);
  });
});

test('a login link to a different URL fails (V21)', () => {
  withCopy((dist) => {
    addLinks(dist, 'about/index.html', loginLink(LOGIN), loginLink('https://labs.valencesupplychain.co/login'));
    expectProblem(checkDist(dist), /about\/index\.html: login link must be exactly/);
  });
});

test('a link to the old app host fails now that LOGIN is labs.', () => {
  withCopy((dist) => {
    addLinks(dist, 'about/index.html', loginLink('https://app.substrate-lab.com'), loginLink('https://app.substrate-lab.com'));
    expectProblem(checkDist(dist), /about\/index\.html: login link must be exactly https:\/\/labs\.valencesupplychain\.com, found https:\/\/app\.substrate-lab\.com/);
  });
});

test('a test page with a lookalike login fails, by its words alone', () => {
  withCopy((dist) => {
    mkdirSync(join(dist, 'test-page'));
    writeFileSync(join(dist, 'test-page/index.html'), '<!DOCTYPE html><html><body><a href="https://valence-portal.example.com/">Sign in</a></body></html>');
    expectProblem(checkDist(dist), /test-page\/index\.html: login link must be exactly .* found https:\/\/valence-portal\.example\.com/);
  });
});

test('a link to another app host fails even without login words', () => {
  withCopy((dist) => {
    editPage(dist, 'index.html', (h) => h.replace('</body>', '<a href="https://labs-staging.valencesupplychain.com/">Status</a></body>'));
    expectProblem(checkDist(dist), /index\.html: login link must be exactly/);
  });
});

test('LOGIN with a query string, or a login link with a query string, fails', () => {
  assert.ok(checkLoginConstant('https://labs.valencesupplychain.com/?next=https://evil.example').length > 0);
  assert.ok(checkLoginConstant('http://labs.valencesupplychain.com').length > 0);
  assert.ok(checkLoginConstant('https://evil.example').length > 0);
  assert.deepEqual(checkLoginConstant(LOGIN), []);
  withCopy((dist) => {
    addLinks(dist, 'space/index.html', loginLink(LOGIN), loginLink(`${LOGIN}/?next=x`));
    expectProblem(checkDist(dist), /space\/index\.html: login link must be exactly/);
  });
});

test('a login link that opens a new tab fails', () => {
  withCopy((dist) => {
    addLinks(dist, 'services/index.html', loginLink(LOGIN), loginLink(LOGIN, ' target="_blank"'));
    expectProblem(checkDist(dist), /services\/index\.html: login link must open in the same tab/);
  });
});

test('a new public page (Valence Labs, privacy, terms, support) is checked like the rest', () => {
  withCopy((dist) => {
    mkdirSync(join(dist, 'labs'));
    writeFileSync(join(dist, 'labs/index.html'), '<!DOCTYPE html><html><body><main><form action="/x"></form></main></body></html>');
    expectProblem(checkDist(dist), /labs\/index\.html: has a <form>/);
  });
});

test('a password field, a form or an iframe fails', () => {
  for (const [snippet, re] of [
    ['<input type="password" name="p">', /has a password field/],
    ['<form action="/x"><input name="e"></form>', /has a <form>/],
    ['<iframe src="https://app.substrate-lab.com"></iframe>', /has an <iframe>/],
    ['<meta http-equiv="refresh" content="0;url=https://evil.example">', /meta refresh/],
  ]) {
    withCopy((dist) => {
      editPage(dist, 'how-we-work/index.html', (h) => h.replace('</main>', snippet + '</main>'));
      expectProblem(checkDist(dist), re);
    });
  }
});

// ---- 1.16: what dist/ may hold ----------------------------------------------

test('source files in dist/ fail', () => {
  for (const [rel, re] of [
    ['README.md', /README\.md: not a site file/],
    ['package.json', /package\.json: not a site file/],
    ['src/pages/home.html', /src\/pages\/home\.html: source folder/],
    ['docs/MEDIA-CREDITS.md', /docs\/MEDIA-CREDITS\.md: source folder/],
    ['scripts/build.mjs', /scripts\/build\.mjs: source folder/],
    ['.env', /\.env: dotfile/],
    ['serve.json', /serve\.json: not a site file/],
    ['backup.zip', /file type \.zip/],
  ]) {
    withCopy((dist) => {
      mkdirSync(dirname(join(dist, rel)), { recursive: true });
      writeFileSync(join(dist, rel), 'x');
      expectProblem(checkDist(dist), re);
    });
  }
});

// ---- 1.14/1.16: inline scripts and the CSP ---------------------------------

test('an inline script whose hash is not in the CSP fails', () => {
  withCopy((dist) => {
    editPage(dist, 'about/index.html', (h) => h.replace("document.documentElement.className+=' js';", "document.documentElement.className+=' js ';"));
    expectProblem(checkDist(dist), /about\/index\.html: inline script 'sha256-.*' is not in the CSP/);
  });
});

test('an inline event handler or a javascript: URL fails', () => {
  withCopy((dist) => {
    editPage(dist, 'about/index.html', (h) => h.replace('<main', '<main onclick="x()"'));
    expectProblem(checkDist(dist), /inline event handler/);
  });
  withCopy((dist) => {
    editPage(dist, 'about/index.html', (h) => h.replace('</main>', '<a href="javascript:alert(1)">x</a></main>'));
    expectProblem(checkDist(dist), /javascript: URL/);
  });
});

test("missing serve.json, directory listing on, or 'unsafe-inline' fails", () => {
  withCopy((dist, dir) => {
    rmSync(join(dir, 'serve.json'));
    expectProblem(checkDist(dist), /serve\.json: missing/);
  });
  withCopy((dist, dir) => {
    const f = join(dir, 'serve.json');
    const c = JSON.parse(readFileSync(f, 'utf8'));
    c.directoryListing = true;
    c.headers[0].headers[0].value = c.headers[0].headers[0].value.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
    writeFileSync(f, JSON.stringify(c));
    const problems = checkDist(dist);
    expectProblem(problems, /directoryListing must be false/);
    expectProblem(problems, /must not allow 'unsafe-inline'/);
  });
});

test('broken JSON-LD fails', () => {
  withCopy((dist) => {
    editPage(dist, 'index.html', (h) => h.replace('<script type="application/ld+json">{', '<script type="application/ld+json">{,'));
    expectProblem(checkDist(dist), /JSON-LD block is not valid JSON/);
  });
});

// ---- 6.5 / 7.26: Google Analytics and third-party scripts ------------------

test('every built page loads Google Analytics once, with GA_ID, from a file on our own site', () => {
  const pages = readdirSync(join(ROOT, 'dist'), { recursive: true }).filter((f) => String(f).endsWith('.html'));
  for (const rel of pages) {
    const html = readFileSync(join(ROOT, 'dist', rel), 'utf8');
    assert.equal(html.split(`<script async src="${GA_TAG_URL}"></script>`).length - 1, 1, `${rel}: Google's tag`);
    assert.equal(html.split('<script async src="/assets/js/analytics.js"></script>').length - 1, 1, `${rel}: analytics.js`);
  }
  const js = readFileSync(join(ROOT, 'dist/assets/js/analytics.js'), 'utf8');
  assert.match(js, new RegExp(`gtag\\('config', '${GA_ID}'\\)`));
  assert.match(js, /gtag\('set', 'allow_google_signals', false\)/);
  assert.match(js, /gtag\('set', 'allow_ad_personalization_signals', false\)/);
});

test("the CSP lets Google Analytics load and report, and nothing broader runs scripts", () => {
  const csp = JSON.parse(readFileSync(join(ROOT, 'serve.json'), 'utf8')).headers[0].headers[0].value;
  const dir = (name) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')).split(/\s+/).slice(1);
  for (const h of SCRIPT_HOSTS) assert.ok(dir('script-src').includes(h), `script-src has ${h}`);
  for (const h of ['https://*.google-analytics.com', 'https://*.analytics.google.com']) assert.ok(dir('connect-src').includes(h), `connect-src has ${h}`);
  assert.ok(!dir('script-src').some((t) => t === '*' || t === 'https:' || t === "'unsafe-inline'" || t === "'unsafe-eval'"));
});

test('a script from another site fails unless it is on THIRD_PARTY_SCRIPTS', () => {
  withCopy((dist) => {
    editPage(dist, 'about/index.html', (h) => h.replace('</main>', '<script src="https://cdn.chat-widget.example/loader.js"></script></main>'));
    expectProblem(checkDist(dist), /about\/index\.html: third-party script not on THIRD_PARTY_SCRIPTS.*chat-widget/);
  });
});

test("Google's tag with a different ID fails", () => {
  withCopy((dist) => {
    editPage(dist, 'index.html', (h) => h.replace(GA_TAG_URL, 'https://www.googletagmanager.com/gtag/js?id=G-SOMEONEELSE'));
    expectProblem(checkDist(dist), /index\.html: third-party script not on THIRD_PARTY_SCRIPTS.*G-SOMEONEELSE/);
  });
});

test('a script-src in serve.json broader than SCRIPT_HOSTS fails', () => {
  withCopy((dist, dir) => {
    const f = join(dir, 'serve.json');
    const c = JSON.parse(readFileSync(f, 'utf8'));
    c.headers[0].headers[0].value = c.headers[0].headers[0].value.replace("script-src 'self'", "script-src 'self' https:");
    writeFileSync(f, JSON.stringify(c));
    expectProblem(checkDist(dist), /script-src allows https:, which is not on SCRIPT_HOSTS/);
  });
});

// ---- 1.13 hardening: headers and CSP can't be weakened by hand ----------------

test('a missing or weakened header, or a loosened CSP directive, in serve.json fails', () => {
  for (const [change, re] of [
    [(c) => { c.headers[0].headers = c.headers[0].headers.filter((h) => h.key !== 'X-Frame-Options'); }, /X-Frame-Options is missing/],
    [(c) => { c.headers[0].headers.find((h) => h.key === 'Strict-Transport-Security').value = 'max-age=0'; }, /Strict-Transport-Security is "max-age=0"/],
    [(c) => { c.headers[0].headers = c.headers[0].headers.filter((h) => h.key !== 'Cross-Origin-Opener-Policy'); }, /Cross-Origin-Opener-Policy is missing/],
    [(c) => { const h = c.headers[0].headers[0]; h.value = h.value.replace("frame-ancestors 'none'", 'frame-ancestors *'); }, /CSP is missing or changed "frame-ancestors 'none'"/],
    [(c) => { const h = c.headers[0].headers[0]; h.value = h.value.replace("form-action 'none'", "form-action 'none' https://collect.example"); }, /CSP is missing or changed "form-action 'none'"/],
    [(c) => { const h = c.headers[0].headers[0]; h.value += '; script-src-elem *'; }, /unexpected directive "script-src-elem \*"/],
  ]) {
    withCopy((dist, dir) => {
      const f = join(dir, 'serve.json');
      const c = JSON.parse(readFileSync(f, 'utf8'));
      change(c);
      writeFileSync(f, JSON.stringify(c));
      expectProblem(checkDist(dist), re);
    });
  }
});

test('installs never run package scripts, and CI checks registry signatures', () => {
  assert.match(readFileSync(join(ROOT, '.npmrc'), 'utf8'), /^ignore-scripts=true$/m);
  assert.match(readFileSync(join(ROOT, '.github/workflows/check.yml'), 'utf8'), /npm audit signatures/);
});

// ---- 6.5: Microsoft Clarity ---------------------------------------------------

test('every built page loads Microsoft Clarity once, with CLARITY_ID, after its queue file', () => {
  assert.match(CLARITY_ID, /^[a-z0-9]{10}$/);
  const pages = readdirSync(join(ROOT, 'dist'), { recursive: true }).filter((f) => String(f).endsWith('.html'));
  for (const rel of pages) {
    const html = readFileSync(join(ROOT, 'dist', rel), 'utf8');
    const queue = html.indexOf('<script defer src="/assets/js/clarity.js"></script>');
    const tag = html.indexOf(`<script defer src="${CLARITY_TAG_URL}"></script>`);
    assert.ok(queue > 0 && tag > queue, `${rel}: Clarity queue, then Clarity's tag`);
    assert.equal(html.split(CLARITY_TAG_URL).length - 1, 1, `${rel}: one Clarity tag`);
  }
  assert.match(readFileSync(join(ROOT, 'dist/assets/js/clarity.js'), 'utf8'), /window\.clarity = window\.clarity \|\| function/);
});

test('the CSP lets Clarity load from its exact hosts and report to Microsoft', () => {
  const csp = JSON.parse(readFileSync(join(ROOT, 'serve.json'), 'utf8')).headers[0].headers[0].value;
  const dir = (name) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')).split(/\s+/).slice(1);
  for (const h of ['https://www.clarity.ms', 'https://scripts.clarity.ms']) assert.ok(dir('script-src').includes(h), `script-src has ${h}`);
  assert.ok(!dir('script-src').includes('https://*.clarity.ms'), 'no wildcard script host');
  for (const h of ['https://*.clarity.ms', 'https://c.bing.com']) assert.ok(dir('connect-src').includes(h), `connect-src has ${h}`);
});

test("Clarity's tag with a different project ID fails", () => {
  withCopy((dist) => {
    editPage(dist, 'about/index.html', (h) => h.replace(CLARITY_TAG_URL, 'https://www.clarity.ms/tag/someoneelse'));
    expectProblem(checkDist(dist), /about\/index\.html: third-party script not on THIRD_PARTY_SCRIPTS.*clarity\.ms\/tag\/someoneelse/);
  });
});

test('the Privacy Policy names both analytics tools', () => {
  const html = readFileSync(join(ROOT, 'dist/privacy.html'), 'utf8');
  assert.match(html, /Google Analytics/);
  assert.match(html, /Microsoft Clarity/);
});

// ---- lane 16: the quote box, Turnstile, Cloudflare's _headers, and secrets ----------------------

const cspOf = () => JSON.parse(readFileSync(join(ROOT, 'serve.json'), 'utf8')).headers[0].headers[0].value;
const directive = (csp, name) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')).split(/\s+/).slice(1);

test('the CSP names Turnstile and nothing new: frame-src is exactly Turnstile, form-action stays none, connect-src gains nothing', () => {
  const csp = cspOf();
  assert.deepEqual(directive(csp, 'frame-src'), [TURNSTILE_ORIGIN]);
  assert.ok(directive(csp, 'script-src').includes(TURNSTILE_ORIGIN));
  assert.deepEqual(directive(csp, 'form-action'), ["'none'"]);
  // The endpoint is same-origin ('self'); connect-src is exactly what it was before lane 16.
  assert.deepEqual(directive(csp, 'connect-src'), ["'self'", 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com', 'https://*.clarity.ms', 'https://c.bing.com', 'https://formspree.io']);
  assert.equal(QUOTE_ENDPOINT, '/api/quote-request');
});

test('dist/_headers is serve.json for Cloudflare: same CSP and headers on every path, asset caching on /assets/*', () => {
  const hf = readFileSync(join(ROOT, 'dist/_headers'), 'utf8');
  assert.equal(hf, headersFile(JSON.parse(readFileSync(join(ROOT, 'serve.json'), 'utf8'))));
  assert.ok(hf.includes(`/*\n  Content-Security-Policy: ${cspOf()}\n`));
  assert.match(hf, /^\/assets\/\*\n  Cache-Control: public, max-age=86400$/m);
  assert.ok(hf.split('\n').every((l) => l.length <= 2000), 'Cloudflare reads at most 2,000 characters a line');
});

test('a missing or hand-edited _headers fails', () => {
  withCopy((dist) => {
    rmSync(join(dist, '_headers'));
    expectProblem(checkDist(dist), /_headers: missing/);
  });
  withCopy((dist) => {
    editPage(dist, '_headers', (h) => h.replace("frame-ancestors 'none'", 'frame-ancestors *'));
    expectProblem(checkDist(dist), /_headers: differs from serve\.json/);
  });
  withCopy((dist) => {
    mkdirSync(join(dist, 'assets/x'), { recursive: true });
    writeFileSync(join(dist, 'assets/x/_headers'), '/*\n  X-Frame-Options: ALLOWALL\n');
    expectProblem(checkDist(dist), /assets\/x\/_headers: file type \(none\) is not on the allowed list/);
  });
});

test('a Slack webhook, a secret name, or the Worker source in dist/ fails', () => {
  for (const [text, re] of [
    ['https://hooks.slack.com/services/T000/B000/abcdef', /holds a secret/],
    ['SLACK_WEBHOOK_URL', /holds a secret/],
    ['TURNSTILE_SECRET_KEY', /holds a secret/],
    ['FORMSPREE_QUOTE_FORM_ID', /holds a secret/],
  ]) {
    withCopy((dist) => {
      editPage(dist, 'assets/js/rate.js', (j) => j + `\n// ${text}\n`);
      expectProblem(checkDist(dist), re);
    });
  }
  withCopy((dist) => {
    mkdirSync(join(dist, 'worker'));
    writeFileSync(join(dist, 'worker/quote.js'), '// source');
    expectProblem(checkDist(dist), /worker\/quote\.js: source folder in dist\//);
  });
});

test('the quote form ID never reaches dist/: any Formspree form but the questionnaire\'s fails, and so does the secret value itself', () => {
  withCopy((dist) => {
    editPage(dist, 'index.html', (h) => h.replace('data-rate-box', 'data-rate-box data-x="https://formspree.io/f/qsecret77"'));
    expectProblem(checkDist(dist), /index\.html: names a Formspree form other than the questionnaire's/);
  });
  withCopy((dist) => {
    editPage(dist, 'assets/js/rate.js', (j) => j + '\nvar id = "qsecret77";\n');
    expectProblem(checkDist(dist, { formspreeQuoteId: 'qsecret77' }), /rate\.js: holds the value of FORMSPREE_QUOTE_FORM_ID/);
    assert.deepEqual(checkDist(dist, { formspreeQuoteId: 'qother000' }), []);
  });
  withCopy((dist) => assert.deepEqual(checkDist(dist, { formspreeQuoteId: 'qsecret77' }), []));
  assert.ok(LEAD_ENDPOINT.startsWith('https://formspree.io/f/'), 'the questionnaire keeps its own form');
});

test('Turnstile loads once on each page with a quote form, and on no other page', () => {
  withCopy((dist) => {
    editPage(dist, 'index.html', (h) => h.replace(`<script src="${TURNSTILE_SCRIPT_URL}" defer></script>`, ''));
    expectProblem(checkDist(dist), /index\.html: has a quote form but loads Turnstile 0 times/);
  });
  withCopy((dist) => {
    editPage(dist, 'sms-terms.html', (h) => h.replace('</main>', `<script src="${TURNSTILE_SCRIPT_URL}" defer></script></main>`));
    expectProblem(checkDist(dist), /sms-terms\.html: loads Turnstile without a quote form/);
  });
});

// Every box on a page: from its opening tag to the end of its no-JavaScript line.
const boxesOf = (html) => html.split(/(?=<div class="rate__box"[^>]*data-rate-box)/).slice(1).map((s) => s.slice(0, s.indexOf('</noscript>') + 11));
const pickOf = (html) => { const i = html.indexOf('data-pick-card'); return i < 0 ? '' : html.slice(i, html.indexOf('</noscript>', i) + 11); };
const builtPages = () => readdirSync(join(ROOT, 'dist'), { recursive: true }).map(String).filter((f) => f.endsWith('.html'));

test('the closing band carries the quote box on every page with one; the homepage has two boxes; ids never repeat on a page', () => {
  const expectBoxes = { 'index.html': 2, 'contact/index.html': 1, 'privacy.html': 0, 'sms-terms.html': 0, 'food-and-beverage/index.html': 0, 'quote/index.html': 0 };
  for (const rel of builtPages()) {
    const html = readFileSync(join(ROOT, 'dist', rel), 'utf8');
    const n = boxesOf(html).length;
    const band = html.includes('class="rate rate--close"');
    if (rel in expectBoxes) assert.equal(n, expectBoxes[rel], `${rel}: ${n} boxes`);
    else assert.equal(n, 1, `${rel}: the closing band's box`);
    if (band) assert.match(html, /<section id="contact" class="rate rate--close"[\s\S]*?<h2 id="cta-title" class="h2">Get an instant quote<\/h2>[\s\S]*?Send your lane and get your quote\./, `${rel}: closing band copy`);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual(dup, [], `${rel}: repeated ids`);
  }
});

test('every box holds no <form>, posts to the Worker with the site key, has a honeypot and the approved copy, and never a price', () => {
  for (const rel of builtPages()) {
    const html = readFileSync(join(ROOT, 'dist', rel), 'utf8');
    assert.ok(!/<form\b/i.test(html));
    for (const box of boxesOf(html)) {
    assert.ok(box.includes(`data-rate-endpoint="${QUOTE_ENDPOINT}"`), `${rel}: posts to the Worker`);
    assert.ok(box.includes(`data-rate-sitekey="${TURNSTILE_SITE_KEY}"`));
    assert.ok(box.includes('data-rate="website"'), `${rel}: honeypot`);
    const head = html.includes('id="rate-title"') ? html.slice(html.indexOf('id="rate-title"') - 20, html.indexOf('</p>', html.indexOf('id="rate-title"'))) : '';
    if (rel === 'contact/index.html') for (const line of ['>Get an instant quote</h2>', '>Send your lane and get your quote.']) assert.ok(head.includes(line), `${rel}: ${line}`);
    // Hargun's decision, Nov 18 14:19, and Jesse's drayage line, Nov 18 14:17.
    for (const line of ['data-fine="truck">No account needed.</p>',
      '>Port or ramp to door. Accessorials may apply.</p>', '>We have your request.</h3>', '>Your quote is on its way to your inbox. If it can'])
      assert.ok(box.includes(line), `${rel}: ${line}`);
    assert.ok(!/\$\s?\d|USD/i.test(box), `${rel}: no price in the box`);
    assert.ok(!/within the hour|business hours|a person on our desk|prices it|from our team/i.test(box), `${rel}: no reply-time promise, no "a person prices it"`);
    assert.ok(!/chassis, fuel|empty return|real sailings|freight-class quiz/i.test(box), `${rel}: lines Jesse has not approved stay out`);
    assert.ok(!/our desk|our team|quoting desk|a person/i.test(box), `${rel}: never says a person, our desk or our team prices it`);
    assert.ok(!/ops@|formspree/i.test(box), `${rel}: every send goes through ${QUOTE_ENDPOINT}, never ops@ or Formspree directly`);
    }
  }
  for (const rel of ['privacy.html', 'sms-terms.html']) assert.ok(!readFileSync(join(ROOT, 'dist', rel), 'utf8').includes('data-rate-box'));
  for (const f of ['rate.js', 'net.js', 'quote.js']) {
    const js = readFileSync(join(ROOT, 'dist/assets/js', f), 'utf8');
    assert.ok(!/formspree|ops@/i.test(js), `${f}: the browser never posts to Formspree or ops@`);
    assert.ok(js.includes('j.ok === true'), `${f}: "done" only on {"ok":true}`);
  }
});

test('the map\'s pick-a-lane posts to the Worker with Turnstile and a honeypot, lists the Worker\'s modes and ports, and follows the copy rules', () => {
  const html = readFileSync(join(ROOT, 'dist/index.html'), 'utf8');
  const pick = pickOf(html);
  assert.ok(pick, 'the homepage has the pick card');
  assert.ok(pick.includes(`data-pick-endpoint="${QUOTE_ENDPOINT}"`));
  assert.ok(pick.includes(`data-pick-sitekey="${TURNSTILE_SITE_KEY}"`));
  assert.ok(pick.includes('data-pick-website') && pick.includes('data-pick-turnstile'));
  assert.deepEqual([...pick.matchAll(/<option value="(\w+)">/g)].map((m) => m[1]), Object.keys(MAP_MODES));
  for (const port of PORTS) assert.ok(pick.includes(`<option>${port.replace(/&/g, '&amp;')}</option>`), port);
  for (const eq of EQUIPMENT) assert.ok(pick.includes(`<option>${eq}</option>`), eq);
  for (const line of ['>Get my quote</button>', "We'll email your quote.", '<b>We have your request.</b> Your quote is on its way to your inbox.'])
    assert.ok(pick.includes(line) || pick.includes(line.replace("'", '&#39;')), line);
  assert.ok(!/our desk|our team|quoting desk|a person|within the hour|business hours|ops@|formspree|\$\s?\d/i.test(pick), 'pick card copy rules');
  assert.ok(html.includes('<span>Watched by</span><b>Valence</b>'), 'lane card: "Watched by: Valence"');
  for (const rel of builtPages().filter((r) => r !== 'index.html')) assert.ok(!readFileSync(join(ROOT, 'dist', rel), 'utf8').includes('data-pick-card'), `${rel}: no map`);
});

test('a quote form that posts anywhere but the Worker fails (the redesign\'s @endpoint bug)', () => {
  withCopy((dist) => {
    editPage(dist, 'about/index.html', (h) => h.replace(`data-rate-endpoint="${QUOTE_ENDPOINT}"`, `data-rate-endpoint="${LEAD_ENDPOINT}"`));
    expectProblem(checkDist(dist), /about\/index\.html: a quote form posts to https:\/\/formspree\.io/);
  });
  withCopy((dist) => {
    editPage(dist, 'index.html', (h) => h.replace(`data-pick-endpoint="${QUOTE_ENDPOINT}"`, 'data-pick-endpoint="/api/other"'));
    expectProblem(checkDist(dist), /index\.html: a quote form posts to \/api\/other/);
  });
});

test('the map\'s places must be exactly scripts/map-places.mjs, which is what the Worker accepts', () => {
  assert.equal(Object.keys(MAP_CITIES).length, 42);
  assert.equal(Object.keys(MAP_STATES).length, 49);
  withCopy((dist) => {
    editPage(dist, 'index.html', (h) => h.replace('data-city="Dallas" data-zip="75247"', 'data-city="Dallas" data-zip="75201"'));
    expectProblem(checkDist(dist), /index\.html: map city Dallas \(75201\) is not in scripts\/map-places\.mjs/);
  });
  withCopy((dist) => {
    editPage(dist, 'index.html', (h) => h.replace('data-city="Reno" data-zip="89502"', 'data-town="Reno" data-zip="89502"'));
    expectProblem(checkDist(dist), /lists the city Reno, which is not on the map/);
  });
  withCopy((dist) => {
    editPage(dist, 'index.html', (h) => h.replace('data-state="Kansas"', 'data-state="Kanzas"'));
    expectProblem(checkDist(dist), /map state Kanzas/);
  });
});

test('the quote copy rules fail the build on any page: each line the redesign had is caught', () => {
  for (const line of [
    '<span>A PERSON PRICES EVERY QUOTE, WITHIN THE HOUR</span>',
    '<p>A person on our quoting desk prices every request and sends it within the hour.</p>',
    '<h3>Priced by a person, fast because of the system.</h3>',
    '<p class="how__fine">No AI pricing, no auto-quote. A person signs off on every number.</p>',
    '<p class="net__pick-fine">A person prices it and replies by email within the hour.</p>',
    '<p>A quote from a person within the hour, and the software</p>',
    '<p>Type the lane and a person on our desk prices it.</p>',
    '<p>Port or ramp to door. Chassis, fuel and the empty return are in the price we send you.</p>',
    '<p>Priced by a person from real sailings and flights.</p>',
    '<p>No freight-class quiz.</p>',
    '<p>We reply during business hours.</p>',
  ]) {
    withCopy((dist) => {
      editPage(dist, 'about/index.html', (h) => h.replace('</main>', line + '</main>'));
      expectProblem(checkDist(dist), /about\/index\.html: breaks the quote copy rules/);
    });
  }
  withCopy((dist) => {
    editPage(dist, 'index.html', (h) => h.replace(/<meta name="description" content="[^"]*"/, '<meta name="description" content="A person prices every quote."'));
    expectProblem(checkDist(dist), /index\.html: breaks the quote copy rules/);
  });
});

test('/food-and-beverage/ is a 301 to /cpg/ on Cloudflare, out of the sitemap; _redirects holds only same-site 301s', () => {
  const r = readFileSync(join(ROOT, 'dist/_redirects'), 'utf8');
  assert.equal(r, '/food-and-beverage/ /cpg/ 301\n/food-and-beverage /cpg/ 301\n');
  const sm = readFileSync(join(ROOT, 'dist/sitemap.xml'), 'utf8');
  assert.ok(!sm.includes('/food-and-beverage') && sm.includes('/cpg/'));
  assert.ok(readFileSync(join(ROOT, 'dist/index.html'), 'utf8').includes('<a href="/cpg/">CPG</a>'), 'footer links /cpg/');
  for (const bad of ['/x https://evil.example/ 301', '/x //evil.example/ 301', '/x /y 302', '/x /y 200', '/* /index.html 200']) {
    withCopy((dist) => {
      writeFileSync(join(dist, '_redirects'), bad + '\n');
      expectProblem(checkDist(dist), /_redirects: only/);
    });
  }
  withCopy((dist) => {
    mkdirSync(join(dist, 'assets/y'), { recursive: true });
    writeFileSync(join(dist, 'assets/y/_redirects'), '/a /b 301\n');
    expectProblem(checkDist(dist), /assets\/y\/_redirects: file type/);
  });
});

test('the Worker config: assets from dist/, /api/* to the Worker, the per-IP rate-limit binding, and no secrets', () => {
  const raw = readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8');
  const cfg = JSON.parse(raw.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'));
  assert.equal(cfg.main, 'worker/index.mjs');
  assert.equal(cfg.assets.directory, './dist');
  assert.deepEqual(cfg.assets.run_worker_first, ['/api/*']);
  assert.equal(cfg.assets.not_found_handling, '404-page');
  const rl = cfg.ratelimits.find((r) => r.name === 'QUOTE_LIMITER');
  assert.ok(rl && [10, 60].includes(rl.simple.period) && rl.simple.limit > 0);
  assert.equal(cfg.vars, undefined, 'no plain-text vars; secrets go through wrangler secret put');
  // Until launch, a deploy can only reach workers.dev: no route or custom domain may take www (docs/LAUNCH.md step 1 adds it).
  for (const k of ['route', 'routes', 'custom_domain']) assert.equal(cfg[k], undefined, `wrangler.jsonc has ${k}: the preview would go live`);
  assert.ok(!/valencesupplychain\.com/.test(raw.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')), 'no site hostname in the Worker config');
  assert.ok(!/hooks\.slack\.com\/services|formspree\.io\/f\//.test(raw));
  for (const f of ['.gitignore']) assert.match(readFileSync(join(ROOT, f), 'utf8'), /^\.dev\.vars/m, `${f} keeps local secrets out of git`);
});

test('the Privacy Policy says what the quote box, the map and the quote page collect, who sees it, and how long it is kept', () => {
  const html = readFileSync(join(ROOT, 'dist/privacy.html'), 'utf8');
  assert.match(html, /<dt>Quote requests<\/dt>/);
  for (const w of ['Slack', 'Formspree', 'Cloudflare Turnstile', 'We keep quote requests for as long as we need them to respond and follow up, and delete them on request.',
    '&quot;Get an instant quote&quot; box, the map on our homepage or our quote page', 'the cities or states you pick on the map', 'The map asks only for your work email.',
    'the items with their quantities, weights and dimensions, the pickup and delivery options you choose']) assert.ok(html.includes(w) || html.includes(w.replace(/&quot;/g, '"')), w);
  assert.ok(!html.includes('Get your rate'));
});

// ---- the quote page (/quote/) --------------------------------------------------------------

const quotePage = () => readFileSync(join(ROOT, 'dist/quote/index.html'), 'utf8');
const quoteFormOf = (html) => { const i = html.indexOf('<div class="qform" data-quote'); return i < 0 ? '' : html.slice(i, html.indexOf('</noscript>', i) + 11); };

test('the quote page posts to the Worker with Turnstile and a honeypot, loads quote.js (not rate.js), and holds no <form>', () => {
  const html = quotePage(), form = quoteFormOf(html);
  assert.ok(form, 'the quote page has its form');
  assert.ok(!/<form\b/i.test(html));
  assert.ok(form.includes(`data-quote-endpoint="${QUOTE_ENDPOINT}"`));
  assert.ok(form.includes(`data-quote-sitekey="${TURNSTILE_SITE_KEY}"`));
  assert.ok(form.includes('data-q="website"') && form.includes('data-q-turnstile'));
  assert.equal(html.split(`src="${TURNSTILE_SCRIPT_URL}"`).length - 1, 1, 'Turnstile once');
  assert.ok(html.includes('<script src="/assets/js/quote.js" defer>'));
  assert.ok(!html.includes('/assets/js/rate.js'), 'no quote box on this page, so no rate.js');
  assert.ok(!/formspree|ops@/i.test(form), 'the quote form never posts to Formspree or ops@');
});

test('the quote page renders the item types, the options and the max lengths from scripts/quote-fields.mjs', () => {
  const form = quoteFormOf(quotePage());
  const types = [...form.match(/<select data-i="type">([\s\S]*?)<\/select>/)[1].matchAll(/<option>([^<]*)<\/option>/g)].map((m) => m[1]);
  assert.deepEqual(types, ITEM_TYPES);
  for (const kind of ['pickup', 'delivery']) {
    const group = form.slice(form.indexOf(`data-q-opts="${kind}"`), form.indexOf('data-q-more', form.indexOf(`data-q-opts="${kind}"`)));
    const ids = [...group.matchAll(/data-opt-pick="(\w+)"[^>]*><span class="qopt__plus" aria-hidden="true"><\/span>([^<]*)<\/button>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(ids, Object.entries(QUOTE_OPTIONS[kind]), kind);
    assert.equal((group.match(/class="qopt qopt--more"/g) || []).length, ids.length - QUOTE_OPTIONS_SHOWN, `${kind}: the first ${QUOTE_OPTIONS_SHOWN} show`);
  }
  assert.ok(form.includes(`data-q-max="${ITEM_LIMITS.items}"`));
  for (const [key, max] of [['name', MAX.name], ['company', MAX.company], ['email', MAX.email], ['phone', MAX.phone], ['note', MAX.note], ['from', MAX.zip], ['to', MAX.zip]])
    assert.match(form, new RegExp(`maxlength="${max}"[^>]*data-q="${key}"`), key);
  assert.match(form, /maxlength="6" placeholder="500" data-i="lbs"/, '50,000 fits with its comma');
});

test('the quote page follows the copy rules: "Get an instant quote", our own lane line, and nothing about who prices it or when', () => {
  const html = quotePage(), form = quoteFormOf(html);
  assert.match(html, /<title>Get an instant quote \| Valence<\/title>/);
  assert.ok(html.includes('<p class="eyebrow">Get an instant quote</p>'));
  for (const line of ['Tell us the freight once. Your quote shows the ways it can move on this lane, so you choose on cost and timing.',
    '>We have your request.</h2>', 'Your quote is on its way to your inbox. If it can', 'Nothing is booked from this page, and no price is shown here. We&#39;ll email your quote.',
    '<span>Priced into your quote</span>', 'Add or remove it any time before you send.', 'data-q-submit>Get my quote</button>'])
    assert.ok(html.includes(line) || html.includes(line.replace('&#39;', "'")), line);
  assert.ok(!/every eligible option|53 ft truck|LTL, cargo van, box truck/i.test(html), 'the Warp-like line is gone');
  assert.ok(!/our desk|our team|quoting desk|a person|within the hour|business hours|\$\s?\d/i.test(html.replace(/<dialog class="ask"[\s\S]*?<\/dialog>/, '').replace(/<footer[\s\S]*<\/footer>/, '')), 'quote page copy rules');
  assert.ok(!/\$\s?\d|USD/.test(form), 'no price');
});

test('the closing band links to the quote page; the truck tab, "Quote this lane" and the map\'s "Add items and options first" go there', () => {
  for (const rel of builtPages()) {
    const html = readFileSync(join(ROOT, 'dist', rel), 'utf8');
    if (html.includes('class="rate rate--close"')) assert.ok(html.includes('Want to add items, pickup and delivery options? <a href="/quote/">Use the full quote page</a>.'), rel);
  }
  assert.ok(pickOf(readFileSync(join(ROOT, 'dist/index.html'), 'utf8')).includes('data-pick-details>Add items and options first</button>'));
  const rate = readFileSync(join(ROOT, 'dist/assets/js/rate.js'), 'utf8'), net = readFileSync(join(ROOT, 'dist/assets/js/net.js'), 'utf8');
  assert.match(rate, /if \(mode === 'truck'\) \{[^}]*location\.href = '\/quote\/\?from=/);
  assert.match(net, /location\.href = '\/quote\/\?from=[^;]*&fromPlace=[^;]*&toPlace=/);
  const laneQuote = net.slice(net.indexOf("card.querySelector('[data-net-quote]')"), net.indexOf('/* ----- pick a lane'));
  assert.match(laneQuote, /location\.href = '\/quote\/\?from=' \+ e\(sel\.getAttribute\('data-from-zip'\)[^;]*'&to=' \+ e\(sel\.getAttribute\('data-to-zip'\)[^;]*'&equipment=' \+ e\(eq\)/, '"Quote this lane" opens /quote/ with both ZIPs and the equipment');
  assert.ok(!laneQuote.includes('data-rate-box'), '"Quote this lane" no longer fills the box');
  const quote = readFileSync(join(ROOT, 'dist/assets/js/quote.js'), 'utf8');
  assert.ok(quote.includes("kind: 'quote_page'"));
});

test('a quote page that posts anywhere but the Worker, or loses Turnstile or quote.js, fails', () => {
  withCopy((dist) => {
    editPage(dist, 'quote/index.html', (h) => h.replace(`data-quote-endpoint="${QUOTE_ENDPOINT}"`, `data-quote-endpoint="${LEAD_ENDPOINT}"`));
    expectProblem(checkDist(dist), /quote\/index\.html: a quote form posts to https:\/\/formspree\.io/);
  });
  withCopy((dist) => {
    editPage(dist, 'quote/index.html', (h) => h.replace(/ data-quote-endpoint="[^"]*"/, ''));
    expectProblem(checkDist(dist), /quote\/index\.html: a quote form posts to nothing/);
  });
  withCopy((dist) => {
    editPage(dist, 'quote/index.html', (h) => h.replace(`<script src="${TURNSTILE_SCRIPT_URL}" defer></script>`, ''));
    expectProblem(checkDist(dist), /quote\/index\.html: has a quote form but loads Turnstile 0 times/);
  });
  withCopy((dist) => {
    editPage(dist, 'quote/index.html', (h) => h.replace('<script src="/assets/js/quote.js" defer></script>', ''));
    expectProblem(checkDist(dist), /quote\/index\.html: holds the quote page form but does not load \/assets\/js\/quote\.js/);
  });
});

test('quote.js must explain exactly the options in scripts/quote-fields.mjs, and follow the copy rules too', () => {
  withCopy((dist) => {
    editPage(dist, 'assets/js/quote.js', (js) => js.replace(/^\s*hazmat: \{.*\n/m, ''));
    expectProblem(checkDist(dist), /assets\/js\/quote\.js: the option hazmat in scripts\/quote-fields\.mjs has no explainer/);
  });
  withCopy((dist) => {
    editPage(dist, 'assets/js/quote.js', (js) => js.replace('  var COPY = {\n', "  var COPY = {\n    freebie: { art: 'house', d: 'x', add: 'x', skip: 'x' },\n"));
    expectProblem(checkDist(dist), /assets\/js\/quote\.js: explains freebie, which is not an option/);
  });
  for (const [line, re] of [['A person on our desk prices it and sends it.', /a person, our desk or our team prices it/], ['Priced by a person into the quote you get back.', /a person, our desk or our team prices it/], ['Your quote within the hour.', /"within the hour" about a quote/], ['Our quoting desk has your request.', /"quoting desk"/]]) {
    withCopy((dist) => {
      editPage(dist, 'assets/js/quote.js', (js) => js.replace("var FAIL = \"", `var X = '${line}'; var FAIL = "`));
      expectProblem(checkDist(dist), new RegExp(`assets/js/quote\\.js: breaks the quote copy rules: .*${re.source}`));
    });
  }
});
