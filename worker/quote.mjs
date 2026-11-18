// POST /api/quote-request: the "Get your rate" box (lane 16).
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

import { MODES, EQUIPMENT, INTL_MODES, PORTS, CONTAINERS, MAX } from '../scripts/quote-fields.mjs';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_ACTION = 'quote';
const MAX_BODY = 16 * 1024;
const SEND_TIMEOUT_MS = 8000;
const FORMSPREE_ID = /^[A-Za-z0-9]{6,16}$/;
export const formspreeUrl = (id) => `https://formspree.io/f/${id}`;

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

// ───────────── the two messages ─────────────
const DATE_LABEL = { truck: 'Pickup date', intl: 'Ready date', dray: 'Container available', parcel: 'Ship date' };
const EQUIP_LABEL = { truck: 'Equipment', intl: 'Mode', dray: 'Container', parcel: 'Service' };

// The lines both messages share, as [label, value] pairs of plain text.
function lines(q) {
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
  const parts = [`*New quote request · ${MODES[q.mode]}*`];
  for (const [label, value] of lines(q)) {
    if (label === 'Lane') parts.push(`*Lane:* ${code(q.from)} → ${code(q.to)}`);
    else parts.push(`*${label}:* ${code(value)}`);
  }
  parts.push(q.note ? '*Note:*\n```' + slackEscape(noTicks(q.note)) + '```' : '*Note:* —');
  parts.push('_Price it in Quote Factory and reply to the requester by email._');
  return { text: parts.join('\n'), unfurl_links: false, unfurl_media: false };
}

// ops@ through Formspree: plain text. Formspree escapes HTML in its email; the subject is one line.
export function emailMessage(q) {
  const oneLine = (s) => s.replace(/\s+/g, ' ').trim();
  const subject = oneLine(`Quote request · ${MODES[q.mode]} · ${q.from} → ${q.to} · ${q.company}`).slice(0, 200);
  const body = lines(q).map(([l, v]) => `${l}: ${v || '—'}`).join('\n') + `\nNote: ${q.note || '—'}\n\nSent from the "Get your rate" box on valencesupplychain.com.`;
  return { _subject: subject, email: q.email, name: q.name, company: q.company, message: body };
}

async function post(fetchFn, url, payload) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  return res.status;
}

async function deliver(q, env, fetchFn, log) {
  const slackUrl = typeof env.SLACK_WEBHOOK_URL === 'string' && env.SLACK_WEBHOOK_URL.startsWith('https://hooks.slack.com/') ? env.SLACK_WEBHOOK_URL : null;
  const jobs = {
    slack: slackUrl ? post(fetchFn, slackUrl, slackMessage(q)) : Promise.reject(new Error('SLACK_WEBHOOK_URL not set')),
    email: typeof env.FORMSPREE_QUOTE_FORM_ID === 'string' && FORMSPREE_ID.test(env.FORMSPREE_QUOTE_FORM_ID)
      ? post(fetchFn, formspreeUrl(env.FORMSPREE_QUOTE_FORM_ID), emailMessage(q))
      : Promise.reject(new Error('FORMSPREE_QUOTE_FORM_ID not set')),
  };
  const names = Object.keys(jobs);
  const settled = await Promise.allSettled(Object.values(jobs));
  const outcome = {};
  settled.forEach((s, i) => {
    outcome[names[i]] = s.status === 'fulfilled' ? (s.value >= 200 && s.value < 300 ? 'sent' : `http ${s.value}`) : `error ${String(s.reason && s.reason.message || s.reason).slice(0, 80)}`;
  });
  // No personal data in the log: which delivery worked, and the tab.
  log({ event: 'quote-request', mode: q.mode, ...outcome });
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
  try { q = validate(body, now); } catch (e) { if (e instanceof Invalid) return reply(400, false); throw e; }

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

  return (await deliver(q, env, fetchFn, log)) ? reply(200, true) : reply(502, false);
}
