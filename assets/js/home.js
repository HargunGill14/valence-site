/* Valence home: loads the "How it feels" map demo when the section nears the viewport.
   Until then (and without JavaScript) the section shows a static map image and the overview panel.
   Leaflet is fetched only when a tile URL is configured on the map element (data-tiles). */
(function () {
  'use strict';
  var root = document.querySelector('[data-map-demo]');
  if (!root) return;
  var mapEl = root.querySelector('[data-map]');
  var tiles = mapEl ? mapEl.getAttribute('data-tiles') : '';
  var LEAFLET = '/assets/vendor/leaflet/1.9.4/';
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var started = false;

  function script(src, done, failed) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = done;
    s.onerror = failed || function () { /* the static image and panel stay */ };
    document.body.appendChild(s);
  }

  function start() {
    if (started) return;
    started = true;
    script('/assets/js/portal-map-data.js', function () {
      var mount = function () {
        script('/assets/js/portal-map.js', function () {
          window.ValenceMapDemo.mount(root, { tiles: tiles, attribution: mapEl.getAttribute('data-attribution'), reduce: reduce });
        });
      };
      if (!tiles) { mount(); return; }
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET + 'leaflet.css';
      document.head.appendChild(css);
      script(LEAFLET + 'leaflet.js', mount, mount);
    });
  }

  if (!('IntersectionObserver' in window)) { start(); return; }
  var io = new IntersectionObserver(function (entries) {
    if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); }
  }, { rootMargin: '600px 0px' });
  io.observe(root);
})();
