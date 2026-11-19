/* The product section: the map draws its lanes and places trucks along them, a cursor opens HL-2206;
   the deductions screen plays the approval of a drafted dispute. Everything loops while on screen and
   sits in its finished state under prefers-reduced-motion. All data on these screens is fictional. */
(function () {
  'use strict';
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function Scene(app) { this.app = app; this.cursor = app.querySelector('.app__cursor'); this.timers = []; this.playing = false; }
  Scene.prototype.q = function (s) { return this.app.querySelector(s); };
  Scene.prototype.show = function (s, on) { var el = this.q(s); if (el) el.hidden = on === false; };
  Scene.prototype.text = function (s, t) { var el = this.q(s); if (el) el.textContent = t; };
  Scene.prototype.cls = function (s, n, on) { var el = this.q(s); if (el) el.classList.toggle(n, on !== false); };
  Scene.prototype.moveTo = function (el, kx, ky) {
    if (typeof el === 'string') el = this.q(el); if (!el || !this.cursor) return;
    var a = this.app.getBoundingClientRect(), r = el.getBoundingClientRect();
    this.cursor.style.setProperty('--cx', (r.left - a.left + r.width * (kx == null ? .5 : kx)) + 'px');
    this.cursor.style.setProperty('--cy', (r.top - a.top + r.height * (ky == null ? .55 : ky)) + 'px');
    this.cursor.classList.add('is-show');
  };
  Scene.prototype.click = function (el) {
    if (typeof el === 'string') el = this.q(el); var self = this; if (!el || !this.cursor) return;
    el.classList.add('is-press'); this.cursor.classList.add('is-click');
    setTimeout(function () { el.classList.remove('is-press'); self.cursor.classList.remove('is-click'); }, 220);
  };
  Scene.prototype.hideCursor = function () { if (this.cursor) this.cursor.classList.remove('is-show'); };
  Scene.prototype.run = function () { var s = this; this.stop(); this.playing = true; this.beats.forEach(function (b) { s.timers.push(setTimeout(b[1], b[0])); }); };
  Scene.prototype.stop = function () { this.timers.forEach(clearTimeout); this.timers = []; this.playing = false; };
  Scene.prototype.watch = function () {
    var s = this; this.reset();
    if (reduce) { this.finish(); return; }
    if (!('IntersectionObserver' in window)) { this.run(); return; }
    new IntersectionObserver(function (es) { if (es[0].isIntersecting) { if (!s.playing) { s.reset(); s.run(); } } else s.stop(); }, { threshold: .35 }).observe(this.app);
  };

  /* clocks on every screen */
  Array.prototype.forEach.call(document.querySelectorAll('.app [data-clock]'), function (el) { el.textContent = 'Wed · 2:44 pm'; });

  /* ----- map: place trucks along their lanes (works for the desktop map and the phone map) ----- */
  Array.prototype.forEach.call(document.querySelectorAll('.vmap__svg'), function (svg) {
    Array.prototype.forEach.call(svg.querySelectorAll('[data-truck]'), function (g) {
      var lane = svg.querySelector('[data-lane="' + g.getAttribute('data-truck') + '"]'); if (!lane || !lane.getTotalLength) return;
      var k = parseFloat(g.getAttribute('data-prog')) || .5, L = lane.getTotalLength(), pt = lane.getPointAtLength(L * k), pt2 = lane.getPointAtLength(Math.min(L, L * k + 2));
      var ang = Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * 180 / Math.PI;
      g.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
      var rect = g.querySelector('rect'); if (rect) rect.setAttribute('transform', 'rotate(' + ang.toFixed(1) + ')');
      
    });
  });

  var mapApp = document.querySelector('[data-app="map"]');
  if (mapApp) {
    var M = new Scene(mapApp), laneSel = '[data-lane="HL-2206"]';
    M.reset = function () {
      M.hideCursor(); M.show('[data-panel]', false); M.cls('[data-vmap]', 'is-drawn', false); M.cls(laneSel, 'is-sel', false);
      void M.q('[data-vmap]').offsetWidth;   /* restart the draw-in */
    };
    M.finish = function () { M.cls('[data-vmap]', 'is-drawn'); M.cls(laneSel, 'is-sel'); M.show('[data-panel]'); };
    M.beats = [
      [100, function () { M.cls('[data-vmap]', 'is-drawn'); }],
      [2200, function () { var lane = M.q(laneSel); if (!lane) return; var L = lane.getTotalLength(), p = lane.getPointAtLength(L * .5), a = mapApp.getBoundingClientRect(), r = M.q('.vmap__svg').getBoundingClientRect(), sx = Math.min(r.width / 975, r.height / 610), ox = (r.width - 975 * sx) / 2, oy = (r.height - 610 * sx) / 2;
        M.cursor.style.setProperty('--cx', (r.left - a.left + ox + p.x * sx) + 'px'); M.cursor.style.setProperty('--cy', (r.top - a.top + oy + p.y * sx) + 'px'); M.cursor.classList.add('is-show'); }],
      [3100, function () { M.click(M.q(laneSel)); M.cls(laneSel, 'is-sel'); }],
      [3300, function () { M.show('[data-panel]'); }],
      [4200, function () { M.hideCursor(); }],
      [12000, function () { M.hideCursor(); M.show('[data-panel]', false); M.cls(laneSel, 'is-sel', false); }],
      [12600, function () { M.run(); }]
    ];
    M.watch();
  }

  /* ----- shipments list: a hover that settles on HL-2206 ----- */
  var shipApp = document.querySelector('[data-app="ship"]');
  if (shipApp) {
    var S = new Scene(shipApp), rows = shipApp.querySelectorAll('tbody tr');
    S.reset = function () { S.hideCursor(); Array.prototype.forEach.call(rows, function (r) { r.classList.remove('is-sel', 'is-hover'); }); };
    S.finish = function () { rows[0].classList.add('is-sel'); };
    S.beats = [
      [500, function () { S.moveTo(rows[2].children[1], .25); rows[2].classList.add('is-hover'); }],
      [1400, function () { rows[2].classList.remove('is-hover'); rows[1].classList.add('is-hover'); S.moveTo(rows[1].children[1], .3); }],
      [2200, function () { rows[1].classList.remove('is-hover'); rows[0].classList.add('is-hover'); S.moveTo(rows[0].children[1], .32); }],
      [3000, function () { S.click(rows[0]); rows[0].classList.remove('is-hover'); rows[0].classList.add('is-sel'); }],
      [3800, function () { S.hideCursor(); }],
      [9000, function () { S.reset(); }],
      [9500, function () { S.run(); }]
    ];
    S.watch();
  }

  /* ----- deductions: approve the drafted dispute, watch it go to In dispute, then Recovered ----- */
  var dedApp = document.querySelector('[data-app="ded"]');
  if (dedApp) {
    var D = new Scene(dedApp), row = '[data-ded="PO 4466"]';
    function st(label, kind, why) { var el = D.q(row + ' [data-ded-st]'); el.textContent = label; el.className = 'st st--' + kind; D.text(row + ' [data-ded-why]', why); }
    D.reset = function () { D.hideCursor(); st('Disputable', 'go', 'Signed POD shows full quantity'); D.show('[data-packet]'); D.cls('[data-packet]', 'is-sent', false); D.text('[data-btn-approve]', 'Approve and send'); D.cls('[data-btn-approve]', 'is-done', false); D.show('[data-toast]', false); D.text('[data-recovered]', '$860'); D.cls(row, 'is-flash', false); };
    D.finish = function () { st('Recovered', 'ok', 'Credited Nov 14'); D.cls('[data-packet]', 'is-sent'); D.text('[data-btn-approve]', 'Sent ✓'); D.cls('[data-btn-approve]', 'is-done'); D.text('[data-recovered]', '$2,100'); };
    D.beats = [
      [800, function () { D.moveTo('[data-btn-approve]'); }],
      [1700, function () { D.click('[data-btn-approve]'); D.text('[data-btn-approve]', 'Sending…'); }],
      [2500, function () { D.text('[data-btn-approve]', 'Sent ✓'); D.cls('[data-btn-approve]', 'is-done'); D.cls('[data-packet]', 'is-sent'); st('In dispute', 'go', 'Filed Nov 3'); D.show('[data-toast]'); D.hideCursor(); }],
      [5200, function () { D.show('[data-toast]', false); }],
      [6000, function () { st('Recovered', 'ok', 'Credited Nov 14'); D.cls(row, 'is-flash'); D.text('[data-recovered]', '$2,100'); }],
      [11500, function () { D.reset(); }],
      [12000, function () { D.run(); }]
    ];
    D.watch();
  }

  /* ----- the Tuesday note: lines arrive one at a time, the cursor approves both, the day closes ----- */
  var note = document.querySelector('[data-onote]');
  if (note) {
    var N = new Scene(note), steps = note.querySelectorAll('.onote__step');
    function at(n) { Array.prototype.forEach.call(steps, function (el) { el.classList.toggle('is-in', +el.getAttribute('data-at') <= n); }); }
    N.reset = function () { N.hideCursor(); at(0); N.text('[data-onote-approve]', 'Approve both'); N.cls('[data-onote-approve]', 'is-done', false); };
    N.finish = function () { at(6); N.text('[data-onote-approve]', 'Approved ✓'); N.cls('[data-onote-approve]', 'is-done'); };
    N.beats = [
      [200, function () { at(1); }], [1100, function () { at(2); }], [2300, function () { at(3); }], [3400, function () { at(4); }], [4400, function () { at(5); }],
      [5200, function () { N.moveTo('[data-onote-approve]'); }],
      [6000, function () { N.click('[data-onote-approve]'); N.text('[data-onote-approve]', 'Approved ✓'); N.cls('[data-onote-approve]', 'is-done'); }],
      [6600, function () { N.hideCursor(); at(6); }],
      [12500, function () { N.reset(); }], [13000, function () { N.run(); }]
    ];
    N.watch();
  }

  /* the film: silent, looping, plays only while on screen (autoplay can be blocked until the user scrolls) */
  var vsl = document.getElementById('vsl');
  if (vsl && 'IntersectionObserver' in window) {
    vsl.muted = true; vsl.loop = true;
    new IntersectionObserver(function (es) { if (es[0].isIntersecting) { var p = vsl.play(); if (p && p.catch) p.catch(function () {}); } else vsl.pause(); }, { threshold: .25 }).observe(vsl);
  }
})();
