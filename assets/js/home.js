/* Valence home: hero card (split or ticker) and the "How it feels" portal loop.
   The HTML already shows each animation's final state, so with JavaScript off or
   reduced motion on, the page reads correctly and nothing moves. */
(function () {
  'use strict';

  var doc = document;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var $ = function (sel, root) { return (root || doc).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); };
  var setText = function (el, text) { if (el && el.textContent !== text) el.textContent = text; };

  var G = '#98AE9C', A = '#D9A066', R = '#D47A55', M = '#8C877A', OFF = '#4A473D';

  /* ───────── hero card ───────── */
  var variant = /[?&]hero=ticker\b/.test(location.search) ? 'ticker' : 'split';
  var split = doc.getElementById('hero-split');
  var ticker = doc.getElementById('hero-ticker');
  if (variant === 'ticker' && split && ticker) { split.hidden = true; ticker.hidden = false; }

  var mails = split ? $$('.mail', split) : [];
  var mailCount = split ? $('[data-mailcount]', split) : null;
  var steps = split ? $$('.steps li', split) : [];
  var portalFoot = split ? $('[data-portalfoot]', split) : null;
  var stepTimes = ['Mon', 'Tue 9:12', 'Tue 9:30', 'Thu 7:14', 'Thu 7:20'];

  var feed = [
    [['Run confirmed', G], ['Pickup Tue', G], ['In transit', G], ['POD filed', G]],
    [['Booked', G], ['Appt set', G], ['At dock', A], ['POD filed', G]],
    [['Vendor slip +3d', R], ['$4.2k at risk', R], ['Fix approved', G], ['Rebooked', G]],
    [['Variance −18', A], ['Investigating', A], ['Reconciled', G], ['Reconciled', G]],
    [['Pending', M], ['Pending', M], ['Pending', M], ['Booked', G]]
  ];
  var feedRows = ticker ? $$('.feed li', ticker) : [];
  var tickerFoot = ticker ? $('[data-tickerfoot]', ticker) : null;
  var footLines = ['Every load, PO and document. Live.', 'Problems arrive as dollars at risk, not a red dot.', 'You approve. We execute.', 'Paperwork the day it delivers.', 'Illustrative. Not real client data.'];

  function heroTick(t) {
    if (variant === 'split') {
      mails.forEach(function (m, i) { m.classList.toggle('is-off-x', t < i); });
      setText(mailCount, Math.min(t + 1, 7) + ' new');
      var stage = Math.floor(t / 1.6);
      steps.forEach(function (li, i) {
        var done = stage > i, now = stage === i;
        li.querySelector('.dot').style.setProperty('--dot', done ? G : (now ? A : OFF));
        setText(li.querySelector('time'), done ? stepTimes[i] : (now ? 'now' : ''));
      });
      setText(portalFoot, t >= 7 ? 'Nothing to chase.' : '');
    } else {
      feedRows.forEach(function (li, i) {
        li.classList.toggle('is-off-y', t < i);
        var st = feed[i][Math.max(0, Math.min(3, t - i))];
        var status = li.querySelector('.feed__status');
        status.style.setProperty('--dot', st[1]);
        setText(status.lastElementChild, st[0]);
      });
      setText(tickerFoot, footLines[t % 5]);
    }
  }

  /* ───────── how it feels ───────── */
  var portal = doc.getElementById('portal');
  var promises = $$('#promises li');
  var MSG = "Stockton runs dry before the Sprouts review. I'd pull 2 pallets from the Reno 3PL today and send them LTL. Keeps you at 3 weeks of supply through the review.";
  var p = portal ? {
    steps: $$('[data-step]', portal),
    dots: $$('.progress i', portal),
    flag: $('[data-flag]', portal), flagDot: $('[data-flagdot]', portal), flagText: $('[data-flagtext]', portal),
    supply: $('[data-supply]', portal), docs: $('[data-docs]', portal), msg: $('[data-msg]', portal),
    approve: $('[data-approve]', portal), approveText: $('[data-approvetext]', portal),
    hold: $('[data-hold]', portal), cursor: $('[data-cursor]', portal), team: $('[data-team]', portal)
  } : null;

  function portalRender(step, typed, pressed) {
    if (!p) return;
    var done = step === 5;
    p.steps.forEach(function (el) { el.classList.toggle('is-off-y', step < +el.getAttribute('data-step')); });
    promises.forEach(function (li, i) {
      var n = i + 1;
      li.classList.toggle('is-active', step === n);
      li.classList.toggle('is-pending', step < n);
    });
    p.dots.forEach(function (d, i) { d.classList.toggle('is-on', i <= step); });
    p.flag.classList.toggle('is-resolved', done);
    p.flagDot.style.setProperty('--dot', done ? '#4F6B55' : '#B8552F');
    setText(p.flagText, done ? 'Resolved 9:48 am' : 'Flagged 9:14 am');
    p.supply.className = done ? 'ok' : 'risk';
    setText(p.supply, done ? '3.0 wks supply' : '1.4 wks supply');
    setText(p.docs, done ? 'PO · BOL · Appt' : 'PO · BOL pending');
    setText(p.msg, step === 2 ? MSG.slice(0, Math.round(MSG.length * typed)) : (step > 2 ? MSG : ''));
    var approved = pressed || done;
    p.approve.classList.toggle('is-done', approved);
    p.approve.classList.toggle('is-pressed', pressed && !done);
    setText(p.approveText, approved ? 'Approved ✓' : 'Approve the move');
    p.hold.classList.toggle('is-dim', approved);
    p.cursor.classList.toggle('is-in', step === 4 && !pressed);
    p.cursor.classList.toggle('is-click', step === 4 && pressed);
    p.team.classList.toggle('is-off', step < 5);
  }

  /* ───────── timers, paused while the tab is hidden ───────── */
  var SEQ = [[0, 1200], [1, 2200], [2, 4200], [3, 2600], [4, 1800], [5, 3200]];
  var seqIndex = 0, tick = 0, timers = [];
  var later = function (fn, ms) { timers.push(setTimeout(fn, ms)); };

  function runPortal() {
    var step = SEQ[seqIndex][0], dur = SEQ[seqIndex][1];
    portalRender(step, 0, false);
    if (step === 2) {
      var typed = 0;
      var typer = setInterval(function () {
        typed = Math.min(1, typed + 0.03);
        portalRender(2, typed, false);
        if (typed >= 1) clearInterval(typer);
      }, 90);
      timers.push(typer);
    }
    if (step === 4) later(function () { portalRender(4, 0, true); }, 1200);
    seqIndex = (seqIndex + 1) % SEQ.length;
    later(runPortal, dur);
  }

  var heroTimer = null;
  function start() {
    heroTick(tick);
    heroTimer = setInterval(function () { tick = (tick + 1) % 9; heroTick(tick); }, 1600);
    runPortal();
  }
  function stop() {
    clearInterval(heroTimer);
    timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
    timers = [];
  }
  doc.addEventListener('visibilitychange', function () { if (doc.hidden) stop(); else start(); });
  start();
})();
