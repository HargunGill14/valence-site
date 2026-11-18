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
import { QUOTE_ENDPOINT } from '../scripts/quote-fields.mjs';
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

test('Turnstile loads once on each page with the quote box, and on no other page', () => {
  withCopy((dist) => {
    editPage(dist, 'index.html', (h) => h.replace(`<script src="${TURNSTILE_SCRIPT_URL}" defer></script>`, ''));
    expectProblem(checkDist(dist), /index\.html: has the quote box but loads Turnstile 0 times/);
  });
  withCopy((dist) => {
    editPage(dist, 'about/index.html', (h) => h.replace('</main>', `<script src="${TURNSTILE_SCRIPT_URL}" defer></script></main>`));
    expectProblem(checkDist(dist), /about\/index\.html: loads Turnstile without the quote box/);
  });
});

test('home and contact each hold one quote box: no <form>, the Worker endpoint, the site key, a honeypot, the approved copy, and never a price', () => {
  for (const rel of ['index.html', 'contact/index.html']) {
    const html = readFileSync(join(ROOT, 'dist', rel), 'utf8');
    assert.equal(html.split(' data-rate-box ').length - 1, 1, `${rel}: one box`);
    assert.ok(!/<form\b/i.test(html));
    assert.ok(html.includes(`data-rate-endpoint="${QUOTE_ENDPOINT}"`), `${rel}: posts to the Worker`);
    assert.ok(html.includes(`data-rate-sitekey="${TURNSTILE_SITE_KEY}"`));
    assert.ok(html.includes('data-rate="website"'), `${rel}: honeypot`);
    const box = html.slice(html.indexOf('id="rate"'), html.indexOf('</section>', html.indexOf('id="rate"')));
    // Hargun's decision, Nov 18 14:19, and Jesse's drayage line, Nov 18 14:17.
    for (const line of ['>Get an instant quote</h2>', '>Send your lane and get your quote.</p>', 'data-fine="truck">No account needed.</p>',
      '>Port or ramp to door. Accessorials may apply.</p>', '>We have your request.</h3>', '>Your quote is on its way to your inbox. If it can'])
      assert.ok(box.includes(line), `${rel}: ${line}`);
    assert.ok(!/\$\s?\d|USD/i.test(box), `${rel}: no price in the box`);
    assert.ok(!/within the hour|business hours|a person on our desk|prices it|from our team/i.test(box), `${rel}: no reply-time promise, no "a person prices it"`);
    assert.ok(!/chassis, fuel|empty return|real sailings|freight-class quiz/i.test(box), `${rel}: lines Jesse has not approved stay out`);
  }
  for (const rel of ['about/index.html', 'privacy.html']) assert.ok(!readFileSync(join(ROOT, 'dist', rel), 'utf8').includes('data-rate-box'));
  const js = readFileSync(join(ROOT, 'dist/assets/js/rate.js'), 'utf8');
  assert.ok(!/formspree/i.test(js), 'the browser never posts to Formspree');
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
  assert.ok(!/hooks\.slack\.com\/services|formspree\.io\/f\//.test(raw));
  for (const f of ['.gitignore']) assert.match(readFileSync(join(ROOT, f), 'utf8'), /^\.dev\.vars/m, `${f} keeps local secrets out of git`);
});

test('the Privacy Policy says what the quote box collects, who sees it, and how long it is kept', () => {
  const html = readFileSync(join(ROOT, 'dist/privacy.html'), 'utf8');
  assert.match(html, /<dt>Quote requests<\/dt>/);
  for (const w of ['Slack', 'Formspree', 'Cloudflare Turnstile', 'We keep quote requests for as long as we need them to respond and follow up, and delete them on request.']) assert.ok(html.includes(w), w);
});
