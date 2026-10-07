/* Valence: shared page behavior. Plain ES5 so it runs on older Safari and Android browsers.
   Everything here is enhancement: every page reads fully without JavaScript. */
(function () {
  'use strict';

  var doc = document;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  /* ── mobile menu ── */
  var toggle = doc.querySelector('.menu-toggle');
  var menu = doc.getElementById('site-menu');
  function setMenu(open) {
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.classList.toggle('is-open', open);
  }
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    menu.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== menu) { if (t.tagName === 'A') { setMenu(false); return; } t = t.parentNode; }
    });
    doc.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && menu.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 760) setMenu(false); });
  }

  /* ── logo mark: freeze the orbiting dot for reduced motion ── */
  if (reduce) {
    each(doc.querySelectorAll('svg.mark'), function (svg) {
      try { svg.pauseAnimations(); svg.setCurrentTime(0); } catch (err) { /* SMIL unsupported: dot sits still anyway */ }
    });
  }

  /* ── background video: muted autoplay, with a kick for iOS Safari ── */
  each(doc.querySelectorAll('video'), function (v) {
    v.muted = true;
    if (reduce) { v.removeAttribute('autoplay'); try { v.pause(); } catch (err) {} return; }
    var p = v.play();
    if (p && typeof p.catch === 'function') p.catch(function () { /* autoplay refused: the poster stays */ });
  });

  /* ── splash (home only, first visit per session) ── */
  var splash = doc.getElementById('splash');
  if (splash) {
    var seen = false;
    try { seen = sessionStorage.getItem('valence-splash') === '1'; } catch (err) {}
    if (!seen && !reduce && !location.hash) {
      splash.hidden = false;
      doc.body.classList.add('is-locked');
      try { splash.focus({ preventScroll: true }); } catch (err) { splash.focus(); }
      var done = false;
      var events = ['wheel', 'touchstart', 'touchmove', 'click', 'keydown', 'scroll'];
      var dismiss = function () {
        if (done) return;
        done = true;
        try { sessionStorage.setItem('valence-splash', '1'); } catch (err) {}
        events.forEach(function (ev) { window.removeEventListener(ev, dismiss, true); });
        splash.classList.add('is-fading');
        setTimeout(function () {
          splash.hidden = true;
          doc.body.classList.remove('is-locked');
        }, 700);
      };
      events.forEach(function (ev) { window.addEventListener(ev, dismiss, { capture: true, passive: true }); });
    }
  }
})();
