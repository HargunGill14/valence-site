/* "Get your rate" (lane 16): four tabs (truck, international, drayage, parcel), each with its own
   first step, then the details, then a thank-you. On send, the box posts JSON with a Cloudflare
   Turnstile token to its endpoint (/api/quote-request, the Worker in worker/quote.mjs), which checks
   everything again server-side. The thank-you shows only when the endpoint answers {"ok":true};
   anything else shows an error with the phone number. No <form>, and never a price. */
(function () {
  'use strict';
  var doc = document;
  var PHONE = '(628) 212-9947';
  function each(l, fn) { Array.prototype.forEach.call(l, fn); }
  var NAMES = { truck: 'Truck', intl: 'International', dray: 'Drayage', parcel: 'Parcel' };
  var ZIP = /^\d{5}$/;
  var EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
  var FAIL = "That didn't go through. Try again, or call " + PHONE + '.';
  var STATUS = {
    400: "Something in the form doesn't look right. Check the fields and try again, or call " + PHONE + '.',
    403: "We couldn't confirm the request came from a person. Try again, or call " + PHONE + '.',
    429: 'Too many requests from your network just now. Wait a minute and try again, or call ' + PHONE + '.',
  };

  each(doc.querySelectorAll('[data-rate-box]'), function (box) {
    var ENDPOINT = box.getAttribute('data-rate-endpoint') || '';
    var SITEKEY = box.getAttribute('data-rate-sitekey') || '';
    var mode = 'truck';
    var steps = box.querySelectorAll('[data-rate-step]');
    var err1 = box.querySelector('[data-rate-error]'), err2 = box.querySelector('[data-rate-error2]');
    var submit = box.querySelector('[data-rate-submit]');
    var SUBMIT_LABEL = submit.textContent;
    var slot = box.querySelector('[data-rate-turnstile]');
    var widget = null, token = '', waiters = [];

    function row() { return box.querySelector('[data-rate-step="1"] [data-for="' + mode + '"]'); }
    function f(name, scope) { var el = (scope || box).querySelector('[data-rate="' + name + '"]'); return el ? el.value.trim() : ''; }
    function fail(el, msg) { el.textContent = msg; el.hidden = false; }
    function show(n) {
      each(steps, function (s) { s.hidden = +s.getAttribute('data-rate-step') !== n; });
      if (n === 2) {
        startCheck();
        var first = box.querySelector('[data-rate-step="2"] .rate__field:not([hidden]) select, [data-rate-step="2"] .rate__field:not([hidden]) input');
        if (first) first.focus({ preventScroll: true });
      }
      if (n === 3) box.querySelector('[data-rate-step="3"]').focus({ preventScroll: true });
    }

    /* Turnstile: rendered when the details step first shows, so the token is fresh on send.
       Tokens are single use, so the widget resets after every attempt that didn't succeed. */
    function settle(t) { token = t || ''; var w = waiters; waiters = []; w.forEach(function (fn) { fn(); }); }
    function startCheck() {
      if (widget !== null || !slot || !window.turnstile || !SITEKEY) return;
      try {
        widget = window.turnstile.render(slot, {
          sitekey: SITEKEY, action: 'quote', appearance: 'interaction-only',
          callback: function (t) { settle(t); },
          'expired-callback': function () { token = ''; },
          'error-callback': function () { settle(''); return true; },
        });
      } catch (e) { widget = null; }
    }
    function resetCheck() { token = ''; if (widget !== null && window.turnstile) { try { window.turnstile.reset(widget); } catch (e) { /* ignore */ } } }
    function getToken(ms) {
      return new Promise(function (resolve) {
        startCheck();
        if (token) return resolve(token);
        var done = false;
        var t = setTimeout(function () { if (!done) { done = true; resolve(''); } }, ms);
        waiters.push(function () { if (!done) { done = true; clearTimeout(t); resolve(token); } });
      });
    }

    function applyMode() {
      each(box.querySelectorAll('.rate__tab'), function (t) { t.setAttribute('aria-selected', t.getAttribute('data-mode') === mode ? 'true' : 'false'); });
      each(box.querySelectorAll('[data-rate-step="1"] [data-for]'), function (r) { r.hidden = r.getAttribute('data-for') !== mode; });
      each(box.querySelectorAll('[data-fine]'), function (p) { p.hidden = p.getAttribute('data-fine') !== mode; });
      each(box.querySelectorAll('[data-rate-step="2"] [data-for]'), function (el) { el.hidden = el.getAttribute('data-for').split(' ').indexOf(mode) < 0; });
      var dl = box.querySelector('[data-label-date]');
      if (dl) dl.textContent = mode === 'dray' ? 'Container available' : mode === 'intl' ? 'Ready date' : mode === 'parcel' ? 'Ship date' : 'Pickup date';
      err1.hidden = true; err2.hidden = true;
    }
    each(box.querySelectorAll('.rate__tab'), function (t) { t.addEventListener('click', function () { mode = t.getAttribute('data-mode'); applyMode(); show(1); }); });
    each(box.querySelectorAll('[data-seg]'), function (b) {
      b.addEventListener('click', function () {
        var name = b.getAttribute('data-seg');
        each(box.querySelectorAll('[data-seg="' + name + '"]'), function (o) { o.classList.toggle('is-on', o === b); o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        var h = box.querySelector('[data-rate="' + name + '"]'); if (h) h.value = b.getAttribute('data-val');
      });
    });

    function valid1() {
      var r = row(), from = f('from', r), to = f('to', r);
      if (mode === 'truck') return ZIP.test(from) && ZIP.test(to) ? '' : 'Enter two 5-digit US ZIP codes.';
      if (mode === 'intl') return from.length > 1 && to.length > 1 ? '' : 'Tell us where it starts and where it is going: a port, an airport, a city or a ZIP.';
      if (mode === 'dray') return from && ZIP.test(to) ? '' : 'Pick the port or ramp and enter the 5-digit door ZIP.';
      if (mode === 'parcel') {
        if (from.length < 4 || to.length < 4 || !f('box', r)) return 'Both addresses, the weight and the box size, please.';
        return /^\d{1,6}(\.\d{1,2})?$/.test(f('weight', r).replace(/,/g, '')) && +f('weight', r).replace(/,/g, '') > 0 ? '' : 'Weight in pounds, like 12 or 12.5.';
      }
      return '';
    }
    function laneText() {
      var r = row(), from = f('from', r), to = f('to', r);
      var extra = mode === 'dray' ? ' · ' + f('container', r) : mode === 'parcel' ? ' · ' + f('weight', r) + ' lb · ' + f('box', r) : '';
      return NAMES[mode] + ' · ' + from + ' → ' + to + extra;
    }
    function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
    each(box.querySelectorAll('[data-rate-next]'), function (btn) {
      btn.addEventListener('click', function () {
        var msg = valid1(); if (msg) return fail(err1, msg);
        err1.hidden = true;
        box.querySelector('[data-rate-lane]').textContent = laneText();
        var d = box.querySelector('[data-rate="date"]'); if (d) d.min = today();
        show(2);
      });
    });
    box.querySelector('[data-rate-back]').addEventListener('click', function () { show(1); });
    box.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      var step = e.target.closest('[data-rate-step]').getAttribute('data-rate-step');
      (step === '1' ? row().querySelector('[data-rate-next]') : submit).click();
    });

    function valid2() {
      if (mode === 'truck' && !f('equipment')) return 'Pick the equipment.';
      if (mode === 'intl' && !f('intlmode')) return 'Ocean or air?';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f('date'))) return 'Pick a date.';
      if (f('date') < today()) return 'Pick a date from today on.';
      if (mode !== 'parcel' && !/^\d{1,6}$/.test(f('weight2').replace(/,/g, ''))) return 'Approximate weight in pounds, like 42,000.';
      if (!f('name')) return 'Your name.';
      if (!f('company')) return 'Your company.';
      if (!EMAIL.test(f('email'))) return 'A work email we can send the quote to.';
      return '';
    }
    function payload(tok) {
      var r = row();
      var p = { mode: mode, from: f('from', r), to: f('to', r), date: f('date'), commodity: f('commodity'), name: f('name'), company: f('company'),
        email: f('email'), phone: f('phone'), note: f('note'), website: f('website'), token: tok };
      if (mode === 'truck') { p.equipment = f('equipment'); p.weight = f('weight2'); }
      if (mode === 'intl') { p.intlmode = f('intlmode'); p.weight = f('weight2'); }
      if (mode === 'dray') { p.container = f('container', r); p.containerno = f('containerno'); p.weight = f('weight2'); }
      if (mode === 'parcel') { p.weight = f('weight', r); p.box = f('box', r); }
      return p;
    }
    function busy(on) { submit.disabled = on; submit.textContent = on ? 'Sending…' : SUBMIT_LABEL; }

    submit.addEventListener('click', function () {
      if (submit.disabled) return;
      var msg = valid2(); if (msg) return fail(err2, msg);
      err2.hidden = true;
      // No endpoint, no fetch or no Turnstile (blocked by an extension, say): an error, never a false "sent".
      if (!ENDPOINT || !window.fetch || !window.Promise) return fail(err2, FAIL);
      if (!window.turnstile) return fail(err2, "The spam check didn't load, so we can't send this from here. Refresh the page, or call " + PHONE + '.');
      busy(true);
      getToken(8000).then(function (tok) {
        if (!tok) { busy(false); resetCheck(); return fail(err2, 'Still checking this is a person. Give it a moment and press send again, or call ' + PHONE + '.'); }
        return fetch(ENDPOINT, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload(tok)) })
          .then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (j) {
              if (r.ok && j && j.ok === true) { show(3); return; }
              throw new Error(String(r.status));
            });
          })
          .catch(function (e) {
            busy(false); resetCheck();
            fail(err2, STATUS[+(e && e.message)] || FAIL);
          });
      });
    });
    applyMode();
  });
})();
