// Tests for the quote endpoint, worker/quote.mjs (lane 16). `node --test`.
// Nothing leaves the machine: Turnstile, Slack and Formspree are a fake fetch, and the
// Workers rate-limiting binding is a fake with the same limit({ key }) → { success } shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleQuote } from '../worker/quote.mjs';
import { formspreeUrl } from '../worker/quote.mjs';
import { MAX } from '../scripts/quote-fields.mjs';

const HOST = 'www.valencesupplychain.com';
const URL_ = `https://${HOST}/api/quote-request`;
const SLACK = 'https://hooks.slack.com/services/T0000000/B0000000/testtesttesttesttest';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const IP = '203.0.113.7';
const FORM_ID = 'qtestform1';
const LEAD_ENDPOINT = formspreeUrl(FORM_ID);   // the "Quote requests" form, from the Worker secret

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const VALID = {
  truck: { mode: 'truck', from: '90058', to: '75247', equipment: 'Full truckload · dry van', date: day(3), weight: '42,000', commodity: 'Canned beverages, palletized', name: 'Jane Doe', company: 'Acme Foods', email: 'jane@acme.example', phone: '(555) 010-2000', note: 'Liftgate at delivery.', website: '', token: 'tok-123' },
  intl: { mode: 'intl', from: 'Shanghai', to: 'Port of Long Beach', intlmode: 'Ocean · full container (FCL)', date: day(10), weight: '18000', name: 'Jane Doe', company: 'Acme Foods', email: 'jane@acme.example', website: '', token: 'tok-123' },
  dray: { mode: 'dray', from: 'Port of Oakland', to: '94607', container: '40 ft', containerno: 'MSCU1234567', date: day(1), weight: '30000', name: 'Jane Doe', company: 'Acme Foods', email: 'jane@acme.example', website: '', token: 'tok-123' },
  parcel: { mode: 'parcel', from: '100 Main St, Fresno CA 93725', to: '200 Elm St, Denver CO 80216', weight: '12.5', box: '12 × 10 × 8 in', date: day(0), name: 'Jane Doe', company: 'Acme Foods', email: 'jane@acme.example', website: '', token: 'tok-123' },
};

function fakeFetch({ turnstile = { success: true, hostname: HOST, action: 'quote' }, slack = 200, email = 200 } = {}) {
  const calls = [];
  const answer = (status) => {
    if (status === 'throw') throw new TypeError('fetch failed');
    return new Response(status < 400 ? '{"ok":true}' : '{"error":"down"}', { status, headers: { 'content-type': 'application/json' } });
  };
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === SITEVERIFY) return Response.json(turnstile);
    if (String(url) === SLACK) return answer(slack);
    if (String(url) === LEAD_ENDPOINT) return answer(email);
    throw new Error(`unexpected fetch to ${url}`);
  };
  f.calls = calls;
  f.to = (u) => calls.filter((c) => c.url === u);
  return f;
}

function makeEnv(over = {}) {
  const keys = [];
  return {
    SLACK_WEBHOOK_URL: SLACK,
    TURNSTILE_SECRET_KEY: 'turnstile-secret-for-tests',
    FORMSPREE_QUOTE_FORM_ID: FORM_ID,
    QUOTE_LIMITER: { keys, limit: async ({ key }) => { keys.push(key); return { success: true }; } },
    ...over,
  };
}

