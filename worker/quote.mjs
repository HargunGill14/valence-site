// POST /api/quote-request: the "Get an instant quote" box, the homepage map's pick-a-lane and the
// quote page (lane 16). The body's kind says which:
//   no kind       the box (one of the four tabs, with the full details);
//   "map"         a map pick (two places from scripts/map-places.mjs, the mode's extras and an email);
//   "quote_page"  /quote/ (two ZIPs, a pickup date, the items, pickup and delivery options, contact).
// Any other kind is refused.
//
// Order: method, origin and size → per-IP rate limit (Workers rate-limiting binding) → JSON →
// honeypot (silently dropped) → Turnstile token present → every field validated → Turnstile
// verified server-side → two independent deliveries:
//   1. Slack #quote-requests through an incoming webhook (SLACK_WEBHOOK_URL, a Worker secret);
//   2. ops@ through the "Quote requests" Formspree form, whose ID is the Worker secret
//      FORMSPREE_QUOTE_FORM_ID (never in the repo, dist/ or the page); ops@ feeds Slack #ops-emails.
// The visitor sees success if at least one landed, and an error only if both failed.
// Responses are {"ok":true} or {"ok":false} and nothing else: no price, no reason, no detail.
// Secrets live only in the Worker (wrangler secret put), never in the repo or dist/.

import { MODES, MAP_MODES, EQUIPMENT, INTL_MODES, PORTS, CONTAINERS, MAX, ITEM_TYPES, ITEM_LIMITS, QUOTE_OPTIONS } from '../scripts/quote-fields.mjs';
import { MAP_CITIES, MAP_STATES } from '../scripts/map-places.mjs';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_ACTION = 'quote';
const MAX_BODY = 16 * 1024;
const SEND_TIMEOUT_MS = 8000;
const FORMSPREE_ID = /^[A-Za-z0-9]{6,16}$/;
export const formspreeUrl = (id) => `https://formspree.io/f/${id}`;
// Every server-side post says what it is. Formspree sits behind its own bot protection, and a
// request with no User-Agent or Referer looks like the bots it is there to stop.
const USER_AGENT = 'valence-site-quote/1 (+https://www.valencesupplychain.com)';

// The Worker secret holds the form's ID. Accept it pasted as the ID alone, with stray whitespace,
// or as the form's full URL (https://formspree.io/f/<id>), and nothing else. Never log the value.
export function formspreeId(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return { error: 'FORMSPREE_QUOTE_FORM_ID not set' };
  const v = raw.trim();
  const m = v.match(/^(?:https:\/\/)?formspree\.io\/f\/([^/?#\s]+)\/?$/i);
  const id = m ? m[1] : v;
  return FORMSPREE_ID.test(id) ? { id } : { error: 'FORMSPREE_QUOTE_FORM_ID malformed' };
}

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
};
const reply = (status, ok) => new Response(JSON.stringify({ ok }), { status, headers: HEADERS });

// ───────────── validation ─────────────
// Control characters and bidi overrides are refused outright; newlines only in the note.
const BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029\u202A-\u202E\u2066-\u2069]/;
const ZIP = /^\d{5}$/;
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
const PHONE = /^[0-9+().\s-]*(?:(?:x|ext\.?)\s*\d{1,6})?$/i;
const CONTAINER_NO = /^[A-Za-z0-9 -]*$/;

class Invalid extends Error {}

function text(body, key, { max, required = false, multiline = false } = {}) {
  const raw = body[key];
  if (raw === undefined || raw === null) { if (required) throw new Invalid(key); return ''; }
  if (typeof raw !== 'string') throw new Invalid(key);
  if (raw.length > max * 2) throw new Invalid(key);   // before any normalising
  if (BAD_CHARS.test(raw) || (!multiline && /[\r\n]/.test(raw.trim()))) throw new Invalid(key);
  const v = multiline ? raw.replace(/\r\n?/g, '\n').trim() : raw.trim().replace(/\s+/g, ' ');
  if (v.length > max) throw new Invalid(key);
  if (required && !v) throw new Invalid(key);
  return v;
}
function oneOf(body, key, list) {
  const v = text(body, key, { max: 80, required: true });
  if (!list.includes(v)) throw new Invalid(key);
  return v;
}
function date(body, now) {
  const v = text(body, 'date', { max: 10, required: true });
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Invalid('date');
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.toISOString().slice(0, 10) !== v) throw new Invalid('date');   // 2026-02-30 and friends
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // a day of slack for US time zones, which are behind UTC; at most a year out
  if (d.getTime() < today - 86400000 || d.getTime() > today + 366 * 86400000) throw new Invalid('date');
  return v;
}
function pounds(body, key, { decimal = false, max = 200000 } = {}) {
  const v = text(body, key, { max: MAX.weight, required: true }).replace(/,/g, '');
  if (!(decimal ? /^\d{1,6}(\.\d{1,2})?$/ : /^\d{1,6}$/).test(v)) throw new Invalid(key);
  const n = Number(v);
  if (!(n > 0 && n <= max)) throw new Invalid(key);
  return v;
}
function place(body, key, max) {
  const v = text(body, key, { max, required: true });
  if (v.length < 2) throw new Invalid(key);
  return v;
}

