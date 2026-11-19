/* Three small isometric scenes for the industry cards, drawn in the same hand as the office film:
   paper floor tiles, white blocks with thin ink lines, one green accent. Each loops while on screen.
   fnb: a co-packer dock, cans down the line, a forklift feeding a trailer.
   aero: a clean room, a component lowered into its crate, the crate rolled to a flatbed.
   dc: a data hall slab, a crane setting crated racks in build order. */
(function () {
  'use strict';
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var P = { bg: '#F8F9FA', tileA: '#EEF0F3', tileB: '#E4E7EB', slab: '#D6DADF', white: '#FFFFFF', side: '#D6DADF', sideDark: '#C3C9D0', line: '#1E242B',
    green: '#6E8062', greenDeep: '#4F6B55', wood: '#CCB494', woodSide: '#B09674', steel: '#9CAFB8', steelDark: '#7E919A', can: '#9CAF8E', shirt: '#6E8062', skin: '#D8C0A8', hair: '#2A2925', alert: '#B9573A', rubber: '#2A2F36' };

  function ease(k) { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); }
  function Scene(cv, draw, dur) {
    this.cv = cv; this.cx = cv.getContext('2d'); this.draw = draw; this.dur = dur; this.W = cv.width; this.H = cv.height;
    this.u = this.W / 15; this.ocx = this.W * .5; this.ocy = this.H * .56; this.on = false; this.t0 = null; this.q = [];
  }
  Scene.prototype.at = function (x, y, fn) { this.q.push({ d: x + y, fn: fn }); };
  Scene.prototype.flush = function () { this.q.sort(function (a, b) { return a.d - b.d; }); for (var i = 0; i < this.q.length; i++) this.q[i].fn(); this.q = []; };
  Scene.prototype.proj = function (x, y, z) { return [this.ocx + (x - y) * this.u, this.ocy + (x + y) * this.u * .5 - (z || 0) * this.u]; };
  Scene.prototype.poly = function (pts, fill, stroke, lw) {
    var cx = this.cx; cx.beginPath(); cx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]); cx.closePath();
    if (fill) { cx.fillStyle = fill; cx.fill(); } if (stroke) { cx.strokeStyle = stroke; cx.lineWidth = lw || 1.2; cx.lineJoin = 'round'; cx.stroke(); }
  };
  Scene.prototype.box = function (x, y, z, w, d, h, top, side, dark, line) {
    var s = this, c = [[x - w / 2, y - d / 2], [x + w / 2, y - d / 2], [x + w / 2, y + d / 2], [x - w / 2, y + d / 2]];
    var T = c.map(function (p) { return s.proj(p[0], p[1], z + h); }), B = c.map(function (p) { return s.proj(p[0], p[1], z); });
    s.poly([B[1], B[2], T[2], T[1]], side, line); s.poly([B[2], B[3], T[3], T[2]], dark, line); s.poly(T, top, line);
  };
  Scene.prototype.floor = function (w, d, x0, y0) {
    for (var i = 0; i < w; i++) for (var j = 0; j < d; j++) { var x = x0 + i, y = y0 + j; this.poly([this.proj(x, y, 0), this.proj(x + 1, y, 0), this.proj(x + 1, y + 1, 0), this.proj(x, y + 1, 0)], (i + j) % 2 ? P.tileA : P.tileB, null); }
    this.poly([this.proj(x0, y0, 0), this.proj(x0 + w, y0, 0), this.proj(x0 + w, y0 + d, 0), this.proj(x0, y0 + d, 0)], null, P.line, 1.2);
    this.poly([this.proj(x0, y0 + d, 0), this.proj(x0 + w, y0 + d, 0), this.proj(x0 + w, y0 + d, -.35), this.proj(x0, y0 + d, -.35)], P.slab, P.line);
    this.poly([this.proj(x0 + w, y0, 0), this.proj(x0 + w, y0 + d, 0), this.proj(x0 + w, y0 + d, -.35), this.proj(x0 + w, y0, -.35)], P.sideDark, P.line);
  };
  Scene.prototype.person = function (x, y, shirt, walk) {
    var cx = this.cx, u = this.u, p = this.proj(x, y, 0), sc = u * .9, bob = walk ? Math.sin(walk * 14) * sc * .04 : 0;
    cx.save(); cx.translate(p[0], p[1] - bob); cx.fillStyle = 'rgba(30,36,43,.12)'; cx.beginPath(); cx.ellipse(0, 0, sc * .28, sc * .12, 0, 0, 6.283); cx.fill();
    cx.strokeStyle = P.line; cx.lineWidth = Math.max(1.5, sc * .09); cx.lineCap = 'round';
    var k = walk ? Math.sin(walk * 14) * sc * .14 : 0;
    cx.beginPath(); cx.moveTo(-sc * .08, -sc * .42); cx.lineTo(-sc * .1 + k, 0); cx.moveTo(sc * .08, -sc * .42); cx.lineTo(sc * .1 - k, 0); cx.stroke();
    cx.fillStyle = shirt; cx.beginPath(); cx.roundRect(-sc * .2, -sc * .95, sc * .4, sc * .55, sc * .08); cx.fill(); cx.strokeStyle = P.line; cx.lineWidth = 1.2; cx.stroke();
    cx.fillStyle = P.skin; cx.beginPath(); cx.arc(0, -sc * 1.12, sc * .16, 0, 6.283); cx.fill(); cx.stroke();
    cx.fillStyle = P.hair; cx.beginPath(); cx.arc(0, -sc * 1.17, sc * .16, 3.3, 6.1); cx.fill();
    cx.restore();
  };
  Scene.prototype.pallet = function (x, y, z, wrapped) {
    this.box(x, y, z, 1, 1, .12, P.wood, P.woodSide, P.woodSide, P.line);
    this.box(x, y, z + .12, .92, .92, .85, wrapped ? '#F3F5F7' : P.can, wrapped ? '#E6E9ED' : '#8AA07E', wrapped ? '#D6DADF' : '#79906E', P.line);
    if (wrapped) { var cx = this.cx; cx.save(); cx.globalAlpha = .5; cx.strokeStyle = '#FFFFFF'; cx.lineWidth = 2; for (var i = 1; i < 4; i++) { var a = this.proj(x + .46, y - .46, z + .12 + i * .2), b = this.proj(x + .46, y + .46, z + .12 + i * .2), c = this.proj(x - .46, y + .46, z + .12 + i * .2); cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.lineTo(c[0], c[1]); cx.stroke(); } cx.restore(); }
  };
  /* a wheel: an iso ellipse tyre with a hub, drawn at plan (x, y), axle height z */
  Scene.prototype.wheel = function (x, y, z, r) {
    var cx = this.cx, p = this.proj(x, y, z), u = this.u * r;
    cx.save(); cx.translate(p[0], p[1]); cx.rotate(.52);
    cx.fillStyle = P.rubber; cx.strokeStyle = P.line; cx.lineWidth = 1; cx.beginPath(); cx.ellipse(0, 0, u, u * .62, 0, 0, 6.283); cx.fill(); cx.stroke();
    cx.fillStyle = '#C3C9D0'; cx.beginPath(); cx.ellipse(0, 0, u * .45, u * .28, 0, 0, 6.283); cx.fill(); cx.stroke();
    cx.restore();
  };
  /* a tractor-trailer parked along +x at (x, y): the cab at the +x end, doors at the -x end */
  Scene.prototype.trailer = function (x, y, len, open) {
    var L = len, tx = x - L / 2 + 1.1;   /* tractor position */
    /* wheels first (they sit under the box) */
    var ws = [[x - L / 2 + 1.0, y + .72], [x - L / 2 + 1.7, y + .72], [x + L / 2 - 1.3, y + .72], [x + L / 2 - .6, y + .72]];
    for (var i = 0; i < ws.length; i++) this.wheel(ws[i][0], ws[i][1], .24, .2);
    this.wheel(x + L / 2 + .9, y + .72, .24, .22);
    this.box(x, y, .48, L, 1.5, 1.75, '#FFFFFF', '#EEF0F3', '#DCE0E5', P.line);
    /* tractor: hood, cab, exhaust */
    this.box(x + L / 2 + .95, y, .48, 1.2, 1.4, .8, '#EEF0F3', '#DCE0E5', '#CBD1D7', P.line);
    this.box(x + L / 2 + .6, y, 1.28, .5, 1.4, 1.0, '#EEF0F3', '#DCE0E5', '#CBD1D7', P.line);
    var cx = this.cx, w1 = this.proj(x + L / 2 + .86, y + .7, 1.5), w2 = this.proj(x + L / 2 + .86, y - .7, 1.5), w3 = this.proj(x + L / 2 + .86, y - .7, 2.1), w4 = this.proj(x + L / 2 + .86, y + .7, 2.1);
    this.poly([w1, w2, w3, w4], '#DAE4EC', P.line);
    if (open) { var d1 = this.proj(x - L / 2, y - .75, .48), d2 = this.proj(x - L / 2, y + .75, .48), d3 = this.proj(x - L / 2, y + .75, 2.23), d4 = this.proj(x - L / 2, y - .75, 2.23); this.poly([d1, d2, d3, d4], '#2A2F36', P.line); }
    var p1 = this.proj(x + L / 2 - .2, y + .76, .9), p2 = this.proj(x - L / 2 + .2, y + .76, .9); cx.strokeStyle = '#C3C9D0'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(p1[0], p1[1]); cx.lineTo(p2[0], p2[1]); cx.stroke();
  };
  Scene.prototype.forklift = function (x, y, lift, pallet) {
    this.wheel(x - .32, y + .42, .16, .17); this.wheel(x + .32, y + .42, .16, .17);
    this.box(x, y, .18, 1.0, .8, .45, P.green, P.greenDeep, '#3E5444', P.line);
    this.box(x - .15, y, .63, .5, .7, .55, P.green, P.greenDeep, '#3E5444', P.line);
    var cx = this.cx; [[.0, -.28], [.0, .28]].forEach(function (o) { var a = this.proj(x - .25 + o[0], y + o[1], 1.18), b = this.proj(x - .25 + o[0], y + o[1], 1.9); cx.strokeStyle = P.line; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke(); }, this);
    var m1 = this.proj(x + .55, y - .3, .1), m2 = this.proj(x + .55, y - .3, 2.0), m3 = this.proj(x + .55, y + .3, .1), m4 = this.proj(x + .55, y + .3, 2.0);
    cx.lineWidth = 2.2; cx.beginPath(); cx.moveTo(m1[0], m1[1]); cx.lineTo(m2[0], m2[1]); cx.moveTo(m3[0], m3[1]); cx.lineTo(m4[0], m4[1]); cx.stroke();
    this.person(x - .15, y, '#D9A066', 0);
    if (pallet) this.pallet(x + 1.15, y, .12 + lift, true);
  };
  Scene.prototype.crane = function (x, y, reach, hook, load) {
    var cx = this.cx, u = this.u;
    this.box(x, y, 0, 1.4, 1.4, .5, P.steel, P.steelDark, '#687A83', P.line);
    var a = this.proj(x, y, .5), b = this.proj(x, y, 4.4), c = this.proj(x + reach, y, 4.4), d = this.proj(x + reach, y, hook);
    cx.strokeStyle = P.line; cx.lineWidth = 3; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.lineTo(c[0], c[1]); cx.stroke();
    cx.lineWidth = 1.4; cx.beginPath(); cx.moveTo(c[0], c[1]); cx.lineTo(d[0], d[1]); cx.stroke();
    if (load) load(x + reach, y, hook);
  };

  /* ---------- extra parts ---------- */
  Scene.prototype.label = function (x, y, z, text, dark) {
    var cx = this.cx, p = this.proj(x, y, z); cx.save(); cx.font = '600 11px ui-monospace, Menlo, Consolas, monospace'; var w = cx.measureText(text).width + 14;
    cx.fillStyle = dark ? P.line : '#FFFFFF'; cx.strokeStyle = P.line; cx.lineWidth = 1; cx.beginPath(); cx.roundRect(p[0] - w / 2, p[1] - 20, w, 18, 3); cx.fill(); cx.stroke();
    cx.fillStyle = dark ? '#FFFFFF' : P.line; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(text, p[0], p[1] - 11);
    cx.strokeStyle = P.line; cx.beginPath(); cx.moveTo(p[0], p[1] - 2); cx.lineTo(p[0], p[1] + 4); cx.stroke(); cx.restore();
  };
  Scene.prototype.dockDoor = function (x, y, num, open) {
    /* a dock wall segment facing +y with a roll-up door and a number */
    this.poly([this.proj(x - 1.6, y, 0), this.proj(x + 1.6, y, 0), this.proj(x + 1.6, y, 2.6), this.proj(x - 1.6, y, 2.6)], '#F3F5F7', P.line);
    this.poly([this.proj(x - 1.1, y, 0), this.proj(x + 1.1, y, 0), this.proj(x + 1.1, y, open ? 2.1 : 2.1), this.proj(x - 1.1, y, 2.1)], open ? '#2A2F36' : '#DCE0E5', P.line);
    if (!open) { var cx = this.cx; cx.strokeStyle = '#C3C9D0'; cx.lineWidth = 1; for (var i = 1; i < 7; i++) { var a = this.proj(x - 1.1, y, i * .3), b = this.proj(x + 1.1, y, i * .3); cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke(); } }
    this.label(x, y, 2.9, 'DOCK ' + num, true);
  };
  Scene.prototype.rack = function (x, y, z, lit) {
    this.box(x, y, z, .8, 1, 2.1, '#EEF0F3', '#DCE0E5', '#2A2F36', P.line);
    var cx = this.cx; for (var i = 0; i < 9; i++) { var a = this.proj(x + .4, y + .5 - .0, z + .18 + i * .21), b = this.proj(x - .4, y + .5, z + .18 + i * .21); cx.strokeStyle = '#4A525B'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke(); if (lit) { var q = this.proj(x + .28, y + .5, z + .26 + i * .21); cx.fillStyle = (i + Math.floor(lit * 7)) % 3 ? '#6FBF7A' : '#D9A066'; cx.beginPath(); cx.arc(q[0], q[1], 1.8, 0, 6.283); cx.fill(); } }
  };
  Scene.prototype.engine = function (x, y, z, sc) {
    /* a rocket engine: a dome, a throat, a bell nozzle, drawn as stacked ellipses */
    var cx = this.cx, u = this.u * sc, p = this.proj(x, y, z);
    cx.save(); cx.translate(p[0], p[1]); cx.strokeStyle = P.line; cx.lineWidth = 1.2;
    var g = cx.createLinearGradient(-u, 0, u, 0); g.addColorStop(0, '#C9D1D8'); g.addColorStop(.5, '#F4F6F8'); g.addColorStop(1, '#B6BFC7'); cx.fillStyle = g;
    cx.beginPath(); cx.moveTo(-u * .35, -u * 1.5); cx.quadraticCurveTo(-u * 1.05, -u * .3, -u * .95, 0); cx.lineTo(u * .95, 0); cx.quadraticCurveTo(u * 1.05, -u * .3, u * .35, -u * 1.5); cx.closePath(); cx.fill(); cx.stroke();
    cx.fillStyle = '#AEB8C1'; cx.beginPath(); cx.ellipse(0, 0, u * .95, u * .32, 0, 0, 6.283); cx.fill(); cx.stroke();
    cx.fillStyle = '#5B666F'; cx.beginPath(); cx.ellipse(0, 0, u * .7, u * .22, 0, 0, 6.283); cx.fill();
    cx.fillStyle = '#DEE3E8'; cx.beginPath(); cx.rect(-u * .3, -u * 2.0, u * .6, u * .5); cx.fill(); cx.stroke();
    cx.fillStyle = '#EDF0F2'; cx.beginPath(); cx.ellipse(0, -u * 2.0, u * .55, u * .2, 0, 0, 6.283); cx.fill(); cx.stroke();
    for (var i = 1; i < 5; i++) { cx.beginPath(); cx.ellipse(0, -u * .35 * i * .9, u * (.95 - i * .14), u * .14, 0, 0, Math.PI); cx.strokeStyle = 'rgba(30,36,43,.35)'; cx.stroke(); }
    cx.restore();
  };
  Scene.prototype.hardhat = function (x, y, shirt, walk) { this.person(x, y, shirt, walk); var p = this.proj(x, y, 0), sc = this.u * .9, cx = this.cx; cx.fillStyle = '#E8C14A'; cx.strokeStyle = P.line; cx.lineWidth = 1.2; cx.beginPath(); cx.arc(p[0], p[1] - sc * 1.16 - (walk ? Math.sin(walk * 14) * sc * .04 : 0), sc * .18, 3.2, 6.2); cx.fill(); cx.stroke(); };

  /* ---------- scenes (every part is queued with its plan position, then drawn back to front) ---------- */
  function fnb(s, t) {
    s.floor(8, 6, -4, -3);
    s.at(-9, -9, function () { s.dockDoor(-1.6, -3, 3, false); s.dockDoor(1.9, -3, 4, true); });
    s.at(-99, -99, function () { s.trailer(1.9, -4.7, 4.4, true); });
    /* the line */
    s.at(-1.2, 1.9, function () {
      s.box(-1.2, 1.9, 0, 5.6, .7, .55, P.steel, P.steelDark, '#687A83', P.line);
      for (var i = 0; i < 16; i++) { var bx = -2.5 + ((i * .33 + t * 3.4) % 5); var p = s.proj(bx, 1.9, .66); var cx = s.cx; cx.fillStyle = '#B9C8AE'; cx.strokeStyle = P.line; cx.lineWidth = 1; cx.beginPath(); cx.roundRect(p[0] - s.u * .07, p[1] - s.u * .26, s.u * .14, s.u * .26, 2); cx.fill(); cx.stroke(); cx.fillStyle = P.greenDeep; cx.fillRect(p[0] - s.u * .035, p[1] - s.u * .32, s.u * .07, s.u * .07); }
    });
    s.at(-3.2, 1.9, function () { s.box(-3.2, 1.9, .55, 1.0, .9, 1.2, '#EEF0F3', '#DCE0E5', '#CBD1D7', P.line); s.label(-3.2, 1.9, 1.9, 'FILLER'); });
    s.at(1.9, 1.9, function () { s.box(1.9, 1.9, .55, 1.1, .9, 1.0, '#EEF0F3', '#DCE0E5', '#CBD1D7', P.line); s.label(1.9, 1.9, 1.7, 'CASE PACKER'); });
    s.at(3.3, 1.9, function () { s.pallet(3.3, 1.9, 0, false); s.label(3.3, 1.9, 1.3, 'PO 4466'); });
    [[-3.1, -1.6], [-3.1, -.5], [-2.0, -1.6]].forEach(function (c, i) { s.at(c[0], c[1], function () { s.pallet(c[0], c[1], 0, true); if (i === 0) s.label(c[0], c[1], 1.3, '22 PLT · REEFER'); }); });
    /* forklift: pick a wrapped pallet, drive to door 4, lift into the trailer, come back (eased) */
    var k = t % 1, fx, fy, lift = 0, has = true, e;
    if (k < .38) { e = ease(k / .38); fx = -.9 + e * 2.8; fy = -.3 - e * 1.2; }
    else if (k < .52) { fx = 1.9; fy = -1.5; lift = ease((k - .38) / .14) * .45; }
    else if (k < .6) { fx = 1.9; fy = -1.5; lift = .45; has = false; }
    else { e = ease((k - .6) / .4); fx = 1.9 - e * 2.8; fy = -1.5 + e * 1.2; has = false; }
    if (!has) s.at(1.9, -2.8, function () { s.pallet(1.9, -2.8, .48, true); });
    (function (fx, fy, lift, has) { s.at(fx, fy, function () { s.forklift(fx, fy, lift, has); }); })(fx, fy, lift, has);
    s.at(-.6, 2.9, function () { s.person(-.6, 2.9, '#FFFFFF', 0); }); s.at(3.1, .6, function () { s.person(3.1, .6, '#86688C', t); });
    s.flush();
  }
  function aero(s, t) {
    s.floor(8, 6, -4, -3);
    s.at(-99, -99, function () { s.poly([s.proj(-4, -3, 0), s.proj(4, -3, 0), s.proj(4, -3, 3.4), s.proj(-4, -3, 3.4)], '#F3F5F7', P.line); s.poly([s.proj(-3.6, -3, 1.6), s.proj(3.6, -3, 1.6), s.proj(3.6, -3, 2.8), s.proj(-3.6, -3, 2.8)], '#DAE4EC', P.line); s.label(0, -3, 3.7, 'INTEGRATION BAY 2', true); });
    var k = t % 1, cx = s.cx;
    s.at(-2.6, -.4, function () {
      s.box(-2.6, -.4, 0, 1.6, 1.6, .3, P.steelDark, P.steelDark, '#687A83', P.line);
      [[-3.2, -1.0], [-2.0, -1.0], [-3.2, .2], [-2.0, .2]].forEach(function (c) { var a = s.proj(c[0], c[1], .3), b = s.proj(c[0], c[1], 2.4); cx.strokeStyle = P.line; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke(); });
      s.label(-2.6, -.4, 2.7, 'TEST STAND');
    });
    var cxp = k < .66 ? .4 : .4 + ease((k - .66) / .34) * 2.9;
    s.at(cxp, .9, function () {
      s.box(cxp, .9, 0, 2.2, 1.5, .3, P.steelDark, P.steelDark, '#687A83', P.line);
      s.box(cxp, .9, .3, 2.2, 1.5, 1.2, P.wood, P.woodSide, '#9A8060', P.line);
      var st = s.proj(cxp + 1.1, .9, .9); cx.save(); cx.translate(st[0], st[1]); cx.transform(1, .5, 0, 1, 0, 0); cx.fillStyle = P.line; cx.font = '700 9px ui-monospace, Menlo, monospace'; cx.textAlign = 'center'; cx.fillText('THIS SIDE UP ↑', 0, 0); cx.fillText('FRAGILE · 2,400 LB', 0, 12); cx.restore();
      if (k >= .56) s.engine(cxp, .9, .6, .55);
      if (k >= .66) s.box(cxp, .9, 1.5, 2.3, 1.6, .15, P.wood, P.woodSide, '#9A8060', P.line);
      if (k >= .56 && k < .66) { var ck = s.proj(cxp, .9, 2.4); cx.strokeStyle = P.greenDeep; cx.lineWidth = 3.5; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(ck[0] - 10, ck[1]); cx.lineTo(ck[0] - 2, ck[1] + 8); cx.lineTo(ck[0] + 12, ck[1] - 10); cx.stroke(); s.label(cxp, .9, 2.9, 'SERIAL MATCHED · SEALED'); }
    });
    if (k < .56) {
      var lift = ease(Math.min(1, k / .18)), move = ease(Math.min(1, Math.max(0, (k - .18) / .22))), drop = ease(Math.min(1, Math.max(0, (k - .4) / .16)));
      var ex = -2.6 + (cxp + 2.6) * move, ey = -.4 + 1.3 * move, ez = 1.0 + lift * 2.2 - drop * 2.4;
      s.at(-.2, -2.2, function () { s.crane(-.2, -2.2, ex + .2, ez + 1.6, null); });
      s.at(ex, ey + .01, function () { var hk = s.proj(ex, ey, ez + 1.6), top = s.proj(ex, ey, ez + 1.5); cx.strokeStyle = P.line; cx.lineWidth = 1.4; cx.beginPath(); cx.moveTo(hk[0], hk[1]); cx.lineTo(top[0], top[1]); cx.stroke(); s.engine(ex, ey, ez, .55); });
    }
    s.at(4.6, .9, function () { s.trailer(4.6, .9, 4.2, false); s.label(4.6, .9, 2.6, 'FLATBED · AIR-RIDE'); });
    s.at(1.9, 2.4, function () { s.person(1.9, 2.4, '#FFFFFF', k > .66 ? t : 0); }); s.at(-1.3, 2.2, function () { s.person(-1.3, 2.2, '#FFFFFF', 0); });
    s.flush();
  }
  function dc(s, t) {
    s.floor(8, 6, -4, -3);
    s.at(-99, -99, function () { s.label(-1.6, -3, 3.2, 'DATA HALL B · ROW 7', true); });
    var k = t % 1, n = Math.floor(k * 6), f = (k * 6) % 1, cx = s.cx;
    /* containment frame: the back posts are drawn behind the racks, the front rail in front */
    s.at(-3.6, -1.6, function () { var a = s.proj(-3.6, -1.6, 0), b = s.proj(-3.6, -1.6, 2.9); cx.strokeStyle = P.line; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke(); });
    s.at(1.4, -1.6, function () { var a = s.proj(1.4, -1.6, 0), b = s.proj(1.4, -1.6, 2.9), ta = s.proj(-3.6, -1.6, 2.9); cx.strokeStyle = P.line; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.moveTo(b[0], b[1]); cx.lineTo(ta[0], ta[1]); cx.stroke(); });
    for (var i = 0; i < 6; i++) (function (i) { var rx = -3.1 + i * .9, ry = -1.0;
      s.at(rx, ry, function () { if (i < n) s.rack(rx, ry, 0, t * 2 + i); else { s.poly([s.proj(rx - .4, ry - .5, .01), s.proj(rx + .4, ry - .5, .01), s.proj(rx + .4, ry + .5, .01), s.proj(rx - .4, ry + .5, .01)], null, P.greenDeep, 1.4); var q = s.proj(rx, ry, .02); cx.fillStyle = P.greenDeep; cx.font = '700 9px ui-monospace, Menlo, monospace'; cx.textAlign = 'center'; cx.fillText(String(i + 1), q[0], q[1] + 3); } });
    })(i);
    s.at(3.6, 2.2, function () { s.trailer(3.6, 2.2, 4.4, false); s.label(3.6, 2.2, 2.7, 'RACKS ' + Math.min(6, n + 1) + '–6 · CRATED'); for (var j = n + 1; j < 6; j++) s.box(2.1 + (j - n - 1) * .9, 2.2, .48, .8, 1, 2.1, P.wood, P.woodSide, '#9A8060', P.line); });
    if (n < 6) {
      var tx = -3.1 + n * .9, ty = -1.0, mv = ease(Math.min(1, f / .7)), dn = ease(Math.max(0, (f - .7) / .3));
      var lx = 1.6 + (tx - 1.6) * mv, ly = 2.2 + (ty - 2.2) * mv, lz = f < .7 ? 2.8 + Math.sin(mv * Math.PI) * .5 : 2.8 - dn * 2.8;
      s.at(-.6, 3.0, function () { s.crane(-.6, 3.0, lx + .6, 0, null); });
      s.at(lx, ly + .02, function () { var hk = s.proj(lx, 3.0, 4.4), top = s.proj(lx, ly, lz + 2.1); cx.strokeStyle = P.line; cx.lineWidth = 1.4; cx.beginPath(); cx.moveTo(hk[0], hk[1]); cx.lineTo(top[0], top[1]); cx.stroke(); s.rack(lx, ly, lz, 0); s.label(lx, ly, lz + 2.4, 'RACK ' + (n + 1) + ' OF 6'); });
    } else s.at(9, 9, function () { s.label(-1.3, -1.0, 2.6, 'ROW 7 · POWERED · ON SCHEDULE'); });
    s.at(.4, 1.0, function () { s.hardhat(.4, 1.0, '#E8C14A', 0); }); s.at(-2.4, 1.6, function () { s.hardhat(-2.4, 1.6, '#D9A066', t); });
    s.flush();
  }

  var SCENES = { fnb: [fnb, 9], aero: [aero, 10], dc: [dc, 12] }, all = [];
  Array.prototype.forEach.call(document.querySelectorAll('canvas[data-scene]'), function (cv) {
    var def = SCENES[cv.getAttribute('data-scene')]; if (!def || !cv.getContext) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = +cv.getAttribute('width'), H = +cv.getAttribute('height');
    cv.width = W * dpr; cv.height = H * dpr;
    var s = new Scene(cv, def[0], def[1]); s.W = W; s.H = H; s.u = W / 16; s.ocx = W * .5; s.ocy = H * .6; s.dpr = dpr; all.push(s);
  });
  function render(s, t) { var cx = s.cx; cx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); cx.fillStyle = P.bg; cx.fillRect(0, 0, s.W, s.H); s.draw(s, t); }
  all.forEach(function (s) { render(s, reduce ? .3 : 0); });
  if (reduce || !all.length) return;
  if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { es.forEach(function (e) { all.forEach(function (s) { if (s.cv === e.target) s.on = e.isIntersecting; }); }); }, { threshold: .2 }); all.forEach(function (s) { io.observe(s.cv); }); }
  else all.forEach(function (s) { s.on = true; });
  function frame(ts) { all.forEach(function (s) { if (!s.on) return; if (!s.t0) s.t0 = ts; render(s, ((ts - s.t0) / 1000) / s.dur); }); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
})();
