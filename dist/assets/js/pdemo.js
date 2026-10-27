/* Valence home: the portal card plays itself. One problem, five beats, on a loop while it is on screen:
   flagged, recommended, priced, approved (a cursor presses the button), booked. With reduced motion
   it simply shows the finished state. */
(function () {
  'use strict';
  var card = document.getElementById('pdemo'); if (!card) return;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var steps = card.querySelectorAll('.pstep'), rail = document.querySelectorAll('.pdemo__rail li');
  var clock = card.querySelector('[data-pdemo-clock]'), pill = card.querySelector('[data-pdemo-pill]'), dot = card.querySelector('[data-pdemo-dot]');
  var pickup = card.querySelector('[data-pdemo-pickup]'), docs = card.querySelector('[data-pdemo-docs]');
  var approve = card.querySelector('[data-pdemo-approve]'), hold = card.querySelector('[data-pdemo-hold]'), cursor = card.querySelector('.pdemo__cursor');

  function set(n) {
    steps.forEach(function (el) { el.classList.toggle('is-in', +el.getAttribute('data-at') <= n); });
    rail.forEach(function (li) { var k = +li.getAttribute('data-n'); li.classList.toggle('is-on', k === n); li.classList.toggle('is-done', k < n); });
  }
  function finish() {
    approve.textContent = 'Approved ✓'; approve.classList.add('is-done'); hold.classList.add('is-dim');
    pill.textContent = 'Resolved 9:48 am'; dot.style.setProperty('--dot', 'var(--muted)');
    pickup.textContent = 'Tue, 6 pallets'; docs.textContent = 'PO · BOL · Appt'; clock.textContent = '9:48 am';
  }
  function reset() {
    set(0);
    approve.textContent = 'Approve'; approve.classList.remove('is-done', 'is-press'); hold.classList.remove('is-dim');
    pill.textContent = 'Flagged 9:12 am'; dot.style.setProperty('--dot', 'var(--amber)');
    pickup.textContent = 'Not booked'; docs.textContent = 'PO'; clock.textContent = '9:12 am';
    cursor.classList.remove('is-show');
  }
  function cursorTo(el, k) {           /* put the cursor's tip on an element, k of the way across it */
    var x = el.offsetLeft + el.offsetWidth * k, y = el.offsetTop + el.offsetHeight * .62;
    cursor.style.setProperty('--cx', x + 'px'); cursor.style.setProperty('--cy', y + 'px');
  }
  if (reduce) { set(5); finish(); return; }

  /* the beats, in ms from the start of a run */
  var beats = [
    [0, function () { set(1); }],
    [1800, function () { set(2); clock.textContent = '9:31 am'; }],
    [3500, function () { set(3); clock.textContent = '9:33 am'; }],
    [5900, function () { cursorTo(approve, 1.25); cursor.style.setProperty('--cy', (approve.offsetTop + 70) + 'px'); cursor.classList.add('is-show'); }],
    [6000, function () { cursorTo(approve, .6); }],
    [6900, function () { approve.classList.add('is-press'); }],
    [7050, function () { approve.classList.remove('is-press'); set(4); approve.textContent = 'Approved ✓'; approve.classList.add('is-done'); hold.classList.add('is-dim'); clock.textContent = '9:46 am'; }],
    [7700, function () { cursor.classList.remove('is-show'); }],
    [8300, function () { set(5); finish(); }],
    [13500, function () { reset(); }],
    [14100, function () { run(); }]
  ];
  var timers = [], playing = false;
  function run() { stop(); playing = true; beats.forEach(function (b) { timers.push(setTimeout(b[1], b[0])); }); }
  function stop() { timers.forEach(clearTimeout); timers = []; playing = false; }
  reset();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { if (!playing) { reset(); run(); } }
      else { stop(); }
    }, { threshold: .35 }).observe(card);
  } else run();
})();