export function validate(body, now = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Invalid('body');
  const mode = text(body, 'mode', { max: 10, required: true });
  if (!Object.hasOwn(MODES, mode)) throw new Invalid('mode');
  const q = { mode };
  if (mode === 'truck') {
    q.from = text(body, 'from', { max: MAX.zip, required: true });
    q.to = text(body, 'to', { max: MAX.zip, required: true });
    if (!ZIP.test(q.from) || !ZIP.test(q.to)) throw new Invalid('zip');
    q.equipment = oneOf(body, 'equipment', EQUIPMENT);
    q.weight = pounds(body, 'weight');
  } else if (mode === 'intl') {
    q.from = place(body, 'from', MAX.place);
    q.to = place(body, 'to', MAX.place);
    q.equipment = oneOf(body, 'intlmode', INTL_MODES);
    q.weight = pounds(body, 'weight');
  } else if (mode === 'dray') {
    q.from = oneOf(body, 'from', PORTS);
    q.to = text(body, 'to', { max: MAX.zip, required: true });
    if (!ZIP.test(q.to)) throw new Invalid('zip');
    q.equipment = oneOf(body, 'container', CONTAINERS);
    q.containerno = text(body, 'containerno', { max: MAX.containerno });
    if (!CONTAINER_NO.test(q.containerno)) throw new Invalid('containerno');
    q.weight = pounds(body, 'weight');
  } else {
    q.from = place(body, 'from', MAX.address);
    q.to = place(body, 'to', MAX.address);
    if (q.from.length < 4 || q.to.length < 4) throw new Invalid('address');
    q.weight = pounds(body, 'weight', { decimal: true, max: 2000 });
    q.box = text(body, 'box', { max: MAX.box, required: true });
    q.equipment = 'Parcel';
  }
  q.date = date(body, now);
  q.commodity = text(body, 'commodity', { max: MAX.commodity });
  q.name = text(body, 'name', { max: MAX.name, required: true });
  q.company = text(body, 'company', { max: MAX.company, required: true });
  q.email = text(body, 'email', { max: MAX.email, required: true });
  if (!EMAIL.test(q.email)) throw new Invalid('email');
  q.phone = text(body, 'phone', { max: MAX.phone });
  if (!PHONE.test(q.phone)) throw new Invalid('phone');
  q.note = text(body, 'note', { max: MAX.note, multiline: true });
  return q;
}

