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
    const body = status < 400 ? '{"ok":true}' : JSON.stringify({ error: 'Validation errors', errors: [{ code: 'TYPE_EMAIL', field: 'email', message: 'should be an email: jane@acme.example' }] });
    return new Response(body, { status, headers: { 'content-type': 'application/json' } });
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

test('no Formspree form ID: Slack alone still delivers, and the log says the secret is not set', async () => {
  const { res, f, logs } = await run(VALID.truck, { env: { FORMSPREE_QUOTE_FORM_ID: undefined } });
  assert.equal(res.status, 200);
  assert.equal(f.to(SLACK).length, 1);
  assert.ok(!f.calls.some((c) => c.url.startsWith('https://formspree.io/')), 'no Formspree call');
  assert.equal(logs.at(-1).email, 'error FORMSPREE_QUOTE_FORM_ID not set');
});

test('a malformed Formspree form ID: Slack alone still delivers, and the log says malformed (not "not set"), without the value', async () => {
  for (const id of ['x/../y', 'abc', 'https://evil.example/f/qtestform1', '']) {
    const { res, f, logs } = await run(VALID.truck, { env: { FORMSPREE_QUOTE_FORM_ID: id } });
    assert.equal(res.status, 200, JSON.stringify(id));
    assert.equal(f.to(SLACK).length, 1);
    assert.ok(!f.calls.some((c) => c.url.startsWith('https://formspree.io/')), `no Formspree call for ${JSON.stringify(id)}`);
    assert.equal(logs.at(-1).email, id === '' ? 'error FORMSPREE_QUOTE_FORM_ID not set' : 'error FORMSPREE_QUOTE_FORM_ID malformed', JSON.stringify(id));
    if (id) assert.ok(!JSON.stringify(logs).includes(id), 'the value is not logged');
  }
});

test('a pasted full Formspree URL, or the ID with stray spaces or a newline, still reaches the quote form', async () => {
  for (const id of [`https://formspree.io/f/${FORM_ID}`, `https://formspree.io/f/${FORM_ID}/`, `formspree.io/f/${FORM_ID}`, `  ${FORM_ID}\n`]) {
    const { res, f, logs } = await run(VALID.truck, { env: { FORMSPREE_QUOTE_FORM_ID: id } });
    assert.equal(res.status, 200);
    assert.equal(f.to(LEAD_ENDPOINT).length, 1, JSON.stringify(id));
    assert.equal(logs.at(-1).email, 'sent', JSON.stringify(id));
  }
});

test('Formspree refusing: the log has its status and error codes, never its message or the requester\'s details', async () => {
  const { res, logs } = await run(VALID.truck, { fake: { email: 422 } });
  assert.equal(res.status, 200, 'Slack still delivered');
  const last = logs.at(-1);
  assert.equal(last.email, 'http 422');
  assert.deepEqual(last.email_codes, ['TYPE_EMAIL']);
  const all = JSON.stringify(logs);
  for (const pii of ['jane@acme.example', 'Jane Doe', 'Acme Foods', 'should be an email']) assert.ok(!all.includes(pii), `log leaks ${pii}`);
});