function request(body, { method = 'POST', headers = {} } = {}) {
  const h = { 'content-type': 'application/json', 'cf-connecting-ip': IP, origin: `https://${HOST}`, ...headers };
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
  return new Request(URL_, { method, headers: h, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
}

async function run(body, { fake, env, req } = {}) {
  const f = fakeFetch(fake);
  const e = makeEnv(env);
  const logs = [];
  const res = await handleQuote(request(body, req), e, { fetch: f, log: (x) => logs.push(x) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* asserted by callers */ }
  return { res, json, text, f, env: e, logs };
}
const nothingSent = (f) => { assert.equal(f.to(SLACK).length, 0, 'no Slack post'); assert.equal(f.to(LEAD_ENDPOINT).length, 0, 'no Formspree post'); };
const slackText = (f) => JSON.parse(f.to(SLACK)[0].init.body).text;

// ---- the happy path, one per tab ------------------------------------------

test('a valid truckload request is verified with Turnstile, then sent to Slack and to ops@ through Formspree', async () => {
  const { res, json, f, env } = await run(VALID.truck);
  assert.equal(res.status, 200);
  assert.deepEqual(json, { ok: true });
  const v = f.to(SITEVERIFY);
  assert.equal(v.length, 1, 'one siteverify call');
  const form = v[0].init.body;
  assert.equal(form.get('secret'), 'turnstile-secret-for-tests');
  assert.equal(form.get('response'), 'tok-123');
  assert.equal(form.get('remoteip'), IP);
  assert.equal(f.to(SLACK).length, 1);
  assert.equal(f.to(LEAD_ENDPOINT).length, 1);
  assert.deepEqual(env.QUOTE_LIMITER.keys, [IP], 'rate limited per IP');
});

for (const mode of ['intl', 'dray', 'parcel']) {
  test(`a valid ${mode} request is accepted and delivered`, async () => {
    const { res, json, f } = await run(VALID[mode]);
    assert.equal(res.status, 200, JSON.stringify(json));
    assert.equal(f.to(SLACK).length, 1);
    assert.equal(f.to(LEAD_ENDPOINT).length, 1);
  });
}

// ---- Turnstile ----------------------------------------------------------------

test('no Turnstile token: refused with 403, nothing verified or sent', async () => {
  const { res, json, f } = await run({ ...VALID.truck, token: '' });
  assert.equal(res.status, 403);
  assert.deepEqual(json, { ok: false });
  assert.equal(f.to(SITEVERIFY).length, 0);
  nothingSent(f);
});

test('a token Turnstile rejects: 403, nothing sent', async () => {
  const { res, f } = await run(VALID.truck, { fake: { turnstile: { success: false, 'error-codes': ['invalid-input-response'] } } });
  assert.equal(res.status, 403);
  nothingSent(f);
});

test('a token solved on another hostname, or for another action: 403', async () => {
  for (const turnstile of [{ success: true, hostname: 'evil.example', action: 'quote' }, { success: true, hostname: HOST, action: 'login' }]) {
    const { res, f } = await run(VALID.truck, { fake: { turnstile } });
    assert.equal(res.status, 403, JSON.stringify(turnstile));
    nothingSent(f);
  }
});

test('no Turnstile secret configured: 503, nothing sent (fails closed)', async () => {
  const { res, f } = await run(VALID.truck, { env: { TURNSTILE_SECRET_KEY: undefined } });
  assert.equal(res.status, 503);
  nothingSent(f);
});

// ---- validation -----------------------------------------------------------------

test('a bad ZIP, an over-long field, an off-list value or a bad date: 400, before Turnstile, nothing sent', async () => {
  const bad = [
    { from: '9005' },
    { to: '7524A' },
    { name: 'x'.repeat(MAX.name + 1) },
    { note: 'x'.repeat(MAX.note + 1) },
    { company: 'y'.repeat(MAX.company + 1) },
    { equipment: 'Spaceship' },
    { mode: 'rocket' },
    { email: 'not-an-email' },
    { date: day(-3) },
    { date: '2026-02-30' },
    { date: day(400) },
    { weight: 'heavy' },
    { name: '' },
    { company: '   ' },
    { name: 'Jane\u0000Doe' },
    { name: 'Jane\u202EeoD' },
  ];
  for (const change of bad) {
    const { res, f } = await run({ ...VALID.truck, ...change });
    assert.equal(res.status, 400, JSON.stringify(change).slice(0, 80));
    assert.equal(f.to(SITEVERIFY).length, 0);
    nothingSent(f);
  }
  for (const [mode, change] of [['intl', { intlmode: 'Teleport' }], ['dray', { from: 'Port of Atlantis' }], ['dray', { container: '53 ft' }], ['parcel', { box: 'b'.repeat(MAX.box + 1) }], ['parcel', { weight: '-4' }]]) {
    const { res } = await run({ ...VALID[mode], ...change });
    assert.equal(res.status, 400, `${mode} ${JSON.stringify(change)}`);
  }
});

test('not JSON, too big, or the wrong method or origin: refused', async () => {
  assert.equal((await run('{"mode":')).res.status, 400);
  assert.equal((await run(JSON.stringify({ ...VALID.truck, note: 'n'.repeat(20000) }))).res.status, 413);
  assert.equal((await run(VALID.truck, { req: { headers: { 'content-type': 'text/plain' } } })).res.status, 415);
  assert.equal((await run(null, { req: { method: 'GET' } })).res.status, 405);
  const cross = await run(VALID.truck, { req: { headers: { origin: 'https://evil.example' } } });
  assert.equal(cross.res.status, 403);
  nothingSent(cross.f);
});

// ---- rate limit and honeypot ------------------------------------------------------

test('over the rate limit: 429, nothing verified or sent', async () => {
  const { res, json, f } = await run(VALID.truck, { env: { QUOTE_LIMITER: { limit: async () => ({ success: false }) } } });
  assert.equal(res.status, 429);
  assert.deepEqual(json, { ok: false });
  assert.equal(f.calls.length, 0);
});

test('the honeypot filled: answered like a success, silently dropped', async () => {
  const { res, json, f } = await run({ ...VALID.truck, website: 'https://spam.example' });
  assert.equal(res.status, 200);
  assert.deepEqual(json, { ok: true });
  assert.equal(f.calls.length, 0, 'no Turnstile, Slack or Formspree call');
});

// ---- Slack message safety ------------------------------------------------------------

test('Slack: a body containing <!channel> arrives escaped, and no submitted string makes a mention or a link', async () => {
  const evil = {
    ...VALID.truck,
    name: '<!channel>',
    company: 'Acme <!here> & Co',
    commodity: '<@U12345> <#C12345>',
    note: 'call <https://evil.example|here>\n`code` ```block``` <!subteam^S123>\nhttps://evil.example/x *bold* _it_',
  };
  const { res, f } = await run(evil);
  assert.equal(res.status, 200);
  const text = slackText(f);
  for (const raw of ['<!channel>', '<!here>', '<@U12345>', '<#C12345>', '<https://', '<!subteam']) assert.ok(!text.includes(raw), `raw ${raw} in Slack text`);
  assert.ok(text.includes('&lt;!channel&gt;'), 'escaped <!channel> is shown as text');
  assert.ok(text.includes('Acme &lt;!here&gt; &amp; Co'));
  // Every submitted value sits inside code formatting, where Slack makes no links, and no
  // submitted backtick survives to close it early.
  assert.ok(text.includes('`&lt;!channel&gt;`'), 'the name is inline code');
  const at = text.indexOf('https://evil.example/x'), open = text.indexOf('```'), close = text.lastIndexOf('```');
  assert.ok(open >= 0 && open < at && at < close, 'the submitted URL sits inside the note code block');
  const body = JSON.parse(f.to(SLACK)[0].init.body);
  assert.equal(body.unfurl_links, false);
  assert.equal(body.unfurl_media, false);
  assert.equal(body.link_names, undefined);
  const ticks = (text.match(/`/g) || []).length;
  const ours = (text.match(/```/g) || []).length * 3;
  assert.equal((ticks - ours) % 2, 0, 'inline code spans balanced');
  assert.ok(!text.includes('`code`') && !text.includes('```block```'), 'submitted backticks replaced');
});

// ---- the email copy (ops@ through Formspree) ------------------------------------------------

test('ops@ gets a plain-text copy through Formspree: one-line subject, reply-to is the requester', async () => {
  const { f } = await run({ ...VALID.truck, company: 'Acme\tFoods <b>' });
  const post = f.to(LEAD_ENDPOINT)[0];
  assert.equal(post.init.method, 'POST');
  const body = JSON.parse(post.init.body);
  assert.equal(body.email, 'jane@acme.example');
  assert.ok(!/[\r\n]/.test(body._subject), 'subject is one line');
  assert.match(body._subject, /^Quote request · /);
  assert.match(body.message, /90058 → 75247/);
  assert.match(body.message, /Full truckload · dry van/);
  assert.equal(typeof body.message, 'string');
});

// ---- two independent deliveries ------------------------------------------------------------------

test('Slack down, email up: still a success, and the email is sent', async () => {
  for (const slack of [500, 'throw']) {
    const { res, json, f, logs } = await run(VALID.truck, { fake: { slack } });
    assert.equal(res.status, 200, String(slack));
    assert.deepEqual(json, { ok: true });
    assert.equal(f.to(LEAD_ENDPOINT).length, 1);
    assert.ok(logs.some((l) => /slack/i.test(JSON.stringify(l))), 'the failed delivery is logged');
  }
});

test('email down, Slack up: still a success, and Slack is sent', async () => {
  const { res, json, f } = await run(VALID.truck, { fake: { email: 503 } });
  assert.equal(res.status, 200);
  assert.deepEqual(json, { ok: true });
  assert.equal(f.to(SLACK).length, 1);
});

test('both down: 502 and ok:false, never a false "sent"', async () => {
  const { res, json } = await run(VALID.truck, { fake: { slack: 'throw', email: 500 } });
  assert.equal(res.status, 502);
  assert.deepEqual(json, { ok: false });
});

test('the email goes to the quote form from the secret, never the contact questionnaire\'s form', async () => {
  const { LEAD_ENDPOINT: QUESTIONNAIRE } = await import('../scripts/config.mjs');
  const { f } = await run(VALID.truck);
  assert.equal(f.to(LEAD_ENDPOINT).length, 1);
  assert.equal(f.to(QUESTIONNAIRE).length, 0);
});

test('no Formspree form ID configured, or a malformed one: Slack alone still delivers', async () => {
  for (const id of [undefined, 'x/../y', 'abc']) {
    const { res, f, logs } = await run(VALID.truck, { env: { FORMSPREE_QUOTE_FORM_ID: id } });
    assert.equal(res.status, 200, String(id));
    assert.equal(f.to(SLACK).length, 1);
    assert.ok(!f.calls.some((c) => c.url.startsWith('https://formspree.io/')), 'no Formspree call');
    assert.ok(logs.some((l) => /FORMSPREE_QUOTE_FORM_ID not set/.test(JSON.stringify(l))));
  }
});

test('responses and logs never carry the Formspree form ID', async () => {
  const { text, logs } = await run(VALID.truck, { fake: { email: 500 } });
  assert.ok(!text.includes(FORM_ID));
  assert.ok(!JSON.stringify(logs).includes(FORM_ID));
});

test('no Slack webhook configured: email alone still delivers', async () => {
  const { res, f } = await run(VALID.truck, { env: { SLACK_WEBHOOK_URL: undefined } });
  assert.equal(res.status, 200);
  assert.equal(f.to(LEAD_ENDPOINT).length, 1);
});

// ---- what the endpoint gives away ---------------------------------------------------------------

test('responses carry only ok, no-store, nosniff, and never a secret, a price or internal detail', async () => {
  for (const r of [await run(VALID.truck), await run({ ...VALID.truck, token: '' }), await run(VALID.truck, { fake: { slack: 500, email: 500 } }), await run({ ...VALID.truck, from: 'x' })]) {
    assert.deepEqual(Object.keys(r.json), ['ok']);
    assert.ok(!r.text.includes('hooks.slack.com') && !r.text.includes('turnstile-secret'));
    assert.equal(r.res.headers.get('cache-control'), 'no-store');
    assert.equal(r.res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.res.headers.get('content-type'), /^application\/json/);
  }
});
