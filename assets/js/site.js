/* Valence: shared page behavior. Plain ES5 so it runs on older Safari and Android browsers.
   Everything here is enhancement: every page reads fully without JavaScript.
   Blocks marked data-reveal rise in as they scroll into view; a background video plays only while on screen. */
(function () {
  'use strict';

  var doc = document;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  /* ── where a page lands: the top, or the section its link names ──
     Browsers restore an old scroll position on reload and back, and some embedded viewers do it on every
     page change, which on a long page reads as a random spot. Land deliberately instead, once the layout
     has settled, unless the visitor has already started scrolling. A page restored from the back/forward
     cache keeps its place. */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  var touched = false;
  each(['wheel', 'touchstart', 'keydown', 'mousedown'], function (ev) {
    window.addEventListener(ev, function () { touched = true; }, { passive: true, once: true });
  });
  function land() {
    if (touched) return;
    var id = '';
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (err) {}
    var target = id && doc.getElementById(id);
    if (target) target.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }
  if (doc.readyState === 'complete') land(); else window.addEventListener('load', land);
  window.addEventListener('pageshow', function (e) { if (!e.persisted) land(); });

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

  /* ── reveal on scroll: blocks marked data-reveal rise in as they arrive, once.
        Reduced motion, or no IntersectionObserver, shows everything at once. ── */
  var reveal = doc.querySelectorAll('[data-reveal]');
  if (reveal.length) {
    if (reduce || !('IntersectionObserver' in window)) {
      each(reveal, function (el) { el.classList.add('is-in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          /* in view, or already scrolled past in one fast fling: show it and stop watching */
          if (e.isIntersecting || e.boundingClientRect.bottom < 0) { e.target.classList.add('is-in'); io.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
      each(reveal, function (el) { io.observe(el); });
    }
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
