/* The network hero: shipments move along their lanes; clicking (or tapping) a lane opens a card and
   "Quote this lane" opens the quote page (/quote/) with the lane's ZIPs and equipment. Everything on the
   map is an illustration.
   Pick-a-lane (the card rendered by @pick in scripts/build.mjs) posts to /api/quote-request as kind
   "map" with a Cloudflare Turnstile token, like the quote box; "done" shows only on {"ok":true}. */
(function () {
  'use strict';
  var map = document.querySelector('[data-net]'); if (!map) return;
  var svg = map.querySelector('.net__svg'), card = map.querySelector('[data-net-card]');
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var lanes = Array.prototype.slice.call(svg.querySelectorAll('[data-net-lane]'));
  var dots = Array.prototype.slice.call(svg.querySelectorAll('[data-net-dot]')).map(function (c) {
    var lane = svg.querySelector('[data-net-lane="' + c.getAttribute('data-net-dot') + '"]');
    return { el: c, lane: lane, L: lane.getTotalLength(), speed: parseFloat(c.getAttribute('data-speed')), phase: parseFloat(c.getAttribute('data-phase')) };
  });
  var LABEL = { ontime: ['Moving · on time', 'st--go'], risk: ['Moving · we are watching it', 'st--warn'], late: ['Running late · receiver already called', 'st--risk'], delivered: ['Delivered · POD on file', 'st--ok'] };

  /* draw the lanes in once, then keep the dots moving while the map is on screen */
  var on = false, t0 = null;
  function place(d, k) { var p = d.lane.getPointAtLength(d.L * k); d.el.setAttribute('cx', p.x.toFixed(1)); d.el.setAttribute('cy', p.y.toFixed(1)); }
  function frame(ts) {
    if (!t0) t0 = ts; var t = (ts - t0) / 1000;
    dots.forEach(function (d) { var k = (d.phase + t / (14 / d.speed)) % 1; place(d, k); });
    if (on) requestAnimationFrame(frame);
  }
  dots.forEach(function (d) { place(d, d.phase); });
  requestAnimationFrame(function () { map.classList.add('is-drawn'); });
  if (!reduce) {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { var was = on; on = es[0].isIntersecting; if (on && !was) requestAnimationFrame(frame); }, { threshold: .05 }).observe(map);
    } else { on = true; requestAnimationFrame(frame); }
  }

  /* lane cards */
  var sel = null;
  function open(lane, x, y) {
    if (sel) sel.classList.remove('is-sel'); sel = lane; lane.classList.add('is-sel');
    var st = lane.getAttribute('data-st'), lab = LABEL[st] || LABEL.ontime;
    card.querySelector('[data-net-lane-name]').textContent = lane.getAttribute('data-from') + ' → ' + lane.getAttribute('data-to');
    var s = card.querySelector('[data-net-st]'); s.textContent = lab[0]; s.className = 'st ' + lab[1];
    card.querySelector('[data-net-mode]').textContent = lane.getAttribute('data-mode');
    card.querySelector('[data-net-eq]').textContent = lane.getAttribute('data-eq');
    card.hidden = false;
    var r = map.getBoundingClientRect(), cw = card.offsetWidth, ch = card.offsetHeight;
    var left = Math.min(Math.max(12, x - r.left + 14), r.width - cw - 12), top = Math.min(Math.max(12, y - r.top - ch - 14), r.height - ch - 12);
    card.style.left = left + 'px'; card.style.top = top + 'px';
  }
  function close() { card.hidden = true; if (sel) sel.classList.remove('is-sel'); sel = null; }
  lanes.forEach(function (lane) {
    lane.addEventListener('click', function (e) { e.stopPropagation(); open(lane, e.clientX, e.clientY); });
    lane.addEventListener('mouseenter', function () { lane.classList.add('is-hover'); });
    lane.addEventListener('mouseleave', function () { lane.classList.remove('is-hover'); });
  });
  map.addEventListener('click', function (e) { if (!card.contains(e.target) && !(pc && pc.contains(e.target))) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  card.querySelector('[data-net-quote]').addEventListener('click', function () {
    if (!sel) return;
    /* the lanes are all truck lanes (Truckload or LTL): the quote page, with both ZIPs and the lane's equipment */
    var e = encodeURIComponent, eq = sel.getAttribute('data-mode') === 'LTL' ? 'LTL' : 'Full truckload · ' + String(sel.getAttribute('data-eq') || '').toLowerCase();
    location.href = '/quote/?from=' + e(sel.getAttribute('data-from-zip') || '') + '&to=' + e(sel.getAttribute('data-to-zip') || '') + '&equipment=' + e(eq);
  });

  /* ----- pick a lane: click a city or a state for FROM, another for TO, then send it ----- */
  var pc = map.querySelector('[data-pick-card]');
  var PHONE = '(628) 212-9947', FAIL = "That didn't go through. Try again, or call " + PHONE + '.';
  var STATUS = {
    400: "Something in the form doesn't look right. Check it and try again, or call " + PHONE + '.',
    403: "We couldn't confirm the request came from a person. Try again, or call " + PHONE + '.',
    429: 'Too many requests from your network just now. Wait a minute and try again, or call ' + PHONE + '.',
  };
  var EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
  var ENDPOINT = pc ? pc.getAttribute('data-pick-endpoint') || '' : '', SITEKEY = pc ? pc.getAttribute('data-pick-sitekey') || '' : '';
  var pick = { a: null, b: null }, pinA = svg.querySelector('[data-pin="a"]'), pinB = svg.querySelector('[data-pin="b"]'), pickLane = svg.querySelector('[data-pick-lane]');
  function q(sel) { return pc.querySelector(sel); }
  function placeOf(el) {
    if (el.hasAttribute('data-city')) return { id: 'city:' + el.getAttribute('data-city'), name: el.getAttribute('data-city'), zip: el.getAttribute('data-zip'), x: +el.getAttribute('data-x'), y: +el.getAttribute('data-y'), kind: 'city' };
    return { id: 'state:' + el.getAttribute('data-state'), name: el.getAttribute('data-state') + (el.getAttribute('data-abbr') ? ' (' + el.getAttribute('data-abbr') + ')' : ''), zip: '', x: +el.getAttribute('data-cx'), y: +el.getAttribute('data-cy'), kind: 'state', el: el };
  }

  /* Turnstile, as in the quote box: rendered when the form first shows, reset after every attempt
     that didn't succeed (tokens are single use). */
  var slot = pc && q('[data-pick-turnstile]'), widget = null, token = '', waiters = [];
  function settle(tk) { token = tk || ''; var w = waiters; waiters = []; w.forEach(function (fn) { fn(); }); }
  function startCheck() {
    if (widget !== null || !slot || !window.turnstile || !SITEKEY) return;
    try {
      widget = window.turnstile.render(slot, {
        sitekey: SITEKEY, action: 'quote', appearance: 'interaction-only',
        callback: function (tk) { settle(tk); },
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
      var over = false, tm = setTimeout(function () { if (!over) { over = true; resolve(''); } }, ms);
      waiters.push(function () { if (!over) { over = true; clearTimeout(tm); resolve(token); } });
    });
  }

  function pin(g, p) { g.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ')'); g.hidden = false; }
  function render() {
    var has = pick.a || pick.b;
    q('[data-pick-hint]').textContent = !pick.a ? 'Click where it ships from, then where it goes. A city or a whole state.' : !pick.b ? 'Now click where it goes.' : 'Where should we email your quote?';
    q('[data-pick-lane-text]').hidden = !pick.a; q('[data-pick-from]').textContent = pick.a ? pick.a.name : ''; q('[data-pick-to]').textContent = pick.b ? pick.b.name : '…';
    q('[data-pick-form]').hidden = !(pick.a && pick.b); q('[data-pick-reset]').hidden = !has; q('[data-pick-done]').hidden = true; q('[data-pick-error]').hidden = true;
    if (pick.a && pick.b) startCheck();
    pc.classList.toggle('is-active', !!has);
    Array.prototype.forEach.call(svg.querySelectorAll('.net__state.is-pick'), function (e) { e.classList.remove('is-pick'); });
    if (pick.a && pick.a.el) pick.a.el.classList.add('is-pick'); if (pick.b && pick.b.el) pick.b.el.classList.add('is-pick');
    if (pick.a) pin(pinA, pick.a); else pinA.hidden = true;
    if (pick.b) pin(pinB, pick.b); else pinB.hidden = true;
    if (pick.a && pick.b) {
      var x1 = pick.a.x, y1 = pick.a.y, x2 = pick.b.x, y2 = pick.b.y, dx = x2 - x1, dy = y2 - y1; if (dx < 0) { dx = -dx; dy = -dy; }
      pickLane.setAttribute('d', 'M' + x1 + ' ' + y1 + ' Q' + ((x1 + x2) / 2 + dy * .2).toFixed(1) + ' ' + ((y1 + y2) / 2 - dx * .2).toFixed(1) + ' ' + x2 + ' ' + y2);
      pickLane.classList.add('is-on'); close();
    } else { pickLane.setAttribute('d', ''); pickLane.classList.remove('is-on'); }
  }
  function choose(el) {
    close(); touched = true; clearTimeout(timer);
    var p = placeOf(el);
    if (!pick.a) pick.a = p; else if (!pick.b) { if (p.id === pick.a.id) return; pick.b = p; } else { pick.a = p; pick.b = null; }
    render();
  }
  if (pc) {
    Array.prototype.forEach.call(svg.querySelectorAll('.net__city'), function (c) { c.addEventListener('click', function (e) { e.stopPropagation(); choose(c); }); });
    Array.prototype.forEach.call(svg.querySelectorAll('.net__state'), function (st) { st.addEventListener('click', function (e) { e.stopPropagation(); choose(st); }); });
    var container = '40 ft';
    var applyPickMode = function () { var m = q('[data-pick-mode]').value; Array.prototype.forEach.call(pc.querySelectorAll('[data-pick-extra]'), function (el) { el.hidden = el.getAttribute('data-pick-extra') !== m; }); q('[data-pick-error]').hidden = true; };
    q('[data-pick-mode]').addEventListener('change', applyPickMode); applyPickMode();
    Array.prototype.forEach.call(pc.querySelectorAll('[data-pick-seg]'), function (b) { b.addEventListener('click', function () { container = b.getAttribute('data-pick-seg'); Array.prototype.forEach.call(pc.querySelectorAll('[data-pick-seg]'), function (o) { o.classList.toggle('is-on', o === b); o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); }); }); });
    q('[data-pick-reset]').addEventListener('click', function () { pick = { a: null, b: null }; resetCheck(); render(); });
    /* "Add items and options first": the quote page, with the picks, the city ZIPs and the truck equipment. */
    q('[data-pick-details]').addEventListener('click', function () {
      if (!pick.a || !pick.b) return;
      var e = encodeURIComponent, eq = q('[data-pick-mode]').value === 'truck' ? q('[data-pick-equipment]').value : '';
      location.href = '/quote/?from=' + e(pick.a.zip || '') + '&to=' + e(pick.b.zip || '') + '&fromPlace=' + e(pick.a.id) + '&toPlace=' + e(pick.b.id) + (eq ? '&equipment=' + e(eq) : '');
    });
    var send = q('[data-pick-send]'), SEND_LABEL = send.textContent;
    function busy(on) { send.disabled = on; send.textContent = on ? 'Sending…' : SEND_LABEL; }
    function fail(msg) { var err = q('[data-pick-error]'); err.textContent = msg; err.hidden = false; }
    function done() {
      q('[data-pick-form]').hidden = true; q('[data-pick-hint]').textContent = 'Sent.';
      var d = q('[data-pick-done]'); d.hidden = false; d.focus({ preventScroll: true });
    }
    send.addEventListener('click', function () {
      if (send.disabled || !pick.a || !pick.b) return;
      var v = function (s) { var el = q(s); return el ? el.value.trim() : ''; };
      var m = v('[data-pick-mode]'), email = v('[data-pick-email]');
      var need = m === 'dray' && !v('[data-pick-port]') ? 'Pick the port or ramp.' : m === 'intl' && !v('[data-pick-intl]') ? 'Ocean or air?' : m === 'parcel' && !(v('[data-pick-weight]') && v('[data-pick-box]')) ? 'Weight and box size, please.' : '';
      if (!need && m === 'parcel' && !/^\d{1,6}(\.\d{1,2})?$/.test(v('[data-pick-weight]').replace(/,/g, ''))) need = 'Weight in pounds, like 12 or 12.5.';
      if (need) return fail(need);
      if (!EMAIL.test(email)) return fail('A work email for your quote.');
      q('[data-pick-error]').hidden = true;
      /* no endpoint, no fetch or no Turnstile: an error, never a false "sent" */
      if (!ENDPOINT || !window.fetch || !window.Promise) return fail(FAIL);
      if (!window.turnstile) return fail("The spam check didn't load, so we can't send this from here. Refresh the page, or call " + PHONE + '.');
      var body = { kind: 'map', mode: m, from: pick.a.id, to: pick.b.id, email: email, website: v('[data-pick-website]') };
      if (m === 'truck') body.equipment = v('[data-pick-equipment]');
      if (m === 'dray') { body.port = v('[data-pick-port]'); body.container = container; }
      if (m === 'intl') body.intlmode = v('[data-pick-intl]');
      if (m === 'parcel') { body.weight = v('[data-pick-weight]'); body.box = v('[data-pick-box]'); }
      busy(true);
      getToken(8000).then(function (tok) {
        if (!tok) { busy(false); resetCheck(); return fail('Still checking this is a person. Give it a moment and press send again, or call ' + PHONE + '.'); }
        body.token = tok;
        return fetch(ENDPOINT, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) })
          .then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (j) {
              if (r.ok && j && j.ok === true) { busy(false); done(); return; }
              throw new Error(String(r.status));
            });
          })
          .catch(function (e) { busy(false); resetCheck(); fail(STATUS[+(e && e.message)] || FAIL); });
      });
    });
    render();
  }

  /* a lane opens on its own every few seconds until the visitor touches the map */
  var touched = false, timer;
  if (!reduce) {
    var i = 0;
    map.addEventListener('pointerdown', function () { touched = true; clearTimeout(timer); }, { once: true });
    function auto() {
      if (touched) return;
      var lane = lanes[(i * 7) % lanes.length]; i++;
      if (on) { var p = lane.getPointAtLength(lane.getTotalLength() * .5), r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, k = Math.min(r.width / vb.width, r.height / vb.height), ox = (r.width - vb.width * k) / 2, oy = (r.height - vb.height * k) / 2;
        open(lane, r.left + ox + p.x * k, r.top + oy + p.y * k); }
      timer = setTimeout(auto, 5200);
    }
    timer = setTimeout(auto, 2600);
  }
})();