// The homepage map: two places from the site's own list, the extras the mode needs, and an email.
// A city's ZIP comes from MAP_CITIES; nothing the browser says about ZIPs is read.
function mapPlace(body, key) {
  const v = text(body, key, { max: 60, required: true });
  const m = v.match(/^(city|state):(.+)$/);
  if (!m) throw new Invalid(key);
  const [, kind, name] = m;
  if (kind === 'city' && Object.hasOwn(MAP_CITIES, name)) return { id: v, label: `${name}, ${MAP_CITIES[name]}`, short: name };
  if (kind === 'state' && Object.hasOwn(MAP_STATES, name)) return { id: v, label: `${name} (${MAP_STATES[name]})`, short: `${name} (${MAP_STATES[name]})` };
  throw new Invalid(key);
}
export function validateMap(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Invalid('body');
  const mode = text(body, 'mode', { max: 10, required: true });
  if (!Object.hasOwn(MAP_MODES, mode)) throw new Invalid('mode');
  const from = mapPlace(body, 'from'), to = mapPlace(body, 'to');
  if (from.id === to.id) throw new Invalid('to');
  const q = { kind: 'map', mode, from: from.label, to: to.label, fromShort: from.short, toShort: to.short, equipment: '' };
  if (mode === 'truck') {
    q.equipment = text(body, 'equipment', { max: 80 });
    if (q.equipment && !EQUIPMENT.includes(q.equipment)) throw new Invalid('equipment');
  } else if (mode === 'intl') {
    q.equipment = oneOf(body, 'intlmode', INTL_MODES);
  } else if (mode === 'dray') {
    q.port = oneOf(body, 'port', PORTS);
    q.equipment = oneOf(body, 'container', CONTAINERS);
  } else if (mode === 'parcel') {
    q.weight = pounds(body, 'weight', { decimal: true, max: 2000 });
    q.box = text(body, 'box', { max: MAX.box, required: true });
  }
  q.email = text(body, 'email', { max: MAX.email, required: true });
  if (!EMAIL.test(q.email)) throw new Invalid('email');
  return q;
}

// The quote page. Every number is a whole number the Worker reads itself; the total weight and the
// piece count are worked out here, never taken from the browser. Options are ids from QUOTE_OPTIONS,
// each group on its own list, with no repeats.
function whole(raw, key, max, { required = true } = {}) {
  const s = typeof raw === 'number' ? String(raw) : raw;
  if (s === undefined || s === null || s === '') { if (required) throw new Invalid(key); return 0; }
  if (typeof s !== 'string') throw new Invalid(key);
  const v = s.trim().replace(/,/g, '');
  if (!/^\d{1,6}$/.test(v)) throw new Invalid(key);
  const n = Number(v);
  if (!(n >= 1 && n <= max)) throw new Invalid(key);
  return n;
}
function items(body) {
  const list = body.items;
  if (!Array.isArray(list) || list.length < 1 || list.length > ITEM_LIMITS.items) throw new Invalid('items');
  return list.map((it) => {
    if (!it || typeof it !== 'object' || Array.isArray(it)) throw new Invalid('items');
    const type = text(it, 'type', { max: 20, required: true });
    if (!ITEM_TYPES.includes(type)) throw new Invalid('type');
    const qty = whole(it.qty, 'qty', ITEM_LIMITS.qty), lbs = whole(it.lbs, 'lbs', ITEM_LIMITS.lbs);
    const dims = ['l', 'w', 'h'].map((k) => whole(it[k], k, ITEM_LIMITS.dim, { required: false }));
    if (dims.some(Boolean) && !dims.every(Boolean)) throw new Invalid('dims');   // all three or none
    return { type, qty, lbs, dims: dims.every(Boolean) ? dims : null };
  });
}
function options(body, kind) {
  const raw = body[kind] === undefined ? [] : body[kind];
  const list = QUOTE_OPTIONS[kind];
  if (!Array.isArray(raw) || raw.length > Object.keys(list).length) throw new Invalid(kind);
  if (raw.some((id) => typeof id !== 'string' || !Object.hasOwn(list, id)) || new Set(raw).size !== raw.length) throw new Invalid(kind);
  return raw.map((id) => list[id]);
}
const fmt = (n) => n.toLocaleString('en-US');
export function validateQuotePage(body, now = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Invalid('body');
  const q = { kind: 'quote_page' };
  q.from = text(body, 'from', { max: MAX.zip, required: true });
  q.to = text(body, 'to', { max: MAX.zip, required: true });
  if (!ZIP.test(q.from) || !ZIP.test(q.to)) throw new Invalid('zip');
  // Arrived from the map: the places the visitor clicked, read against the site's own list.
  q.fromPlace = body.fromPlace ? mapPlace(body, 'fromPlace').label : '';
  q.toPlace = body.toPlace ? mapPlace(body, 'toPlace').label : '';
  q.date = date(body, now);
  q.items = items(body);
  q.pieces = q.items.reduce((a, i) => a + i.qty, 0);
  q.total = q.items.reduce((a, i) => a + i.qty * i.lbs, 0);
  if (q.total > ITEM_LIMITS.total) throw new Invalid('total');
  q.pickup = options(body, 'pickup');
  q.delivery = options(body, 'delivery');
  q.name = text(body, 'name', { max: MAX.name, required: true });
  q.company = text(body, 'company', { max: MAX.company, required: true });
  q.email = text(body, 'email', { max: MAX.email, required: true });
  if (!EMAIL.test(q.email)) throw new Invalid('email');
  q.phone = text(body, 'phone', { max: MAX.phone });
  if (!PHONE.test(q.phone)) throw new Invalid('phone');
  q.note = text(body, 'note', { max: MAX.note, multiline: true });
  return q;
}
const itemLine = (i) => `${i.qty} × ${i.type} · ${fmt(i.lbs)} lb each${i.dims ? ` · ${i.dims.join(' × ')} in` : ''}`;
const pieces = (n) => `${fmt(n)} ${n === 1 ? 'piece' : 'pieces'}`;