test('the server-side posts name themselves: a User-Agent on both, and a Referer of the site on the Formspree post', async () => {
  const { f } = await run(VALID.truck);
  const fs = new Headers(f.to(LEAD_ENDPOINT)[0].init.headers);
  assert.match(fs.get('user-agent') || '', /^valence-site-quote\//);
  assert.equal(fs.get('referer'), `https://${HOST}/`);
  assert.match(new Headers(f.to(SLACK)[0].init.headers).get('user-agent') || '', /^valence-site-quote\//);
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

// ---- the homepage map's pick-a-lane (kind: "map") ------------------------------------------------

const MAP = {
  truck: { kind: 'map', mode: 'truck', from: 'city:Los Angeles', to: 'city:Dallas', equipment: 'Full truckload · reefer', email: 'jane@acme.example', website: '', token: 'tok-123' },
  intl: { kind: 'map', mode: 'intl', from: 'city:Seattle', to: 'state:Texas', intlmode: 'Air', email: 'jane@acme.example', website: '', token: 'tok-123' },
  dray: { kind: 'map', mode: 'dray', from: 'city:Los Angeles', to: 'state:Arizona', port: 'Port of Long Beach', container: '45 ft', email: 'jane@acme.example', website: '', token: 'tok-123' },
  parcel: { kind: 'map', mode: 'parcel', from: 'city:Chicago', to: 'city:Detroit', weight: '12.5', box: '12 × 10 × 8 in', email: 'jane@acme.example', website: '', token: 'tok-123' },
  unsure: { kind: 'map', mode: 'unsure', from: 'state:Washington', to: 'city:Washington', email: 'jane@acme.example', website: '', token: 'tok-123' },
};

for (const mode of Object.keys(MAP)) {
  test(`map: a valid ${mode} pick is verified with Turnstile and sent to Slack and ops@`, async () => {
    const { res, json, f } = await run(MAP[mode]);
    assert.equal(res.status, 200, JSON.stringify(json));
    assert.deepEqual(json, { ok: true });
    assert.equal(f.to(SITEVERIFY).length, 1);
    assert.equal(f.to(SLACK).length, 1);
    assert.equal(f.to(LEAD_ENDPOINT).length, 1);
    assert.match(slackText(f), /Map quote request/);
  });
}

test('map: the truck pick needs no equipment, but an off-list one is refused', async () => {
  assert.equal((await run({ ...MAP.truck, equipment: '' })).res.status, 200);
  assert.equal((await run({ ...MAP.truck, equipment: 'Spaceship' })).res.status, 400);
});

test('map: a city\'s ZIP comes from the site\'s own list; a ZIP the browser sends is ignored', async () => {
  const { f } = await run({ ...MAP.truck, from_zip: '00000', to_zip: '99999', fromZip: '00000' });
  const text = slackText(f), mail = JSON.parse(f.to(LEAD_ENDPOINT)[0].init.body).message;
  for (const s of [text, mail]) {
    assert.ok(s.includes('Los Angeles') && s.includes('90058') && s.includes('Dallas') && s.includes('75247'), s);
    assert.ok(!s.includes('00000') && !s.includes('99999'));
  }
});

test('map: a state pick reads as the state with its abbreviation; Washington the state and the city are told apart', async () => {
  const { f } = await run(MAP.unsure);
  const text = slackText(f);
  assert.ok(text.includes('Washington (WA)'), text);
  assert.ok(text.includes('Washington, 20018') || text.includes('Washington · 20018'), text);
});

test('map: unknown or unprefixed places, the same place twice, a wrong mode or missing extras: 400, before Turnstile, nothing sent', async () => {
  const bad = [
    ['truck', { from: 'city:Atlantis' }],
    ['truck', { from: 'Dallas' }],
    ['truck', { to: 'state:Ontario' }],
    ['truck', { to: 'city:Los Angeles' }],
    ['truck', { from: 'city:<!channel>' }],
    ['truck', { mode: 'ltl' }],
    ['truck', { mode: 'rocket' }],
    ['truck', { email: '' }],
    ['truck', { email: 'not-an-email' }],
    ['dray', { port: '' }],
    ['dray', { port: 'Port of Atlantis' }],
    ['dray', { container: '53 ft' }],
    ['intl', { intlmode: '' }],
    ['intl', { intlmode: 'Teleport' }],
    ['parcel', { weight: '' }],
    ['parcel', { weight: '-4' }],
    ['parcel', { box: '' }],
    ['parcel', { box: 'b'.repeat(MAX.box + 1) }],
    ['truck', { kind: 'fax' }],
  ];
  for (const [mode, change] of bad) {
    const { res, f } = await run({ ...MAP[mode], ...change });
    assert.equal(res.status, 400, `${mode} ${JSON.stringify(change)}`);
    assert.equal(f.to(SITEVERIFY).length, 0);
    nothingSent(f);
  }
});

test('map: no token is 403, the honeypot is dropped silently, over the limit is 429', async () => {
  const noTok = await run({ ...MAP.truck, token: '' });
  assert.equal(noTok.res.status, 403);
  nothingSent(noTok.f);
  const hp = await run({ ...MAP.truck, website: 'x' });
  assert.equal(hp.res.status, 200);
  assert.equal(hp.f.calls.length, 0);
  const limited = await run(MAP.truck, { env: { QUOTE_LIMITER: { limit: async () => ({ success: false }) } } });
  assert.equal(limited.res.status, 429);
});

test('map: one delivery down still succeeds; both down is 502 and ok:false', async () => {
  assert.equal((await run(MAP.truck, { fake: { slack: 500 } })).res.status, 200);
  assert.equal((await run(MAP.truck, { fake: { email: 'throw' } })).res.status, 200);
  const both = await run(MAP.truck, { fake: { slack: 'throw', email: 500 } });
  assert.equal(both.res.status, 502);
  assert.deepEqual(both.json, { ok: false });
});

test('map: ops@ gets a one-line "Map quote request" subject with reply-to the requester; Slack values stay in code', async () => {
  const { f } = await run(MAP.dray);
  const body = JSON.parse(f.to(LEAD_ENDPOINT)[0].init.body);
  assert.match(body._subject, /^Map quote request · Drayage · Los Angeles → Arizona \(AZ\)/);
  assert.ok(!/[\r\n]/.test(body._subject));
  assert.equal(body.email, 'jane@acme.example');
  assert.match(body.message, /Port of Long Beach/);
  assert.match(body.message, /45 ft/);
  assert.match(body.message, /homepage map/);
  assert.ok(slackText(f).includes('`Port of Long Beach`'));
});

test('the box\'s requests are unchanged: no kind means the box, and the box email names the "Get an instant quote" box', async () => {
  const { res, f } = await run(VALID.truck);
  assert.equal(res.status, 200);
  const body = JSON.parse(f.to(LEAD_ENDPOINT)[0].init.body);
  assert.match(body.message, /Get an instant quote/);
  assert.ok(!/Get your rate/.test(body.message));
});

// ---- the quote page (/quote/): kind "quote_page" -----------------------------------------

const PAGE = {
  kind: 'quote_page', from: '90058', to: '75247', date: day(2),
  items: [{ type: 'Pallet', qty: '2', lbs: '1,250', l: '48', w: '40', h: '60' }, { type: 'Crate', qty: '1', lbs: '300', l: '', w: '', h: '' }],
  pickup: ['lift_pu', 'appt_pu'], delivery: ['appt_dl'],
  name: 'Jane Doe', company: 'Acme Foods', email: 'jane@acme.example', phone: '', note: 'Canned beverages.\nReceiver needs an appointment.',
  website: '', token: 'tok-123',
};

test('quote page: a valid request is verified with Turnstile and sent to Slack and ops@', async () => {
  const { res, json, f, logs } = await run(PAGE);
  assert.equal(res.status, 200, JSON.stringify(json));
  assert.deepEqual(json, { ok: true });
  assert.equal(f.to(SITEVERIFY).length, 1);
  assert.equal(f.to(SLACK).length, 1);
  assert.equal(f.to(LEAD_ENDPOINT).length, 1);
  assert.equal(logs.at(-1).kind, 'quote_page');
  assert.ok(!JSON.stringify(logs).includes('jane@acme.example'), 'no personal data in the log');
});

test('quote page: the Worker works out the total weight, and ignores one the browser sends', async () => {
  const { f } = await run({ ...PAGE, total_lbs: 1, total: '999999' });
  const text = slackText(f), mail = JSON.parse(f.to(LEAD_ENDPOINT)[0].init.body);
  for (const s of [text, mail.message]) {
    assert.ok(s.includes('2,800 lb'), s);              // 2 × 1,250 + 1 × 300
    assert.ok(s.includes('3 pieces'), s);
    assert.ok(!s.includes('999999'));
  }
  assert.ok(text.includes('`2 × Pallet · 1,250 lb each · 48 × 40 × 60 in`'), text);
  assert.ok(text.includes('`1 × Crate · 300 lb each`'), text);
});

test('quote page: options arrive by title, pickup and delivery apart; none is "none"', async () => {
  const { f } = await run(PAGE);
  const text = slackText(f), mail = JSON.parse(f.to(LEAD_ENDPOINT)[0].init.body).message;
  for (const s of [text, mail]) {
    assert.ok(s.includes('Liftgate pickup, Pickup appointment'), s);
    assert.ok(s.includes('Delivery appointment'), s);
  }
  const none = await run({ ...PAGE, pickup: [], delivery: [] });
  assert.equal(none.res.status, 200);
  assert.match(slackText(none.f), /\*Pickup options:\* `none`/);
});

test('quote page: a map pick rides along as the place, named from the site\'s own list', async () => {
  const { res, f } = await run({ ...PAGE, fromPlace: 'city:Los Angeles', toPlace: 'state:Texas' });
  assert.equal(res.status, 200);
  assert.ok(slackText(f).includes('Los Angeles, 90058') && slackText(f).includes('Texas (TX)'), slackText(f));
});

test('quote page: ops@ gets a one-line "Quote page request" subject with reply-to the requester', async () => {
  const { f } = await run(PAGE);
  const body = JSON.parse(f.to(LEAD_ENDPOINT)[0].init.body);
  assert.equal(body._subject, 'Quote page request · 90058 → 75247 · 3 pieces · 2,800 lb · Acme Foods');
  assert.equal(body.email, 'jane@acme.example');
  assert.equal(body.name, 'Jane Doe');
  assert.match(body.message, /Sent from the quote page/);
  assert.match(body.message, /Receiver needs an appointment/);
});

test('quote page: bad ZIPs, items, options, dates or contact: 400, before Turnstile, nothing sent', async () => {
  const item = PAGE.items[0];
  const bad = [
    { from: '9005' }, { to: 'ABCDE' }, { to: '' },
    { date: '' }, { date: day(-3) }, { date: '2026-02-30' }, { date: day(400) },
    { items: [] }, { items: 'Pallet' }, { items: undefined }, { items: [null] }, { items: ['Pallet'] },
    { items: Array.from({ length: 21 }, () => item) },
    { items: [{ ...item, type: 'Spaceship' }] },
    { items: [{ ...item, qty: '0' }] }, { items: [{ ...item, qty: '' }] }, { items: [{ ...item, qty: '1000' }] }, { items: [{ ...item, qty: '1.5' }] },
    { items: [{ ...item, lbs: '' }] }, { items: [{ ...item, lbs: '0' }] }, { items: [{ ...item, lbs: '50001' }] }, { items: [{ ...item, lbs: '-5' }] },
    { items: [{ ...item, l: '48', w: '', h: '' }] }, { items: [{ ...item, h: '1000' }] }, { items: [{ ...item, w: 'wide' }] },
    { items: [{ ...item, qty: '999', lbs: '50000' }] },     // 49,950,000 lb: over the total cap
    { pickup: ['lift_dl'] }, { delivery: ['lift_pu'] }, { pickup: ['lift_pu', 'lift_pu'] }, { pickup: 'lift_pu' }, { pickup: ['<!channel>'] },
    { fromPlace: 'city:Atlantis' }, { toPlace: 'Dallas' },
    { name: '' }, { company: '' }, { email: 'not-an-email' }, { phone: 'call me maybe' },
    { note: 'n'.repeat(MAX.note + 1) }, { name: 'a‮b' },
  ];
  for (const change of bad) {
    const { res, f } = await run({ ...PAGE, ...change });
    assert.equal(res.status, 400, JSON.stringify(change).slice(0, 120));
    assert.equal(f.to(SITEVERIFY).length, 0);
    nothingSent(f);
  }
});

test('quote page: no token is 403, the honeypot is dropped silently, both deliveries down is 502', async () => {
  const noTok = await run({ ...PAGE, token: '' });
  assert.equal(noTok.res.status, 403);
  nothingSent(noTok.f);
  const hp = await run({ ...PAGE, website: 'x' });
  assert.equal(hp.res.status, 200);
  assert.equal(hp.f.calls.length, 0);
  const both = await run(PAGE, { fake: { slack: 500, email: 'throw' } });
  assert.equal(both.res.status, 502);
  assert.deepEqual(both.json, { ok: false });
});

test('quote page: Slack values stay in code, so an item or a note cannot mention anyone', async () => {
  const { f } = await run({ ...PAGE, note: '<!channel> look', name: '<@U123> Jane', items: [{ ...PAGE.items[1] }] });
  const text = slackText(f);
  assert.ok(!text.includes('<!channel>') && !text.includes('<@U123>'), text);
});
