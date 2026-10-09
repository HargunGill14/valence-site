/* Valence home intro: a miniature office, drawn on canvas and driven by scroll.
   Load: the office fills the screen, messy and grey, no header.
   Scroll: it spins on its turntable and shrinks, the paper flies out of the room into the empty
   space around it, the header slides in, the page frame appears, and the office settles into
   Valence's calm, warm, orderly state, with that same paper landing in neat stacks on the desks.
   The room has walls with windows; only the two walls at the back are drawn, so the inside
   stays in view from every angle as it turns.
   Workers scurry on a 12 fps step while the office is in chaos; everything else follows the scrollbar. */
(function () {
  'use strict';
  var sec = document.getElementById('intro');
  var cv = document.getElementById('intro-canvas');
  if (!sec || !cv || !cv.getContext) return;
  var cx = cv.getContext('2d');
  var stage = sec.querySelector('.intro__stage');
  var root = document.documentElement;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var stepEl = document.getElementById('intro-step');

  /* ── deterministic random so the mess looks the same on every load ── */
  var seed = 11;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(x, a, b) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }

  /* ── two palettes: chaos is drained and grey, handled is warm (Valence brand kit) ── */
  var CH = { bg: [38, 39, 42], slab: [48, 49, 52], tileA: [72, 73, 76], tileB: [64, 65, 68], desk: [98, 98, 100], deskSide: [78, 78, 80],
    chair: [86, 86, 88], skin: [156, 150, 142], shirt: [112, 112, 114], paper: [196, 196, 196], plant: [96, 100, 96], pot: [88, 84, 80],
    box: [102, 98, 92], boxSide: [84, 80, 74], mon: [58, 58, 62], screen: [128, 130, 134], line: [22, 22, 24], alert: [176, 100, 82],
    text: [226, 226, 228], door: [60, 60, 64], panel: [30, 30, 33], cab: [90, 90, 92], cabSide: [72, 72, 74],
    wall: [62, 63, 66], wallTop: [74, 75, 78], pane: [50, 52, 56], board: [118, 118, 120], ink: [40, 40, 42] };
  var CA = { bg: [243, 238, 228], slab: [217, 209, 194], tileA: [234, 227, 213], tileB: [226, 218, 202], desk: [250, 246, 238], deskSide: [217, 209, 194],
    chair: [94, 91, 84], skin: [216, 192, 168], shirt: [110, 128, 98], paper: [253, 251, 246], plant: [110, 128, 98], pot: [196, 170, 136],
    box: [204, 180, 148], boxSide: [176, 150, 116], mon: [42, 41, 37], screen: [156, 175, 142], line: [42, 41, 37], alert: [185, 87, 58],
    text: [42, 41, 37], door: [217, 209, 194], panel: [250, 236, 206], cab: [234, 227, 213], cabSide: [217, 209, 194],
    wall: [236, 229, 215], wallTop: [217, 209, 194], pane: [220, 230, 232], board: [252, 250, 245], ink: [110, 128, 98] };
  var h = 0; /* harmony: 0 chaos, 1 handled */
  function mix(a, b, k) { return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * k) + ',' + Math.round(a[1] + (b[1] - a[1]) * k) + ',' + Math.round(a[2] + (b[2] - a[2]) * k) + ')'; }
  function C(n) {
    if (n === 'bg') return mix(CH.bg, CA.bg, smooth(h, .38, .62));
    if (n === 'text') return mix(h < .5 ? CH.text : CA.text, h < .5 ? CH.text : CA.text, 0);
    return mix(CH[n], CA[n], h);
  }

  /* ── the office, in floor tiles, origin at the centre ── */
  var FLOOR = { w: 14, d: 10 }, WALL_H = 2.7, WALL_T = .22;
  var desks = [];
  [-2.2, 1.6].forEach(function (y) {
    [-4.5, -1.5, 1.5, 4.5].forEach(function (x) {
      desks.push({ x: x, y: y, ox: (rnd() - .5) * 2.6, oy: (rnd() - .5) * 2.2, oa: (rnd() - .5) * 1.1, j: rnd() * 6.28 });
    });
  });
  var LOOKS = [
    { shirt: [110, 128, 98], hair: [42, 41, 37], style: 'short', tie: true }, { shirt: [86, 104, 140], hair: [120, 78, 48], style: 'bun' },
    { shirt: [172, 92, 72], hair: [30, 30, 32], style: 'cap' }, { shirt: [210, 184, 120], hair: [90, 64, 40], style: 'short' },
    { shirt: [94, 91, 84], hair: [200, 168, 110], style: 'long' }, { shirt: [120, 140, 170], hair: [60, 40, 30], style: 'short', tie: true },
    { shirt: [150, 110, 130], hair: [36, 36, 40], style: 'bun' }, { shirt: [110, 128, 98], hair: [140, 100, 60], style: 'cap' },
    { shirt: [196, 170, 136], hair: [50, 44, 40], style: 'long' }, { shirt: [86, 104, 140], hair: [220, 200, 160], style: 'short' },
    { shirt: [172, 92, 72], hair: [40, 36, 34], style: 'bun', tie: true }, { shirt: [120, 140, 170], hair: [100, 70, 40], style: 'short' }
  ];
  /* calm posts for the four extra people: at the whiteboard, by the boxes, two talking by the door */
  var POSTS = [{ x: -1.5, y: -4.3, face: 1 }, { x: 4.6, y: 3.6, face: -1 }, { x: -.9, y: -3.9, face: 1 }, { x: .9, y: -3.9, face: -1 }];
  var workers = [];
  for (i = 0; i < 12; i++) {
    var d = desks[i % desks.length];
    workers.push({ desk: i < 8 ? d : null, post: i < 8 ? null : POSTS[i - 8], look: LOOKS[i], x: d.x + (rnd() - .5) * 8, y: d.y + (rnd() - .5) * 6,
      tx: 0, ty: 0, nt: 0, i: i, dir: 1, ph: rnd() * 6.28, paper: rnd() > .4 });
  }
  /* the mess on the floor: mugs, a fallen chair, a tipped plant, coffee, cables */
  var clutter = [];
  for (i = 0; i < 7; i++) clutter.push({ kind: 'mug', x: (rnd() - .5) * 11, y: (rnd() - .5) * 7, a: rnd() * 6.28 });
  for (i = 0; i < 4; i++) clutter.push({ kind: 'stain', x: (rnd() - .5) * 11, y: (rnd() - .5) * 7, s: .4 + rnd() * .5 });
  clutter.push({ kind: 'chair', x: 2.6, y: -.4, a: 1.1 });
  clutter.push({ kind: 'plant', x: -3.2, y: 3.2, a: .6 });
  clutter.push({ kind: 'cable', pts: [[-5.5, -1.2], [-3.8, .4], [-1.2, -.6], [1.4, 1.2], [3.9, .2]] });
  clutter.push({ kind: 'cable', pts: [[4.8, -3.2], [2.2, -2.6], [.4, -3.6]] });
  var plants = [{ x: -6.3, y: -4.3 }, { x: 6.3, y: -4.3 }, { x: -6.3, y: 4.3 }, { x: 6.3, y: 4.3 }].map(function (p) { return { x: p.x, y: p.y, ox: (rnd() - .5) * 5, oy: (rnd() - .5) * 4 }; });
  var cabinets = [-1.6, -0.4, 0.8].map(function (y) { return { x: -6.3, y: y, ox: (rnd() - .5) * 3, oy: (rnd() - .5) * 3, oa: (rnd() - .5) * 1.4 }; });
  var boxes = [];
  for (var i = 0; i < 6; i++) boxes.push({ x: 5.5 + (i % 2) * 1.1, y: 2.5 + Math.floor(i / 2) * 1.1, s: .9, hh: .7 + rnd() * .4, ox: (rnd() - .5) * 8, oy: (rnd() - .5) * 6, oa: rnd() * 3, oz: rnd() > .5 ? .8 : 0 });
  /* 40 sheets of paper: on the floor or in the air during chaos, out of the room during the spin,
     and stacked five to a desk once Valence is in */
  var papers = [];
  for (i = 0; i < 40; i++) papers.push({
    fx: (rnd() - .5) * 12.5, fy: (rnd() - .5) * 8.5, fa: rnd() * 6.28, fly: i < 14, ph: rnd(), spd: .25 + rnd() * .35,
    ax: (rnd() - .5) * 12, ay: (rnd() - .5) * 8, bx: (rnd() - .5) * 12, by: (rnd() - .5) * 8,
    desk: desks[i % desks.length], k: Math.floor(i / desks.length),
    delay: rnd(), tx: rnd(), ty: rnd(), drift: rnd() * 6.28, spin: (rnd() - .5) * 6
  });
  var DOOR = { x: 0, y: -FLOOR.d / 2 };
  /* the ping-pong table at the front of the calm office, and the two who play on it */
  var PP = { x: 1.5, y: 4.0, w: 2.4, d: 1.2, h: .76 };
  [{ x: PP.x - PP.w / 2 - .7, face: 1 }, { x: PP.x + PP.w / 2 + .7, face: -1 }].forEach(function (q, k) {
    var look = k ? { shirt: [120, 140, 170], hair: [36, 36, 40], style: 'long' } : { shirt: [210, 184, 120], hair: [60, 40, 30], style: 'cap' };
    workers.push({ desk: null, post: { x: q.x, y: PP.y, face: q.face, pp: k }, look: look, x: (rnd() - .5) * 10, y: (rnd() - .5) * 6,
      tx: 0, ty: 0, nt: 0, i: 12 + k, dir: 1, ph: rnd() * 6.28, paper: false });
  });
  /* the four walls: centre, size, outward normal, and what hangs on each */
  var walls = [
    { x: 0, y: -FLOOR.d / 2 - WALL_T / 2, w: FLOOR.w + .4, d: WALL_T, n: [0, -1], axis: 'x', windows: [[-5.6, -3.2], [3.0, 5.6]], door: true, board: [-2.2, -.9] },
    { x: 0, y: FLOOR.d / 2 + WALL_T / 2, w: FLOOR.w + .4, d: WALL_T, n: [0, 1], axis: 'x', windows: [[-5.2, -2.6], [-1.3, 1.3], [2.6, 5.2]] },
    { x: -FLOOR.w / 2 - WALL_T / 2, y: 0, w: WALL_T, d: FLOOR.d + .4, n: [-1, 0], axis: 'y', windows: [[-3.6, -1.4], [1.4, 3.6]], poster: [-.9, .3] },
    { x: FLOOR.w / 2 + WALL_T / 2, y: 0, w: WALL_T, d: FLOOR.d + .4, n: [1, 0], axis: 'y', windows: [[-3.6, -1.4], [1.4, 3.6]] }
  ];

  /* ── projection ── */
  var W = 0, H = 0, dpr = 1, u = 20, theta = 0, zoom = 1, ocx = 0, ocy = 0;
  function rot(x, y) { var c = Math.cos(theta), s = Math.sin(theta); return [x * c - y * s, x * s + y * c]; }
  function proj(x, y, z) { var r = rot(x, y); return [ocx + (r[0] - r[1]) * u * zoom, ocy + (r[0] + r[1]) * u * .5 * zoom - (z || 0) * u * zoom]; }
  /* the plan position whose projection is this screen point (at height z) */
  function unproj(sx, sy, z) {
    var a = (sx - ocx) / (u * zoom), b = (sy - ocy + z * u * zoom) / (u * zoom * .5);
    var rx = (a + b) / 2, ry = (b - a) / 2, c = Math.cos(-theta), s = Math.sin(-theta);
    return [rx * c - ry * s, rx * s + ry * c];
  }
  function depth(x, y) { var r = rot(x, y); return r[0] + r[1]; }
  function poly(pts, fill, stroke) {
    cx.beginPath(); cx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]);
    cx.closePath(); if (fill) { cx.fillStyle = fill; cx.fill(); }
    if (stroke) { cx.strokeStyle = stroke; cx.lineWidth = 1; cx.stroke(); }
  }
  function cuboid(x, y, z, w, d, hh, ang, top, side, sideDark, line) {
    var ca = Math.cos(ang || 0), sa = Math.sin(ang || 0);
    var corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(function (p) { return [x + p[0] * ca - p[1] * sa, y + p[0] * sa + p[1] * ca]; });
    var tops = corners.map(function (p) { return proj(p[0], p[1], z + hh); });
    var bots = corners.map(function (p) { return proj(p[0], p[1], z); });
    for (var i = 0; i < 4; i++) {
      var j = (i + 1) % 4, ex = corners[j][0] - corners[i][0], ey = corners[j][1] - corners[i][1];
      var n = rot(ey, -ex);
      if (n[0] + n[1] > 0) poly([bots[i], bots[j], tops[j], tops[i]], (n[0] - n[1]) > 0 ? sideDark : side, line);
    }
    poly(tops, top, line);
  }
  /* a flat rectangle lying in the plan at height z, rotated by ang */
  function sheet(x, y, z, w, d, ang, fill, line) {
    var ca = Math.cos(ang), sa = Math.sin(ang);
    poly([[-w, -d], [w, -d], [w, d], [-w, d]].map(function (q) { return proj(x + q[0] * ca - q[1] * sa, y + q[0] * sa + q[1] * ca, z); }), fill, line);
  }
  /* a rectangle standing on a wall's inner face: from a to b along the wall, z1 to z2 up */
  function onWall(wl, a, b, z1, z2, fill, line) {
    var pts = wl.axis === 'x'
      ? [proj(a, wl.face, z1), proj(b, wl.face, z1), proj(b, wl.face, z2), proj(a, wl.face, z2)]
      : [proj(wl.face, a, z1), proj(wl.face, b, z1), proj(wl.face, b, z2), proj(wl.face, a, z2)];
    poly(pts, fill, line);
    return pts;
  }
  function roundRect(x, y, w, hh, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + hh, r); cx.arcTo(x + w, y + hh, x, y + hh, r); cx.arcTo(x, y + hh, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
  function label(text, x, y, alpha, right) {
    if (alpha <= 0.02) return;
    cx.save(); cx.globalAlpha = alpha;
    cx.font = '500 ' + Math.max(11, Math.round(u * zoom * .34)) + 'px ui-monospace, Menlo, Consolas, monospace';
    var tw = cx.measureText(text).width, ph = u * zoom * .22, py = u * zoom * .6;
    if (right) x -= tw;                                         /* anchored by its right edge */
    x = clamp(x, ph + 8, W - tw - ph - 8);                      /* keep every callout inside the stage */
    cx.fillStyle = h > .5 ? 'rgba(250,246,238,.92)' : 'rgba(20,20,22,.78)';
    roundRect(x - ph, y - py, tw + ph * 2, py * 1.5, 3); cx.fill();
    cx.fillStyle = C('text'); cx.textBaseline = 'middle'; cx.fillText(text, x, y - py * .25);
    cx.restore();
  }

  /* ── state from scroll ── */
  var p = 0, e = 0, tnow = 0, scurry = true;
  function applyScroll() {
    var y = window.pageYOffset || root.scrollTop || 0;
    var range = (sec.offsetHeight - window.innerHeight) || 1;
    p = clamp(y / range, 0, 1);
    var frame = smooth(p, .62, .96);                   /* page frame and header */
    root.style.setProperty('--intro-p', frame.toFixed(3));
    e = smooth(p, .5, .9);                             /* objects settle, palette warms */
    h = e;
    var spin = smooth(p, .06, .9);
    theta = spin * Math.PI * 4;                         /* two turns on the turntable */
    zoom = lerp(1.28, W > 900 ? .82 : .6, smooth(p, .04, .8));         /* smaller and smaller */
    scurry = e < .35;
    var ph = p < .5 ? 'chaos' : (e < 1 ? 'settle' : 'calm');
    if (sec.getAttribute('data-phase') !== ph) {
      sec.setAttribute('data-phase', ph);
      if (stepEl) stepEl.textContent = ph === 'chaos' ? '01 // fight or flight' : (ph === 'settle' ? '02 // valence steps in' : '03 // handled');
    }
    stage.style.setProperty('--intro-bg', C('bg'));
    stage.style.setProperty('--intro-fg', C('text'));
    stage.style.setProperty('--intro-h', h.toFixed(3));
  }

  /* ── workers scurry while it is chaos ── */
  function animate(dt) {
    workers.forEach(function (wk) { if (e < .98) wk.ph += dt * 14; });
    errands(dt);
  }

  /* ── once it is calm, people get up now and then: file a sheet, check with a colleague, join the chat by the door ── */
  var errandClock = 0;
  function seatOf(wk) { return [wk.desk.x, wk.desk.y + .95]; }
  function corridor(y) { return y < .5 ? -.6 : 3.2; }            /* the two aisles people walk along */
  function route(from, to) {
    var cs = corridor(from[1]), ct = corridor(to[1]), pts = [[from[0], cs]];
    if (cs !== ct) { var gx = [-3, 0, 3].sort(function (a, b) { return Math.abs(a - from[0]) - Math.abs(b - from[0]); })[0]; pts.push([gx, cs], [gx, ct]); }
    pts.push([to[0], ct], [to[0], to[1]]);
    return pts;
  }
  function startErrand(wk) {
    var seat = seatOf(wk), r = rnd(), to, face;
    if (r < .4) { to = [-5.7, wk.desk.y < 0 ? -.4 : .8]; face = -1; }                                  /* the cabinets */
    else if (r < .8) { var d2 = desks[(desks.indexOf(wk.desk) + 1 + Math.floor(rnd() * 7)) % 8], sx = d2.x > 4 ? -1.2 : 1.2; to = [d2.x + sx, d2.y + .95]; face = sx > 0 ? -1 : 1; }   /* a colleague */
    else { to = [0, -3.2]; face = 1; }                                                                   /* the two by the door */
    wk.ex = seat[0]; wk.ey = seat[1];
    wk.err = { pts: route(seat, to), k: 0, hold: 0, back: false, walking: true, face: face, dir: wk.dir, talk: false };
  }
  function errands(dt) {
    if (e < .98) { workers.forEach(function (wk) { wk.err = null; }); errandClock = 0; return; }
    var busy = 0; workers.forEach(function (wk) { if (wk.err) busy++; });
    errandClock += dt;
    if (busy < 2 && errandClock > 2.2) {
      errandClock = 0;
      var free = workers.filter(function (wk) { return wk.desk && !wk.err; });
      if (free.length && rnd() < .7) startErrand(free[Math.floor(rnd() * free.length)]);
    }
    workers.forEach(function (wk) {
      var er = wk.err; if (!er) return;
      if (!er.walking) {                                            /* standing at the destination, talking or filing */
        er.hold -= dt;
        if (er.hold <= 0) { er.pts = route([wk.ex, wk.ey], seatOf(wk)); er.k = 0; er.walking = true; er.back = true; er.talk = false; }
        return;
      }
      var tg = er.pts[er.k], dx = tg[0] - wk.ex, dy = tg[1] - wk.ey, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < .05) {
        er.k++;
        if (er.k >= er.pts.length) {
          if (er.back) { wk.err = null; return; }
          er.walking = false; er.hold = 2.5 + rnd() * 3; er.dir = er.face * wallDir(walls[0]); er.talk = true;
        }
        return;
      }
      var st = Math.min(dist, 1.7 * dt); wk.ex += dx / dist * st; wk.ey += dy / dist * st;
      var sdx = proj(wk.ex + dx / dist, wk.ey + dy / dist, 0)[0] - proj(wk.ex, wk.ey, 0)[0];
      if (Math.abs(sdx) > .3) er.dir = sdx > 0 ? 1 : -1;
      wk.ph += dt * 9;
    });
  }
  function tick(dt) {
    workers.forEach(function (wk) {
      wk.nt -= dt;
      if (wk.nt <= 0) { wk.tx = (rnd() - .5) * 11.5; wk.ty = (rnd() - .5) * 7.5; wk.nt = .35 + rnd() * .9; }
      var dx = wk.tx - wk.x, dy = wk.ty - wk.y, dist = Math.sqrt(dx * dx + dy * dy) || 1, st = Math.min(dist, 7 * dt);
      wk.x += dx / dist * st; wk.y += dy / dist * st;
      var sdx = proj(wk.x + dx / dist, wk.y + dy / dist, 0)[0] - proj(wk.x, wk.y, 0)[0];
      if (Math.abs(sdx) > .5) wk.dir = sdx > 0 ? 1 : -1;
    });
    papers.forEach(function (pp) { if (pp.fly) pp.ph = (pp.ph + pp.spd * dt) % 1; });
  }

  /* where a sheet goes when it leaves the room: the empty space above and left of the office
     on wide screens, the band above it on phones */
  function outTarget(pp) {
    if (W > 900) {
      return pp.tx < .72
        ? [W * (.04 + pp.tx / .72 * .56), H * (.06 + pp.ty * .4)]
        : [W * (.62 + (pp.tx - .72) / .28 * .33), H * (.04 + pp.ty * .16)];
    }
    return [W * (.03 + pp.tx * .94), H * (.03 + pp.ty * .2)];
  }

  /* a little employee: shadow, legs that run, a body, swinging arms, a head with hair, maybe a sheet of paper */
  function person(x, y, wk, run, seated, dir, walking, talk, pp) {
    var sc = u * zoom, pt = proj(x, y, 0), lk = wk.look, line = C('line');
    var shirt = mix([lk.shirt[0] * .55 + 40, lk.shirt[1] * .55 + 40, lk.shirt[2] * .55 + 40], lk.shirt, h);
    var hair = mix([lk.hair[0] * .6 + 30, lk.hair[1] * .6 + 30, lk.hair[2] * .6 + 30], lk.hair, h);
    var skin = C('skin'), ph = wk.ph, moving = e < .98 || walking, swing = moving ? Math.sin(ph) : 0, bob = moving ? Math.abs(Math.cos(ph)) * sc * .06 : 0;
    var t = reduce ? 0 : tnow, idle = !moving && !reduce;
    var nod = idle ? Math.sin(t * 1.6 + wk.i * 1.3) * sc * .03 : 0;              /* a slow nod once settled */
    var type = idle && seated ? Math.sin(t * 11 + wk.i) * sc * .05 : 0;           /* fingers on the keyboard */
    var gesture = idle && !seated && pp == null ? (Math.sin(t * 2.2 + wk.i * 2) + 1) / 2 : 0;  /* talking with the hands */
    if (pp != null) bob = Math.abs(pp) * sc * .03;                                  /* knees bend into the shot */
    var cyc = (t * .18 + wk.i * .37) % 1, stretch = idle && seated && cyc > .9 ? Math.sin((cyc - .9) * 31.4) : 0;   /* a quick stretch every few seconds */
    cx.save(); cx.translate(pt[0], pt[1]); cx.scale(dir, 1);
    if (moving && run > .3) cx.transform(1, 0, -.12 * run, 1, 0, 0);               /* leaning into the run */
    cx.lineWidth = Math.max(1, sc * .035); cx.strokeStyle = line; cx.lineCap = 'round'; cx.lineJoin = 'round';
    cx.fillStyle = 'rgba(0,0,0,.2)'; cx.beginPath(); cx.ellipse(0, 0, sc * .26, sc * .11, 0, 0, 6.283); cx.fill();
    var hipY = -sc * .46 - bob, bodyTop = -sc * .84 - bob, headY = -sc * 1.0 - bob;
    if (seated) { hipY = -sc * .3; bodyTop = -sc * .66; headY = -sc * .82; }
    /* legs */
    cx.fillStyle = mix([70, 70, 74], [74, 70, 64], h);
    if (!seated) {
      [1, -1].forEach(function (side) {
        var kx = side * swing * sc * .16, ky = run ? -Math.max(0, side * swing) * sc * .08 : 0;
        cx.beginPath(); cx.moveTo(side * sc * .07, hipY); cx.lineTo(side * sc * .07 + kx, ky); cx.lineWidth = Math.max(2, sc * .1); cx.strokeStyle = cx.fillStyle; cx.stroke();
        cx.fillStyle = line; cx.beginPath(); cx.ellipse(side * sc * .07 + kx + sc * .03, ky, sc * .08, sc * .045, 0, 0, 6.283); cx.fill(); cx.fillStyle = mix([70, 70, 74], [74, 70, 64], h);
      });
    }
    cx.lineWidth = Math.max(1, sc * .035); cx.strokeStyle = line;
    /* body */
    cx.fillStyle = shirt; roundRect(-sc * .19, bodyTop, sc * .38, hipY - bodyTop + sc * .04, sc * .09); cx.fill(); cx.stroke();
    if (lk.tie) { cx.fillStyle = mix([60, 60, 64], [185, 87, 58], h); cx.beginPath(); cx.moveTo(0, bodyTop + sc * .02); cx.lineTo(sc * .04, bodyTop + sc * .2); cx.lineTo(0, bodyTop + sc * .26); cx.lineTo(-sc * .04, bodyTop + sc * .2); cx.closePath(); cx.fill(); }
    /* arms */
    cx.lineWidth = Math.max(2, sc * .08); cx.strokeStyle = shirt;
    var aSw = seated ? 0 : (moving ? -swing : .15);
    [1, -1].forEach(function (side) {
      var ax = side * sc * .2, ay = bodyTop + sc * .06;
      var ex = ax + side * sc * .04 + (seated ? sc * .18 : side * aSw * sc * .16), ey = ay + (seated ? sc * .1 + type * side : sc * .26);
      if (stretch) { ex = ax + side * sc * .12 * stretch + (1 - stretch) * (ex - ax); ey = lerp(ey, ay - sc * .34, stretch); }   /* both arms up */
      if (gesture && side === 1) { ex = ax + sc * .22; ey = ay - sc * .02 - gesture * sc * .22; }     /* the near arm comes up as they talk */
      if (pp != null && side === 1) { var m = (pp + 1) / 2; ex = lerp(ax - sc * .06, ax + sc * .32, m); ey = lerp(ay + sc * .2, ay - sc * .06, m); }   /* forehand: wound up, then through */
      if (gesture && side === -1 && wk.i === 8) { ex = ax - sc * .1 + gesture * sc * .12; ey = ay - sc * .12; }   /* the one at the board keeps writing */
      cx.beginPath(); cx.moveTo(ax, ay); cx.lineTo(ex, ey); cx.stroke();
      cx.fillStyle = skin; cx.beginPath(); cx.arc(ex, ey, sc * .05, 0, 6.283); cx.fill();
      if (pp != null && side === 1) {                                                /* the paddle */
        var hx = ex - ax, hy = ey - ay, hl = Math.sqrt(hx * hx + hy * hy) || 1, px = ex + hx / hl * sc * .14, py = ey + hy / hl * sc * .14;
        cx.save(); cx.strokeStyle = line; cx.lineWidth = Math.max(1, sc * .035); cx.beginPath(); cx.moveTo(ex, ey); cx.lineTo(px, py); cx.stroke();
        cx.fillStyle = '#B9573A'; cx.beginPath(); cx.arc(px, py, sc * .085, 0, 6.283); cx.fill(); cx.stroke(); cx.restore();
      }
      if (side === 1 && wk.paper && (run || (walking && wk.err && !wk.err.back))) { cx.fillStyle = C('paper'); cx.save(); cx.translate(ex, ey); cx.rotate(.3); cx.fillRect(-sc * .02, -sc * .18, sc * .2, sc * .26); cx.lineWidth = 1; cx.strokeStyle = line; cx.strokeRect(-sc * .02, -sc * .18, sc * .2, sc * .26); cx.restore(); }
    });
    cx.lineWidth = Math.max(1, sc * .035); cx.strokeStyle = line;
    /* head and hair */
    headY += nod;
    cx.fillStyle = skin; cx.beginPath(); cx.arc(0, headY, sc * .17, 0, 6.283); cx.fill(); cx.stroke();
    cx.fillStyle = hair;
    if (lk.style === 'cap') { cx.beginPath(); cx.arc(0, headY - sc * .02, sc * .17, Math.PI, 0); cx.fill(); cx.fillRect(-sc * .02, headY - sc * .06, sc * .26, sc * .05); }
    else if (lk.style === 'bun') { cx.beginPath(); cx.arc(0, headY - sc * .03, sc * .17, Math.PI * .95, Math.PI * 2.05); cx.fill(); cx.beginPath(); cx.arc(-sc * .12, headY - sc * .16, sc * .07, 0, 6.283); cx.fill(); }
    else if (lk.style === 'long') { cx.beginPath(); cx.arc(0, headY - sc * .02, sc * .17, Math.PI, 0); cx.fill(); cx.fillRect(-sc * .17, headY - sc * .02, sc * .07, sc * .22); }
    else { cx.beginPath(); cx.arc(0, headY - sc * .03, sc * .17, Math.PI * .9, Math.PI * 2.1); cx.fill(); }
    /* a drop of sweat while it is chaos */
    if (run > .5 && (wk.i % 3 === 0)) { cx.fillStyle = mix([150, 170, 190], [150, 170, 190], 0); cx.beginPath(); cx.arc(sc * .2, headY - sc * .08 + (Math.sin(wk.ph * .7) > 0 ? 0 : sc * .04), sc * .035, 0, 6.283); cx.fill(); }
    /* a few words, taking turns */
    if (talk && idle && Math.floor(t / 1.3 + wk.i) % 2 === 0) {
      cx.save(); cx.scale(dir, 1);                                   /* the bubble keeps its shape whichever way they face */
      var bx = dir * sc * .3, by = headY - sc * .36;
      cx.fillStyle = C('paper'); cx.strokeStyle = line; cx.lineWidth = Math.max(1, sc * .03);
      roundRect(bx - sc * .22, by - sc * .12, sc * .44, sc * .24, sc * .08); cx.fill(); cx.stroke();
      cx.beginPath(); cx.moveTo(bx - dir * sc * .1, by + sc * .12); cx.lineTo(bx - dir * sc * .18, by + sc * .2); cx.lineTo(bx - dir * sc * .02, by + sc * .12); cx.closePath(); cx.fill();
      cx.fillStyle = C('text'); var on = Math.floor(t * 4) % 3;
      for (var k = 0; k < 3; k++) { cx.globalAlpha = k <= on ? 1 : .3; cx.beginPath(); cx.arc(bx + (k - 1) * sc * .11, by, sc * .03, 0, 6.283); cx.fill(); }
      cx.restore();
    }
    cx.restore();
  }

  /* things that should not be on the floor; they fade out as the office is handled */
  function drawClutter(items, line) {
    var a = 1 - smooth(e, 0, .6); if (a <= 0) return;
    var sc = u * zoom;
    clutter.forEach(function (c) {
      if (c.kind === 'cable') {
        items.push({ z: -999, f: function () {
          cx.save(); cx.globalAlpha = a; cx.strokeStyle = C('line'); cx.lineWidth = Math.max(1, sc * .05); cx.beginPath();
          c.pts.forEach(function (q, i) { var p2 = proj(q[0], q[1], .02); if (i) cx.lineTo(p2[0], p2[1]); else cx.moveTo(p2[0], p2[1]); });
          cx.stroke(); cx.restore();
        } });
        return;
      }
      if (c.kind === 'stain') {
        items.push({ z: -998, f: function () {
          var q = proj(c.x, c.y, .01); cx.save(); cx.globalAlpha = a * .5; cx.fillStyle = mix([40, 32, 26], [120, 80, 50], h);
          cx.beginPath(); cx.ellipse(q[0], q[1], sc * c.s * .5, sc * c.s * .25, 0, 0, 6.283); cx.fill(); cx.restore();
        } });
        return;
      }
      items.push({ z: depth(c.x, c.y), f: function () {
        cx.save(); cx.globalAlpha = a;
        if (c.kind === 'mug') { cuboid(c.x, c.y, 0, .22, .22, .22, c.a, C('paper'), C('paper'), mix(CH.deskSide, CA.deskSide, h), line); var q = proj(c.x, c.y, .22); cx.fillStyle = mix([60, 44, 32], [110, 70, 40], h); cx.beginPath(); cx.ellipse(q[0], q[1], sc * .07, sc * .035, 0, 0, 6.283); cx.fill(); }
        else if (c.kind === 'chair') { cuboid(c.x, c.y, 0, .9, .5, .3, c.a, C('chair'), C('chair'), mix(CH.chair, CA.chair, h), line); cuboid(c.x + .3, c.y + .2, 0, .5, .12, .55, c.a + .3, C('chair'), C('chair'), C('chair'), line); }
        else if (c.kind === 'plant') { var q2 = proj(c.x + .4, c.y + .3, .01); cx.fillStyle = mix([36, 30, 26], [90, 64, 40], h); cx.beginPath(); cx.ellipse(q2[0], q2[1], sc * .4, sc * .2, 0, 0, 6.283); cx.fill(); cuboid(c.x, c.y, 0, .6, .5, .35, c.a, C('pot'), C('pot'), mix(CH.pot, CA.pot, h), line); var q3 = proj(c.x + .5, c.y + .4, .15); cx.fillStyle = C('plant'); for (var s = 0; s < 3; s++) { cx.beginPath(); cx.ellipse(q3[0] + s * sc * .14, q3[1] + (s % 2) * sc * .06, sc * .22, sc * .13, .4, 0, 6.283); cx.fill(); cx.strokeStyle = line; cx.lineWidth = 1; cx.stroke(); } }
        cx.restore();
      } });
    });
  }

  /* draw on a wall in local units: lx runs along the wall, ly runs down it, 100 units to a tile */
  function onWallLocal(wl, u0, z0, fn) {
    var dir = wallDir(wl);                       /* so the drawing always reads left to right */
    var O = wl.axis === 'x' ? proj(u0, wl.face, z0) : proj(wl.face, u0, z0);
    var ex = wl.axis === 'x' ? proj(u0 + dir, wl.face, z0) : proj(wl.face, u0 + dir, z0);
    var ey = wl.axis === 'x' ? proj(u0, wl.face, z0 - 1) : proj(wl.face, u0, z0 - 1);
    var ux = (ex[0] - O[0]) / 100, uy = (ex[1] - O[1]) / 100, vx = (ey[0] - O[0]) / 100, vy = (ey[1] - O[1]) / 100;
    cx.save(); cx.setTransform(dpr * ux, dpr * uy, dpr * vx, dpr * vy, dpr * O[0], dpr * O[1]); fn(); cx.restore();
  }
  /* which way along the wall reads left to right on screen right now */
  function wallDir(wl) {
    var a = wl.axis === 'x' ? proj(0, wl.face, 1) : proj(wl.face, 0, 1), b = wl.axis === 'x' ? proj(1, wl.face, 1) : proj(wl.face, 1, 1);
    return b[0] >= a[0] ? 1 : -1;
  }

  /* ── the rally: where the ball is and who is swinging, from the clock ── */
  function rally() {
    var tau = (tnow / .62) % 2, leg = Math.floor(tau), uu = tau - leg;
    var xa = PP.x - PP.w / 2 - .3, xb = PP.x + PP.w / 2 + .3;
    var bx = leg ? lerp(xb, xa, uu) : lerp(xa, xb, uu);
    var bz = PP.h + .08 + (uu < .6 ? .5 * Math.sin(Math.PI * uu / .6) : .28 * Math.sin(Math.PI * (uu - .6) / .4));
    var by = PP.y + Math.sin(tau * Math.PI) * .18;
    function swing(k) { var sw = (tau + 2 - k) % 2; return sw < .3 ? 1 - sw / .3 : (sw > 1.6 ? -(sw - 1.6) / .4 : 0); }   /* 1 just after the hit, -1 wound up */
    return { x: bx, y: by, z: bz, sw: [swing(0), swing(1)] };
  }

  /* ── draw one frame ── */
  function draw() {
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var game = (e >= .98 && !reduce) ? rally() : null;
    ocy = W > 900 ? H * .52 : H * (.3 - .09 * e);   /* on phones the calm office sits higher, clear of the copy */
    cx.fillStyle = C('bg'); cx.fillRect(0, 0, W, H);
    var line = C('line'), sc = u * zoom, items = [], flight = [];
    var jit = scurry ? 1 - e / .35 : 0;

    /* turntable slab and tiles */
    cuboid(0, 0, -.35, FLOOR.w + .9, FLOOR.d + .9, .35, 0, C('slab'), C('slab'), mix(CH.slab, CA.slab, h), line);
    for (var ix = 0; ix < FLOOR.w; ix++) for (var iy = 0; iy < FLOOR.d; iy++) {
      var x0 = ix - FLOOR.w / 2, y0 = iy - FLOOR.d / 2;
      poly([proj(x0, y0, 0), proj(x0 + 1, y0, 0), proj(x0 + 1, y0 + 1, 0), proj(x0, y0 + 1, 0)], (ix + iy) % 2 ? C('tileA') : C('tileB'));
    }

    /* the walls at the back: a wall is drawn only while it faces away from the viewer, so the room stays open */
    walls.forEach(function (wl) {
      var n = rot(wl.n[0], wl.n[1]), a = clamp(-(n[0] + n[1]) / .4, 0, 1);
      if (a <= 0) return;
      cx.globalAlpha = a;
      wl.face = wl.axis === 'x' ? wl.y - wl.n[1] * WALL_T / 2 : wl.x - wl.n[0] * WALL_T / 2;   /* the inner face */
      cuboid(wl.x, wl.y, 0, wl.w, wl.d, WALL_H, 0, C('wallTop'), C('wall'), mix(CH.wall, CA.wall, h), line);
      /* baseboard */
      onWall(wl, -(wl.axis === 'x' ? wl.w : wl.d) / 2, (wl.axis === 'x' ? wl.w : wl.d) / 2, 0, .12, mix(CH.wallTop, CA.wallTop, h), null);
      /* windows: a pane, a frame and a mullion */
      wl.windows.forEach(function (win) {
        onWall(wl, win[0], win[1], 1.05, 2.15, C('pane'), line);
        onWall(wl, win[0] - .08, win[1] + .08, 2.15, 2.23, C('wallTop'), line);
        onWall(wl, win[0] - .08, win[1] + .08, .97, 1.05, C('wallTop'), line);
        var m = (win[0] + win[1]) / 2;
        onWall(wl, m - .03, m + .03, 1.05, 2.15, C('wallTop'), null);
        onWall(wl, win[0], win[1], 1.57, 1.63, C('wallTop'), null);
        if (h > .5) { cx.globalAlpha = a * (h - .5) * 1.4; onWall(wl, win[0] + .1, m - .1, 1.15, 2.05, 'rgba(255,255,255,.45)', null); cx.globalAlpha = a; }
        /* shattered: a web of cracks and missing shards, gone once the office is handled */
        if (wl.door && e < 1) {
          var ca = a * (1 - smooth(e, .2, .8));
          cx.globalAlpha = ca;
          var wd = wallDir(wl), u0 = wd > 0 ? win[0] : win[1];
          onWallLocal(wl, u0, 2.15, function () {
            var w = (win[1] - win[0]) * 100, hh = 110, ix = w * .42, iy = 52;   /* impact point */
            cx.beginPath(); cx.rect(0, 0, w, hh); cx.clip();
            cx.strokeStyle = C('line'); cx.lineWidth = 2.2; cx.lineCap = 'round';
            for (var k = 0; k < 11; k++) {
              var an = k / 11 * 6.283 + Math.sin(k * 7.3) * .2, len = 90 + ((k * 31) % 60);
              cx.beginPath(); cx.moveTo(ix, iy);
              var px2 = ix, py2 = iy;
              for (var sgm = 1; sgm <= 3; sgm++) { px2 = ix + Math.cos(an + Math.sin(k + sgm) * .18) * len * sgm / 3; py2 = iy + Math.sin(an + Math.cos(k + sgm) * .18) * len * sgm / 3; cx.lineTo(px2, py2); }
              cx.stroke();
            }
            cx.lineWidth = 1.4;
            [22, 44, 70].forEach(function (r) { cx.beginPath(); for (var k2 = 0; k2 <= 12; k2++) { var an2 = k2 / 12 * 6.283, rr = r + Math.sin(k2 * 2.1 + r) * 5; var qx = ix + Math.cos(an2) * rr * 1.25, qy = iy + Math.sin(an2) * rr; if (k2) cx.lineTo(qx, qy); else cx.moveTo(qx, qy); } cx.stroke(); });
            cx.fillStyle = C('line');
            cx.beginPath(); cx.moveTo(w, 0); cx.lineTo(w - 46, 0); cx.lineTo(w - 30, 18); cx.lineTo(w - 14, 8); cx.lineTo(w, 26); cx.closePath(); cx.fill();
            cx.beginPath(); cx.moveTo(0, hh); cx.lineTo(0, hh - 34); cx.lineTo(14, hh - 22); cx.lineTo(26, hh - 30); cx.lineTo(38, hh); cx.closePath(); cx.fill();
          });
          cx.globalAlpha = a;
        }
      });
      /* the side wall: a poster that tells the truth, and a clock */
      if (wl.poster) {
        var wd2 = wallDir(wl), pu = wl.poster[0], pw = wl.poster[1] - wl.poster[0], tilt = (1 - e) * -.07;
        onWallLocal(wl, wd2 > 0 ? pu : pu + pw, 2.35, function () {
          var w = pw * 100, hh = 120;
          cx.translate(w / 2, hh / 2); cx.rotate(tilt); cx.translate(-w / 2, -hh / 2);
          cx.fillStyle = mix([150, 148, 140], [252, 250, 245], h); cx.strokeStyle = C('line'); cx.lineWidth = 3; cx.fillRect(0, 0, w, hh); cx.strokeRect(0, 0, w, hh);
          cx.fillStyle = e > .5 ? '#2E8B4E' : C('line'); cx.font = '700 16px Instrument Sans, system-ui, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'alphabetic';
          cx.fillText(e > .5 ? 'HANDLED' : 'SHIP HAPPENS', w / 2, 22);
          cx.fillStyle = C('line'); cx.font = '500 8px ui-monospace, Menlo, monospace'; cx.fillText(e > .5 ? 'every load, on time' : 'q4 so far', w / 2, 34);
          if (e > .5) {                                                                  /* the climb, with the ground under it shaded green */
            cx.fillStyle = 'rgba(46,139,78,.18)'; cx.beginPath(); cx.moveTo(12, 96); cx.lineTo(34, 88); cx.lineTo(52, 92); cx.lineTo(74, 66); cx.lineTo(w - 14, 50); cx.lineTo(w - 14, 108); cx.lineTo(12, 108); cx.closePath(); cx.fill();
          }
          cx.lineWidth = e > .5 ? 5 : 4; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = e > .5 ? '#2E8B4E' : mix([150, 72, 60], [185, 87, 58], h);
          cx.beginPath();
          if (e > .5) { cx.moveTo(12, 96); cx.lineTo(34, 88); cx.lineTo(52, 92); cx.lineTo(74, 66); cx.lineTo(w - 14, 50); cx.moveTo(w - 30, 50); cx.lineTo(w - 14, 50); cx.lineTo(w - 16, 64); }
          else { cx.moveTo(12, 48); cx.lineTo(30, 60); cx.lineTo(42, 52); cx.lineTo(60, 84); cx.lineTo(70, 74); cx.lineTo(w - 16, 104); cx.moveTo(w - 30, 102); cx.lineTo(w - 16, 104); cx.lineTo(w - 18, 90); }
          cx.stroke();
          cx.fillStyle = mix([120, 120, 124], [196, 170, 136], h);
          [[6, 6], [w - 6, 6], [6, hh - 6], [w - 6, hh - 6]].forEach(function (q) { cx.beginPath(); cx.arc(q[0], q[1], 3.5, 0, 6.283); cx.fill(); cx.lineWidth = 1; cx.strokeStyle = C('line'); cx.stroke(); });
          cx.textAlign = 'left';
        });
        /* the clock */
        var cu = wl.poster[1] + .9;
        onWallLocal(wl, wd2 > 0 ? cu : cu + .5, 2.25, function () {
          cx.translate(25, 25); cx.rotate((1 - e) * .35);
          cx.fillStyle = C('paper'); cx.strokeStyle = C('line'); cx.lineWidth = 2.5; cx.beginPath(); cx.arc(0, 0, 22, 0, 6.283); cx.fill(); cx.stroke();
          cx.lineWidth = 2.5; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(0, -14); cx.moveTo(0, 0); cx.lineTo(e > .5 ? 9 : -10, e > .5 ? -6 : 8); cx.stroke();
          cx.fillStyle = C('line'); cx.beginPath(); cx.arc(0, 0, 2, 0, 6.283); cx.fill();
        });
      }
      /* the whiteboard: scrawl in chaos, a tidy plan once it's handled */
      if (wl.board) {
        onWall(wl, wl.board[0], wl.board[1], 1.2, 2.0, C('board'), line);
        if (e < .5) {
          var wd3 = wallDir(wl), b0 = wd3 > 0 ? wl.board[0] : wl.board[1];
          onWallLocal(wl, b0, 2.0, function () {
            cx.globalAlpha = a * (1 - e * 2);
            [[8, 10, .12], [40, 30, -.2], [66, 12, .25], [24, 46, -.1], [58, 50, .18], [88, 40, -.3]].forEach(function (n, k) {
              cx.save(); cx.translate(n[0] + 8, n[1] + 8); cx.rotate(n[2]); cx.fillStyle = k % 2 ? mix([160, 150, 100], [230, 210, 120], h) : mix([150, 130, 130], [230, 190, 180], h);
              cx.fillRect(-8, -8, 16, 16); cx.strokeStyle = C('line'); cx.lineWidth = 1; cx.strokeRect(-8, -8, 16, 16); cx.restore();
            });
          });
          cx.globalAlpha = a;
        }
        cx.strokeStyle = C('ink'); cx.lineWidth = Math.max(1, sc * .04);
        for (var s = 0; s < 4; s++) {
          var z1 = 1.86 - s * .17, len = e > .5 ? .9 - s * .15 : .55 + ((s * 37) % 5) / 10, wob = (1 - e) * .05;
          var q1 = wl.axis === 'x' ? proj(wl.board[0] + .12, wl.face, z1 + wob) : proj(wl.face, wl.board[0] + .12, z1 + wob);
          var q2 = wl.axis === 'x' ? proj(wl.board[0] + .12 + len, wl.face, z1 - wob) : proj(wl.face, wl.board[0] + .12 + len, z1 - wob);
          cx.beginPath(); cx.moveTo(q1[0], q1[1]); cx.lineTo(q2[0], q2[1]); cx.stroke();
        }
      }
      /* the door across the hall, in the back wall, with the Valence V on its lit panel */
      if (wl.door) {
        var pts = onWall(wl, DOOR.x - .72, DOOR.x + .72, 0, 2.25, C('panel'), null);
        onWall(wl, DOOR.x - .86, DOOR.x - .72, 0, 2.38, C('door'), line);
        onWall(wl, DOOR.x + .72, DOOR.x + .86, 0, 2.38, C('door'), line);
        onWall(wl, DOOR.x - .86, DOOR.x + .86, 2.25, 2.38, C('door'), line);
        if (h > .05) {
          var mx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4, my = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4, r = sc * .5;
          cx.save(); cx.globalAlpha = a * h; cx.strokeStyle = C('line'); cx.lineCap = 'round';
          cx.lineWidth = Math.max(2, sc * .11); cx.beginPath(); cx.moveTo(mx - r * .45, my - r * .45); cx.lineTo(mx, my + r * .45); cx.stroke();
          cx.lineWidth = Math.max(1, sc * .04); cx.beginPath(); cx.moveTo(mx, my + r * .45); cx.lineTo(mx + r * .45, my - r * .45); cx.stroke();
          cx.lineWidth = Math.max(1, sc * .03); cx.beginPath(); cx.arc(mx, my, r * .85, 0, 6.283); cx.stroke();
          var ea = -Math.PI * .25 + (1 - h) * Math.PI * 3;    /* the electron travels the ring and docks at the tip */
          cx.fillStyle = '#B9573A'; cx.beginPath(); cx.arc(mx + Math.cos(ea) * r * .85, my + Math.sin(ea) * r * .85, Math.max(2, sc * .07), 0, 6.283); cx.fill();
          cx.restore();
        }
      }
      cx.globalAlpha = 1;
    });

    /* paper: on the floor, in the air, out of the room, or landing on a desk */
    papers.forEach(function (pp) {
      var out = smooth(p, .1 + pp.delay * .18, .42 + pp.delay * .18);        /* leaves the room */
      var land = smooth(p, .52 + pp.delay * .1, .84 + pp.delay * .1);        /* lands on its desk */
      var gx = pp.desk.x + .72, gy = pp.desk.y - .05, gz = .78 + pp.k * .035;
      if (out < .02) {
        if (pp.fly) {
          var x = lerp(pp.ax, pp.bx, pp.ph), y = lerp(pp.ay, pp.by, pp.ph), z = Math.sin(pp.ph * Math.PI) * 2 + .2;
          items.push({ z: depth(x, y) + z, f: function () { sheet(x, y, z, .5, .35, pp.fa + tnow * 2, C('paper'), line); } });
        } else {
          sheet(pp.fx, pp.fy, .01, .55, .4, pp.fa, C('paper'), line);
        }
        return;
      }
      if (land > .98) {
        items.push({ z: depth(gx, gy) + 1, f: function () { sheet(gx, gy, gz, .22, .16, 0, C('paper'), line); } });
        return;
      }
      /* in flight: blend screen positions, then put the sheet back into the plan so it draws in perspective */
      var from = pp.fly ? proj(lerp(pp.ax, pp.bx, pp.ph), lerp(pp.ay, pp.by, pp.ph), Math.sin(pp.ph * Math.PI) * 2 + .2) : proj(pp.fx, pp.fy, .01);
      var tgt = outTarget(pp), f = reduce ? 0 : 1;
      var sx = lerp(from[0], tgt[0] + Math.sin(tnow * .7 + pp.drift) * 7 * f, out), sy = lerp(from[1], tgt[1] + Math.cos(tnow * .5 + pp.drift) * 6 * f, out);
      var dp = proj(gx, gy, gz);
      sx = lerp(sx, dp[0], land); sy = lerp(sy, dp[1], land);
      var ang = (pp.fa + out * pp.spin + tnow * .3 * f) * (1 - land);
      var size = lerp(lerp(.5, .42, out), .22, land), sized = lerp(lerp(.35, .3, out), .16, land);
      var pl = unproj(sx, sy, 0);
      flight.push(function () { sheet(pl[0], pl[1], 0, size, sized, ang, C('paper'), line); });
    });

    /* collect sortable items */
    drawClutter(items, line);
    desks.forEach(function (d, i) {
      var wob = jit * Math.sin(tnow * 14 + d.j) * .06;
      var x = d.x + d.ox * (1 - e), y = d.y + d.oy * (1 - e), ang = d.oa * (1 - e) + wob;
      items.push({ z: depth(x, y), f: function () {
        cuboid(x, y, 0, 2, 1, .75, ang, C('desk'), C('desk'), C('deskSide'), line);
        var mx = x - Math.sin(ang) * .05, my = y - Math.cos(ang) * .18;
        cuboid(mx, my, .75, .9, .08, .55, ang, C('mon'), C('mon'), C('mon'), line);
        var sp = proj(mx, my, 1.02);
        cx.fillStyle = C('screen'); cx.fillRect(sp[0] - sc * .36, sp[1] - sc * .18, sc * .72, sc * .36);
        if (h > .5) { cx.fillStyle = mix(CH.text, CA.panel, 1); cx.fillRect(sp[0] - sc * .3, sp[1] - sc * .1, sc * .4, sc * .04); cx.fillRect(sp[0] - sc * .3, sp[1], sc * .25, sc * .04); }
        else { cx.fillStyle = C('alert'); cx.font = '700 ' + Math.round(sc * .28) + 'px Instrument Sans, system-ui, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('!', sp[0], sp[1] + 1); cx.textAlign = 'left'; }
        /* keyboard and a mug */
        cuboid(x + Math.sin(ang) * .2, y + Math.cos(ang) * .22, .75, .7, .22, .05, ang, C('deskSide'), C('deskSide'), C('deskSide'), line);
        cuboid(x + .7 * Math.cos(ang), y - .7 * Math.sin(ang), .75, .2, .2, .2, ang, C('paper'), C('paper'), C('deskSide'), line);
        /* the phone rings while it is chaos */
        if (i % 2 === 0) {
          var phx = x - .7 * Math.cos(ang), phy = y + .7 * Math.sin(ang);
          cuboid(phx, phy, .75, .3, .22, .1, ang, C('mon'), C('mon'), C('mon'), line);
          if (e < .5) { var pq = proj(phx, phy, 1.0); cx.strokeStyle = C('alert'); cx.lineWidth = Math.max(1, sc * .04); cx.globalAlpha = (1 - e * 2) * (Math.sin(tnow * 12 + i) > 0 ? 1 : .35);
            cx.beginPath(); cx.arc(pq[0], pq[1], sc * .14, -1.1, -.3); cx.stroke(); cx.beginPath(); cx.arc(pq[0], pq[1], sc * .22, -1.1, -.3); cx.stroke(); cx.globalAlpha = 1; }
        }
      } });
      var cxp = x + Math.sin(ang) * .95, cyp = y + Math.cos(ang) * .95;
      items.push({ z: depth(cxp, cyp), f: function () { cuboid(cxp, cyp, 0, .6, .6, .45, ang, C('chair'), C('chair'), mix(CH.chair, CA.chair, h), line); cuboid(cxp + Math.sin(ang) * .25, cyp + Math.cos(ang) * .25, .45, .6, .1, .5, ang, C('chair'), C('chair'), C('chair'), line); } });
      if (i % 3 !== 1 && e < 1) {
        var ap = proj(x, y, 1.9 + Math.sin(tnow * 6 + i) * .08 * jit);
        items.push({ z: depth(x, y) + 20, f: function () {
          cx.globalAlpha = 1 - e; cx.fillStyle = C('alert'); cx.beginPath(); cx.arc(ap[0], ap[1], sc * .22, 0, 6.283); cx.fill();
          cx.fillStyle = '#fff'; cx.font = '700 ' + Math.round(sc * .3) + 'px Instrument Sans, system-ui, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('!', ap[0], ap[1] + 1); cx.textAlign = 'left'; cx.globalAlpha = 1;
        } });
      }
    });
    workers.forEach(function (wk) {
      var gx, gy, seated = false, faceDir = wk.dir, walking = false, talk = false;
      if (wk.desk) { var d = wk.desk, ang = d.oa * (1 - e); gx = d.x + Math.sin(ang) * .95; gy = d.y + Math.cos(ang) * .95; seated = e > .6; }
      else { gx = wk.post.x; gy = wk.post.y; if (e > .6) { faceDir = wk.post.face * wallDir(walls[0]); talk = wk.i === 10 || wk.i === 11; } }
      var x = lerp(wk.x, gx, e), y = lerp(wk.y, gy, e), pp = null;
      if (wk.err) { x = wk.ex; y = wk.ey; seated = false; faceDir = wk.err.dir; walking = wk.err.walking; talk = wk.err.talk; }
      else if (seated && !reduce) { var look = (tnow * .11 + wk.i * .53) % 1; if (look > .8 && look < .94) faceDir = -faceDir; }   /* a glance over the shoulder now and then */
      else if (wk.post && wk.post.pp != null && game) pp = game.sw[wk.post.pp];
      var run = jit;                                   /* 1 while scurrying, 0 once settled */
      items.push({ z: depth(x, y) + .01, f: function () { person(x, y, wk, run, seated, faceDir, walking, talk, pp); } });
    });
    /* the ping-pong table arrives with the calm, the ball only once everyone is settled */
    var ta = smooth(e, .72, .98);
    if (ta > 0) {
      items.push({ z: depth(PP.x, PP.y), f: function () {
        cx.save(); cx.globalAlpha = ta;
        [-1, 1].forEach(function (k) { cuboid(PP.x + k * (PP.w / 2 - .18), PP.y, 0, .1, PP.d - .3, PP.h - .06, 0, '#3F3D38', '#3F3D38', '#2A2925', line); });
        cuboid(PP.x, PP.y, PP.h - .06, PP.w, PP.d, .06, 0, '#5E8C6A', '#4B7255', '#3E6148', line);
        cx.strokeStyle = '#F4F1EA'; cx.lineWidth = Math.max(1, sc * .025); cx.beginPath();
        var a1 = proj(PP.x - PP.w / 2 + .06, PP.y, PP.h), a2 = proj(PP.x + PP.w / 2 - .06, PP.y, PP.h); cx.moveTo(a1[0], a1[1]); cx.lineTo(a2[0], a2[1]);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c, i) { var q = proj(PP.x + c[0] * (PP.w / 2 - .06), PP.y + c[1] * (PP.d / 2 - .06), PP.h); if (i) cx.lineTo(q[0], q[1]); else cx.moveTo(q[0], q[1]); });
        cx.closePath(); cx.stroke();
        cuboid(PP.x, PP.y, PP.h, .04, PP.d + .08, .16, 0, '#F4F1EA', '#E6E1D6', '#D8D2C4', line);   /* the net */
        cx.restore();
      } });
      if (game) {
        items.push({ z: depth(game.x, game.y) + game.z, f: function () {
          var sh = proj(game.x, game.y, PP.h), q = proj(game.x, game.y, game.z);
          cx.save(); cx.fillStyle = 'rgba(0,0,0,.22)'; cx.beginPath(); cx.ellipse(sh[0], sh[1], sc * .06, sc * .03, 0, 0, 6.283); cx.fill();
          cx.fillStyle = '#FBF8F1'; cx.strokeStyle = line; cx.lineWidth = 1; cx.beginPath(); cx.arc(q[0], q[1], sc * .055, 0, 6.283); cx.fill(); cx.stroke(); cx.restore();
        } });
      }
    }
    plants.forEach(function (pl) {
      var x = pl.x + pl.ox * (1 - e), y = pl.y + pl.oy * (1 - e);
      items.push({ z: depth(x, y), f: function () {
        cuboid(x, y, 0, .6, .6, .5, 0, C('pot'), C('pot'), mix(CH.pot, CA.pot, h), line);
        var pt = proj(x, y, .5); cx.fillStyle = C('plant');
        for (var s = 0; s < 3; s++) { cx.beginPath(); cx.ellipse(pt[0] + (s - 1) * sc * .18, pt[1] - sc * .3 - (s % 2) * sc * .12, sc * .22, sc * .32, (s - 1) * .5, 0, 6.283); cx.fill(); cx.strokeStyle = line; cx.stroke(); }
      } });
    });
    cabinets.forEach(function (cb) {
      var x = cb.x + cb.ox * (1 - e), y = cb.y + cb.oy * (1 - e), ang = cb.oa * (1 - e);
      items.push({ z: depth(x, y), f: function () { cuboid(x, y, 0, .8, 1, 1.1, ang, C('cab'), C('cab'), C('cabSide'), line); } });
    });
    boxes.forEach(function (bx, i) {
      var x = bx.x + bx.ox * (1 - e), y = bx.y + bx.oy * (1 - e), ang = bx.oa * (1 - e), z = bx.oz * (1 - e) * (i % 2 ? 0 : 1);
      items.push({ z: depth(x, y) + (z ? .5 : 0), f: function () { cuboid(x, y, z, bx.s, bx.s, bx.hh, ang, C('box'), C('box'), C('boxSide'), line); } });
    });

    items.sort(function (a, b) { return a.z - b.z; });
    items.forEach(function (it) { it.f(); });
    flight.forEach(function (f) { f(); });   /* paper in the air draws over everything */

    /* mono callouts beside the action */
    var ch = 1 - smooth(e, 0, .5), ca2 = smooth(e, .6, 1);
    var d1 = desks[1], d6 = desks[6], b0 = boxes[0], w3 = workers[3], q;
    q = proj(d1.x + d1.ox * (1 - e), d1.y + d1.oy * (1 - e), 1.4); label('count from 3PL: 412 //', q[0] + sc * .6, q[1] + (ch < 1 ? 0 : Math.sin(tnow * 9) * 2), ch);
    q = proj(d6.x + d6.ox * (1 - e), d6.y + d6.oy * (1 - e), 1.4); label('co-packer says 380 //', q[0] + sc * .6, q[1], ch);
    q = proj(b0.x + b0.ox * (1 - e), b0.y + b0.oy * (1 - e), 1.6); label('broker: no reply 6h //', q[0] + sc * .5, q[1], ch);
    q = proj(w3.x, w3.y, 1.6); label('truck went quiet //', q[0] + sc * .5, q[1], ch);
    if (W > 900) { q = proj(desks[3].x, desks[3].y, 1.5); label('PO 4471 confirmed //', q[0] + sc * .4, q[1], ca2); }
    else { q = proj(desks[4].x - 1.3, desks[4].y + .6, .3); label('PO 4471 confirmed //', q[0], q[1], ca2, true); }   /* phones: beside the front-left desk */
    q = proj(desks[5].x, desks[5].y, 1.5); label('ETA 2:40 pm //', q[0] + sc * .6, q[1], ca2);
    q = proj(boxes[1].x, boxes[1].y, 1.6); label('3 brands, 1 truck //', q[0] + sc * .5, q[1], ca2);
    q = proj(DOOR.x, DOOR.y, 3.1); label('handled //', q[0] - sc * .9, q[1], ca2);
  }

  /* ── sizing ── */
  function resize() {
    W = stage.clientWidth; H = stage.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var wide = W > 900;
    ocx = wide ? (W > 1500 ? W * .68 : W * .66) : W * .5;    /* a touch further right on very wide screens */
    ocy = wide ? H * .52 : H * .3;
    var span = FLOOR.w + FLOOR.d + 3;
    u = Math.min((wide ? W * .62 : W * 1.05) / span, (wide ? H * .74 : H * .48) / (span * .5 + 3.5));
    /* on phones the copy sits lower while it is chaos, by the height of the lines that are still hidden */
    var copy = sec.querySelector('.intro__copy'), h1 = document.getElementById('hero-title');
    if (copy && h1) {
      var pb = parseFloat(getComputedStyle(copy).paddingBottom) || 0;
      stage.style.setProperty('--intro-drop', Math.max(0, copy.offsetHeight - (h1.offsetTop + h1.offsetHeight) - pb + 6) + 'px');
    }
  }

  /* ── loop: scurry at 12 fps while it is chaos; redraw whenever the scrollbar moved ── */
  var last = 0, acc = 0, dirty = true, lastP = -1;
  function frame(ts) {
    var dt = Math.min(.1, (ts - (last || ts)) / 1000); last = ts; tnow = ts / 1000;
    acc += dt;
    if (!reduce && acc >= 1 / 12) { if (scurry) tick(acc); animate(acc); acc = 0; dirty = true; }
    if (dirty) { draw(); dirty = false; }
    requestAnimationFrame(frame);
  }
  function onScroll() { applyScroll(); if (p !== lastP) { lastP = p; dirty = true; } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { resize(); applyScroll(); dirty = true; });
  if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); dirty = true; }).observe(stage);
  resize(); tick(1 / 12); applyScroll();
  requestAnimationFrame(frame);
})();