// ───────────── the two messages ─────────────
const DATE_LABEL = { truck: 'Pickup date', intl: 'Ready date', dray: 'Container available', parcel: 'Ship date' };
const EQUIP_LABEL = { truck: 'Equipment', intl: 'Mode', dray: 'Container', parcel: 'Service' };

// The lines both messages share, as [label, value] pairs of plain text.
const MAP_EQUIP_LABEL = { truck: 'Equipment', intl: 'Mode', dray: 'Container', parcel: 'Service', unsure: 'Mode' };
function lines(q) {
  if (q.kind === 'quote_page') {
    const out = [['Lane', `${q.from} → ${q.to}`]];
    if (q.fromPlace || q.toPlace) out.push(['Picked on the map', `${q.fromPlace || '—'} → ${q.toPlace || '—'}`]);
    out.push(['Pickup date', q.date]);
    q.items.forEach((i, n) => out.push([q.items.length > 1 ? `Item ${n + 1}` : 'Item', itemLine(i)]));
    out.push(['Total', `${pieces(q.pieces)} · ${fmt(q.total)} lb`]);
    out.push(['Pickup options', q.pickup.join(', ') || 'none'], ['Delivery options', q.delivery.join(', ') || 'none']);
    out.push(['Name', q.name], ['Company', q.company], ['Email', q.email], ['Phone', q.phone]);
    return out;
  }
  if (q.kind === 'map') {
    const out = [['From', q.from], ['To', q.to]];
    if (q.port) out.push(['Port or ramp', q.port]);
    if (q.equipment) out.push([MAP_EQUIP_LABEL[q.mode], q.equipment]);
    if (q.weight) out.push(['Weight', `${q.weight} lb`]);
    if (q.box) out.push(['Box size', q.box]);
    out.push(['Email', q.email]);
    return out;
  }
  const out = [
    ['Lane', `${q.from} → ${q.to}`],
    [EQUIP_LABEL[q.mode], q.equipment],
  ];
  if (q.containerno) out.push(['Container or booking', q.containerno]);
  if (q.box) out.push(['Box size', q.box]);
  out.push([DATE_LABEL[q.mode], q.date], ['Weight', `${q.weight} lb`]);
  out.push(['Commodity', q.commodity], ['Name', q.name], ['Company', q.company], ['Email', q.email], ['Phone', q.phone]);
  return out;
}

