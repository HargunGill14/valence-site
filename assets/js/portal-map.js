/* Valence home: the "How it feels" map demo. Loaded by home.js only when the section nears
   the viewport. Plain ES5.
   - The side panel always works (click and keyboard), even without the map.
   - The street map only starts when a tile URL is configured (data-tiles) and Leaflet loaded.
     Until its first tile arrives, and for good if tiles fail, the static image stays in place.
   - Nothing moves until the visitor acts. No scroll-wheel zoom. On touch screens, dragging
     and pinch stay off until "Explore the map", so the page always scrolls past.
   - With reduced motion, the map jumps instead of flying. */
(function () {
  'use strict';
  var V = window.ValenceMapData;
  var HOME = [[31.8, -123.2], [40.2, -105.8]];

  function mount(root, opts) {
    opts = opts || {};
    var panelEl = root.querySelector('[data-panel]');
    var mapEl = root.querySelector('[data-map]');
    var exploreBtn = root.querySelector('[data-explore]');
    var state = { origin: null, dest: null, load: null };
    var map = null, layers = null, exploring = false;

    function go(next) {
      state = next;
      if (panelEl) {
        panelEl.innerHTML = V.panel(state, true);
        panelEl.scrollTop = 0;
        var h = panelEl.querySelector('.vm-h');
        if (h) h.focus({ preventScroll: true });
      }
      if (map) { draw(); frame(true); }
    }

    if (panelEl) {
      panelEl.innerHTML = V.panel(state, true);
      panelEl.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('button');
        if (!b || !panelEl.contains(b)) return;
        var s = state;
        if (b.hasAttribute('data-load')) go({ origin: s.origin, dest: s.dest, load: b.getAttribute('data-load') });
        else if (b.hasAttribute('data-dest')) go({ origin: s.origin, dest: b.getAttribute('data-dest'), load: null });
        else if (b.hasAttribute('data-origin')) {
          var o = b.getAttribute('data-origin');
          go({ origin: s.origin === o ? null : o, dest: null, load: null });
        }
        else if (b.hasAttribute('data-back')) go(s.load ? { origin: s.origin, dest: s.dest, load: null } : { origin: s.origin, dest: null, load: null });
        else if (b.hasAttribute('data-clear')) go({ origin: null, dest: null, load: null });
      });
    }

    if (!opts.tiles || !window.L || !mapEl) return;

    // ───────── map ─────────
    var L = window.L;
    var touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) && !opts.render;
    var still = !!opts.reduce;
    map = L.map(mapEl, {
      scrollWheelZoom: false, dragging: !touch, touchZoom: !touch, doubleClickZoom: !touch, boxZoom: false,
      keyboard: true, zoomSnap: opts.render ? 1 : 0.25, minZoom: 4, maxZoom: 12, maxBounds: [[18, -140], [55, -55]],
      zoomAnimation: !still, fadeAnimation: !still, markerZoomAnimation: !still, zoomControl: !opts.render
    });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    map.getContainer().setAttribute('aria-roledescription', 'map');
    layers = {
      route: L.layerGroup().addTo(map), pin: L.layerGroup().addTo(map),
      hub: L.layerGroup().addTo(map), truck: L.layerGroup().addTo(map)
    };

    var tilesOk = false, errors = 0, failed = false;
    function fail() {
      if (failed || tilesOk) return;
      failed = true;
      map.remove(); map = null;
      root.classList.remove('is-interactive');
      if (exploreBtn) exploreBtn.hidden = true;
    }
    L.tileLayer(opts.tiles, { attribution: opts.attribution || '', subdomains: 'abcd', maxZoom: 19, detectRetina: !!opts.detectRetina })
      .on('tileload', function () {
        if (tilesOk || failed) return;
        tilesOk = true;
        root.classList.add('is-interactive');
        if (exploreBtn && touch) exploreBtn.hidden = false;
      })
      .on('tileerror', function () { errors += 1; if (errors >= 3) fail(); })
      .on('load', function () { if (!tilesOk) fail(); else root.setAttribute('data-map-ready', ''); })
      .addTo(map);

    function along(pts, t) {
      var seg = [], tot = 0, i;
      for (i = 1; i < pts.length; i++) { var d = map.distance(pts[i - 1], pts[i]); seg.push(d); tot += d; }
      var want = t * tot;
      for (i = 0; i < seg.length; i++) {
        if (want <= seg[i]) {
          var f = seg[i] ? want / seg[i] : 0, a = pts[i], b = pts[i + 1];
          return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        }
        want -= seg[i];
      }
      return pts[pts.length - 1];
    }
    // Labels sit right of their marker; a few sit left so neighbours don't collide.
    var LEFT = ['Los Angeles, CA', 'Albuquerque, NM'];
    function label(text, anchor, cls) {
      return L.divIcon({ className: '', html: '<div class="vm-label' + (cls ? ' ' + cls : '') + '">' + text + '</div>', iconSize: [0, 0], iconAnchor: anchor });
    }
    // A pin or origin works like a button: click, Enter or Space. Leaflet creates the
    // element only once the map has a view, so it is named on 'add'.
    function button(marker, text, act) {
      return marker.on('click', act)
        .on('keypress', function (e) {
          var k = e.originalEvent.key;
          if (k === 'Enter' || k === ' ') { e.originalEvent.preventDefault(); act(); }
        })
        .on('add', function () { marker.getElement().setAttribute('aria-label', text); });
    }

    function draw() {
      layers.route.clearLayers(); layers.pin.clearLayers(); layers.hub.clearLayers(); layers.truck.clearLayers();
      var sel = state.load && V.byId(state.load);
      var visible = V.LOADS.filter(function (l) { return !state.origin || l.oc === state.origin; });
      visible.forEach(function (l) {
        var on = sel && sel.id === l.id;
        if ((sel && !on) || (state.dest && l.dc !== state.dest)) return;
        var c = V.ST[l.status].dot, pts = V.routePts(l);
        L.polyline(pts, { color: '#F4F1EA', weight: on ? 7 : 4, opacity: on ? 0.9 : 0.6, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(layers.route);
        L.polyline(pts, { color: c, weight: on ? 3.5 : 2, opacity: on ? 1 : 0.75, dashArray: on ? null : '1 7', lineCap: 'round', lineJoin: 'round' })
          .on('click', function () { go({ origin: state.origin, dest: state.dest, load: l.id }); }).addTo(layers.route);
      });
      var dests = [];
      visible.forEach(function (l) { if (dests.indexOf(l.dc) < 0) dests.push(l.dc); });
      dests.forEach(function (name) {
        var ls = visible.filter(function (l) { return l.dc === name; });
        var inbound = ls.filter(V.active).length;
        var dim = (sel && !ls.some(function (l) { return l.id === sel.id; })) || (state.dest && state.dest !== name);
        var icon = L.divIcon({ className: 'vm-pin-wrap', html: '<div class="vm-pin' + (dim ? ' is-dim' : '') + '" style="background:' + V.destColor(ls) + '"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
        button(L.marker(V.PL[name], { icon: icon, title: name, riseOnHover: true }),
          name + ', ' + (inbound ? inbound + ' inbound' : 'none inbound') + '. Show destination',
          function () { go({ origin: state.origin, dest: name, load: null }); }).addTo(layers.pin);
        L.marker(V.PL[name], { icon: label(V.city(name) + (ls.length > 1 ? ' · ' + ls.length : ''), LEFT.indexOf(name) < 0 ? [-12, -10] : [12, -10], LEFT.indexOf(name) < 0 ? '' : 'vm-label--left'), interactive: false, keyboard: false, zIndexOffset: -100, opacity: dim ? 0.4 : 1 }).addTo(layers.pin);
      });
      V.ORIGINS.forEach(function (name) {
        var n = V.LOADS.filter(function (l) { return l.oc === name && V.active(l); }).length;
        var icon = L.divIcon({ className: '', html: '<div class="vm-hub' + (state.origin === name ? ' is-active' : '') + '">' + n + '</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
        button(L.marker(V.PL[name], { icon: icon, zIndexOffset: 500 }),
          name + ' origin, ' + n + ' active loads. Show its lanes',
          function () { go({ origin: state.origin === name ? null : name, dest: null, load: null }); }).addTo(layers.hub);
        var dinuba = name.indexOf('Dinuba') === 0;
        L.marker(V.PL[name], { icon: label(V.city(name), [-18, dinuba ? -2 : 16], 'vm-label--strong'), interactive: false, keyboard: false }).addTo(layers.hub);
      });
      if (sel && sel.prog != null && sel.status !== 'Delivered') {
        L.marker(along(V.routePts(sel), sel.prog), { icon: L.divIcon({ className: '', html: '<div class="vm-truck"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), zIndexOffset: 600, interactive: false, keyboard: false }).addTo(layers.truck);
      }
    }

    function frame(animate) {
      var move = animate && !still;
      var pad = opts.render ? [0, 0] : mapEl.clientWidth < 500 ? [16, 16] : [32, 32];
      if (state.load) {
        // City labels sit right of their pins, so leave room on that side.
        var b = L.latLngBounds(V.routePts(V.byId(state.load)));
        var fit = { paddingTopLeft: pad, paddingBottomRight: [pad[0] + (opts.render ? 0 : 90), pad[1]], maxZoom: 9 };
        if (move) map.flyToBounds(b, L.extend({ duration: 0.6 }, fit));
        else map.fitBounds(b, L.extend({ animate: false }, fit));
      } else if (state.dest) {
        if (move) map.flyTo(V.PL[state.dest], 8, { duration: 0.6 });
        else map.setView(V.PL[state.dest], 8, { animate: false });
      } else {
        var pts = [];
        V.LOADS.forEach(function (l) { if (!state.origin || l.oc === state.origin) pts = pts.concat(V.routePts(l)); });
        var bb = state.origin ? L.latLngBounds(pts) : L.latLngBounds(HOME);
        if (move) map.flyToBounds(bb, { padding: pad, duration: 0.6 });
        else map.fitBounds(bb, { padding: pad, animate: false });
      }
    }

    // Touch screens: the map is a picture you scroll past until the visitor asks to explore it.
    if (exploreBtn && touch) {
      exploreBtn.addEventListener('click', function () {
        if (!map) return;
        exploring = !exploring;
        ['dragging', 'touchZoom', 'doubleClickZoom'].forEach(function (h) { map[h][exploring ? 'enable' : 'disable'](); });
        exploreBtn.setAttribute('aria-pressed', exploring ? 'true' : 'false');
        exploreBtn.textContent = exploring ? 'Done exploring' : 'Explore the map';
      });
    }

    if (window.ResizeObserver) new ResizeObserver(function () { if (map) map.invalidateSize({ animate: false }); }).observe(mapEl);
    draw();
    frame(false);
  }

  window.ValenceMapDemo = { mount: mount };
})();
