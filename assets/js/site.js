/* Valence: shared page behavior. Plain ES5 so it runs on older Safari and Android browsers.
   Everything here is enhancement: every page reads fully without JavaScript.
   Only one thing on the site moves on its own: the background video, and only while it is on screen. */
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
    window.addEventListener('resize', function () { if (window.innerWidth > 1023) setMenu(false); });
  }

  /* ── background video: muted, plays only while on screen, never for reduced motion ── */
  each(doc.querySelectorAll('video'), function (v) {
    v.muted = true;
    if (reduce) { v.removeAttribute('autoplay'); try { v.pause(); } catch (err) {} return; }
    var play = function () {
      var p = v.play();
      if (p && typeof p.catch === 'function') p.catch(function () { /* autoplay refused: the poster stays */ });
    };
    if (!('IntersectionObserver' in window)) { play(); return; }
    v.removeAttribute('autoplay');
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) play(); else v.pause(); });
    }).observe(v);
  });
})();