// Slack: user text is untrusted. Escape &, < and > (Slack's own control characters), swap any
// backtick for a lookalike, and put every submitted value inside code formatting, where Slack
// turns nothing into a mention, a channel link, a URL or bold. link_names stays off.
const slackEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const noTicks = (s) => s.replace(/`/g, 'ˋ');
const code = (s) => (s ? '`' + slackEscape(noTicks(s)) + '`' : '—');

export function slackMessage(q) {
  const map = q.kind === 'map';
  const parts = [map ? `*Map quote request · ${MAP_MODES[q.mode]}*` : q.kind === 'quote_page' ? '*Quote page request*' : `*New quote request · ${MODES[q.mode]}*`];
  for (const [label, value] of lines(q)) {
    if (label === 'Lane') parts.push(`*Lane:* ${code(q.from)} → ${code(q.to)}`);
    else parts.push(`*${label}:* ${code(value)}`);
  }
  if (map) parts.push('_From the homepage map: only the lane and an email. Ask for the details when you reply._');
  else parts.push(q.note ? '*Note:*\n```' + slackEscape(noTicks(q.note)) + '```' : '*Note:* —');
  parts.push('_Price it in Quote Factory and reply to the requester by email._');
  return { text: parts.join('\n'), unfurl_links: false, unfurl_media: false };
}

// ops@ through Formspree: plain text. Formspree escapes HTML in its email; the subject is one line.
export function emailMessage(q) {
  const oneLine = (s) => s.replace(/\s+/g, ' ').trim();
  const text = (pairs) => pairs.map(([l, v]) => `${l}: ${v || '—'}`).join('\n');
  if (q.kind === 'map') {
    const detail = q.port ? ` · ${q.port} · ${q.equipment}` : q.equipment ? ` · ${q.equipment}` : '';
    const subject = oneLine(`Map quote request · ${MAP_MODES[q.mode]} · ${q.fromShort} → ${q.toShort}${detail}`).slice(0, 200);
    return { _subject: subject, email: q.email, message: text(lines(q)) + '\n\nSent from the homepage map on valencesupplychain.com. Only the lane and an email: ask for the details when you reply.' };
  }
  if (q.kind === 'quote_page') {
    const subject = oneLine(`Quote page request · ${q.from} → ${q.to} · ${pieces(q.pieces)} · ${fmt(q.total)} lb · ${q.company}`).slice(0, 200);
    const body = text(lines(q)) + `\nNote: ${q.note || '—'}\n\nSent from the quote page (/quote/) on valencesupplychain.com.`;
    return { _subject: subject, email: q.email, name: q.name, company: q.company, message: body };
  }
  const subject = oneLine(`Quote request · ${MODES[q.mode]} · ${q.from} → ${q.to} · ${q.company}`).slice(0, 200);
  const body = text(lines(q)) + `\nNote: ${q.note || '—'}\n\nSent from the "Get an instant quote" box on valencesupplychain.com.`;
  return { _subject: subject, email: q.email, name: q.name, company: q.company, message: body };
}

// Posts JSON and answers { status, codes }. codes are the machine-readable error codes Formspree
// returns on a refusal (like TYPE_EMAIL); its messages can quote what the visitor typed, so they
// are never kept.
async function post(fetchFn, url, payload, extraHeaders = {}) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': USER_AGENT, ...extraHeaders },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  let codes = [];
  if (res.status >= 300) {
    try {
      const j = await res.json();
      codes = (Array.isArray(j && j.errors) ? j.errors : []).map((e) => String(e && e.code || '')).filter((c) => /^[A-Z0-9_]{1,40}$/.test(c)).slice(0, 5);
    } catch { /* not JSON: the status says enough */ }
  }
  return { status: res.status, codes };
}

async function deliver(q, env, fetchFn, log, siteOrigin) {
  const slackUrl = typeof env.SLACK_WEBHOOK_URL === 'string' && env.SLACK_WEBHOOK_URL.startsWith('https://hooks.slack.com/') ? env.SLACK_WEBHOOK_URL : null;
  const form = formspreeId(env.FORMSPREE_QUOTE_FORM_ID);
  const jobs = {
    slack: slackUrl ? post(fetchFn, slackUrl, slackMessage(q)) : Promise.reject(new Error('SLACK_WEBHOOK_URL not set')),
    email: form.id
      ? post(fetchFn, formspreeUrl(form.id), emailMessage(q), { referer: `${siteOrigin}/`, origin: siteOrigin })
      : Promise.reject(new Error(form.error)),
  };
  const names = Object.keys(jobs);
  const settled = await Promise.allSettled(Object.values(jobs));
  const outcome = {};
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') {
      const { status, codes } = s.value;
      outcome[names[i]] = status >= 200 && status < 300 ? 'sent' : `http ${status}`;
      if (codes.length) outcome[`${names[i]}_codes`] = codes;
    } else {
      outcome[names[i]] = `error ${String(s.reason && s.reason.message || s.reason).slice(0, 80)}`;
    }
  });
  // No personal data in the log: which delivery worked, the request type and the tab.
  log({ event: 'quote-request', kind: q.kind || 'box', mode: q.mode, ...outcome });
  return names.some((n) => outcome[n] === 'sent');
}

// ───────────── the handler ─────────────
export async function handleQuote(request, env, { fetch: fetchFn = globalThis.fetch, log = (x) => console.log(JSON.stringify(x)), now = new Date() } = {}) {
  if (request.method !== 'POST') return new Response(JSON.stringify({ ok: false }), { status: 405, headers: { ...HEADERS, allow: 'POST' } });
  const self = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && origin !== self.origin) return reply(403, false);
  if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return reply(415, false);
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return reply(413, false);

  const ip = request.headers.get('cf-connecting-ip') || '';
  if (!env.QUOTE_LIMITER) { log({ event: 'quote-request', error: 'QUOTE_LIMITER binding missing' }); return reply(503, false); }
  const { success } = await env.QUOTE_LIMITER.limit({ key: ip || 'unknown' });
  if (!success) return reply(429, false);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return reply(413, false);
  let body;
  try { body = JSON.parse(raw); } catch { return reply(400, false); }
  if (!body || typeof body !== 'object') return reply(400, false);

  // Honeypot: a field people never see. Filled means a bot; it is told "ok" and nothing is sent.
  if (typeof body.website === 'string' && body.website.trim() !== '') return reply(200, true);

  const token = typeof body.token === 'string' ? body.token : '';
  if (!token || token.length > 2048) return reply(403, false);

  let q;
  const VALIDATE = { map: validateMap, quote_page: validateQuotePage };
  try {
    if (body.kind === undefined) q = validate(body, now);
    else if (typeof body.kind === 'string' && Object.hasOwn(VALIDATE, body.kind)) q = VALIDATE[body.kind](body, now);
    else throw new Invalid('kind');
  } catch (e) { if (e instanceof Invalid) return reply(400, false); throw e; }

  if (!env.TURNSTILE_SECRET_KEY) { log({ event: 'quote-request', error: 'TURNSTILE_SECRET_KEY not set' }); return reply(503, false); }
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  let verdict;
  try {
    const r = await fetchFn(SITEVERIFY, { method: 'POST', body: form, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
    verdict = await r.json();
  } catch {
    log({ event: 'quote-request', error: 'siteverify unreachable' });
    return reply(503, false);
  }
  if (!verdict || verdict.success !== true || verdict.hostname !== self.hostname || verdict.action !== TURNSTILE_ACTION) return reply(403, false);

  return (await deliver(q, env, fetchFn, log, self.origin)) ? reply(200, true) : reply(502, false);
}
