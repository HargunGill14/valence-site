/* Valence home: sample data and side-panel markup for the "How it feels" map demo.
   Fictional customer, generic facility names, real cities and highway routes.
   Shared by the browser (window.ValenceMapData) and scripts/build.mjs (require), which
   pre-renders the overview panel so it reads with JavaScript off. Plain ES5. */
(function (root) {
  'use strict';

  var TODAY = '2026-10-06';
  var ST = {
    'Booked': { dot: '#8C877A', g: '○' },
    'Picked up': { dot: '#4F6B55', g: '↑' },
    'In transit': { dot: '#4F6B55', g: '→' },
    'Delivered': { dot: '#2D4A35', g: '✓' },
    'Exception': { dot: '#B8552F', g: '!' }
  };

  // [lat, lng]
  var PL = {
    'Dinuba, CA': [36.543, -119.387], 'Fresno, CA': [36.737, -119.787], 'Riverside, CA': [33.953, -117.396],
    'Phoenix, AZ': [33.448, -112.074], 'Las Vegas, NV': [36.172, -115.139], 'Sacramento, CA': [38.582, -121.494],
    'Albuquerque, NM': [35.084, -106.650], 'San Diego, CA': [32.716, -117.161], 'Oakland, CA': [37.804, -122.271],
    'Tucson, AZ': [32.222, -110.974], 'Reno, NV': [39.530, -119.814], 'Los Angeles, CA': [34.052, -118.243]
  };

  // Approximate highway waypoints per lane, so routes follow real roads.
  var WP = {
    'Dinuba, CA|Riverside, CA': [[35.373, -119.019], [34.86, -118.17], [34.46, -117.75], [34.10, -117.44]],
    'Fresno, CA|Phoenix, AZ': [[35.373, -119.019], [34.86, -118.17], [34.10, -117.44], [33.98, -116.50], [33.72, -114.62], [33.61, -112.4]],
    'Fresno, CA|Las Vegas, NV': [[35.373, -119.019], [35.12, -118.37], [35.27, -116.07], [35.75, -115.3]],
    'Dinuba, CA|Sacramento, CA': [[36.97, -120.06], [37.64, -120.99], [38.09, -121.27]],
    'Fresno, CA|Albuquerque, NM': [[35.373, -119.019], [35.12, -118.37], [34.9, -117.02], [35.00, -115.4], [35.19, -114.05], [35.2, -111.65], [35.1, -109.0], [35.0, -107.9]],
    'Fresno, CA|San Diego, CA': [[35.373, -119.019], [34.86, -118.17], [34.10, -117.44], [33.6, -117.2], [33.13, -117.1]],
    'Dinuba, CA|Oakland, CA': [[36.97, -120.06], [37.30, -120.48], [37.49, -121.13], [37.70, -121.9]],
    'Fresno, CA|Tucson, AZ': [[35.373, -119.019], [34.86, -118.17], [34.10, -117.44], [33.98, -116.50], [33.72, -114.62], [33.4, -112.4], [32.85, -111.74]],
    'Fresno, CA|Reno, NV': [[36.97, -120.06], [37.64, -120.99], [38.58, -121.49], [39.10, -120.95], [39.33, -120.17]],
    'Dinuba, CA|Los Angeles, CA': [[35.373, -119.019], [34.86, -118.17], [34.42, -118.56], [34.2, -118.4]]
  };

  function L(id, ref, oc, dc, pickup, delivery, status, equip, x) {
    var l = { id: id, ref: ref, oc: oc, dc: dc, pickup: pickup, delivery: delivery, status: status, equip: equip };
    for (var k in x) l[k] = x[k];
    return l;
  }
  var JUICE = 'Cold-pressed juice, 34°F', CASES = 'Shelf-stable sparkling, cases';
  var LOADS = [
    L('VL-24131', 'PO-5102', 'Dinuba, CA', 'Riverside, CA', '2026-10-06', '2026-10-07', 'In transit', 'Reefer 53′', { near: 'Near Bakersfield, CA · on CA-99', left: 170, last: ['Oct 6, 2:00 PM', 'Driver check-call, Bakersfield'], next: 'Next update ~8:00 AM tomorrow', eta: 'Tue Oct 7, 6:00 AM appt', prog: 0.35, commodity: JUICE, pallets: 22 }),
    L('VL-24128', 'PO-5098', 'Fresno, CA', 'Phoenix, AZ', '2026-10-05', '2026-10-06', 'In transit', 'Reefer 53′', { near: 'Near Quartzsite, AZ · on I-10', left: 130, last: ['Oct 6, 2:00 PM', 'Driver check-call, Quartzsite'], next: 'Next update ~8:00 AM tomorrow', eta: 'Today, 4:00 PM appt', prog: 0.8, commodity: JUICE, pallets: 24 }),
    L('VL-24126', 'PO-5097', 'Fresno, CA', 'Las Vegas, NV', '2026-10-05', '2026-10-07', 'Exception', 'Reefer 53′', { near: 'Holding at Primm, NV · 40 mi out', left: 40, last: ['Oct 6, 9:14 AM', 'Receiver moved appointment'], next: 'Delivers Tue 6:00 AM', eta: 'Tue Oct 7, 6:00 AM (moved)', prog: 0.95, reason: 'Delivery appointment moved', note: 'Receiver moved the appointment to Tuesday 6:00 AM. Trailer holding nearby at 34°F.', commodity: 'Sparkling juice, cans', pallets: 20 }),
    L('VL-24135', 'PO-5110', 'Dinuba, CA', 'Sacramento, CA', '2026-10-07', '2026-10-08', 'Booked', 'Dry van 53′', { near: 'At your Dinuba dock', left: 210, last: ['Oct 3, 2:15 PM', 'Booked · pickup appt set'], next: 'Pickup tomorrow, 7:00 AM', eta: 'Wed Oct 8, 10:00 AM appt', commodity: CASES, pallets: 26 }),
    L('VL-24136', 'PO-5111', 'Fresno, CA', 'Albuquerque, NM', '2026-10-08', '2026-10-10', 'Booked', 'Reefer 53′', { near: 'Not picked up yet', left: 985, last: ['Oct 5, 10:05 AM', 'Booked · carrier assigned'], next: 'Pickup Thu Oct 8, 6:00 AM', eta: 'Sat Oct 10, 9:00 AM appt', commodity: JUICE, pallets: 22 }),
    L('VL-24137', 'PO-5112', 'Fresno, CA', 'San Diego, CA', '2026-10-09', '2026-10-09', 'Booked', 'Reefer LTL', { near: 'Not picked up yet', left: 340, last: ['Oct 5, 4:50 PM', 'Booked · LTL terminal pickup'], next: 'Pickup Fri Oct 9, 8:00 AM', eta: 'Fri Oct 9, by 1:00 PM', commodity: JUICE, pallets: 6 }),
    L('VL-24130', 'PO-5101', 'Dinuba, CA', 'Oakland, CA', '2026-10-06', '2026-10-06', 'Picked up', 'Dry van LTL', { near: 'Left your dock · on CA-99 north', left: 205, last: ['Oct 6, 8:10 AM', 'Picked up, 8 pallets'], next: 'Next update ~2:00 PM', eta: 'Today, by 5:00 PM', prog: 0.05, commodity: CASES, pallets: 8 }),
    L('VL-24129', 'PO-5100', 'Fresno, CA', 'Tucson, AZ', '2026-10-05', '2026-10-07', 'In transit', 'Reefer 53′', { near: 'Near Gila Bend, AZ · on I-8/I-10', left: 280, last: ['Oct 6, 2:00 PM', 'Driver check-call, Gila Bend'], next: 'Next update ~8:00 AM tomorrow', eta: 'Tue Oct 7, 8:00 AM appt', prog: 0.6, commodity: JUICE, pallets: 24 }),
    L('VL-24122', 'PO-5091', 'Dinuba, CA', 'Riverside, CA', '2026-10-01', '2026-10-02', 'Delivered', 'Reefer 53′', { near: 'Delivered', left: 0, last: ['Oct 5, 6:40 AM', 'Delivered · POD received'], next: '', eta: 'Delivered Oct 5', commodity: JUICE, pallets: 22 }),
    L('VL-24124', 'PO-5094', 'Fresno, CA', 'Phoenix, AZ', '2026-10-02', '2026-10-03', 'Delivered', 'Reefer 53′', { near: 'Delivered', left: 0, last: ['Oct 5, 11:25 AM', 'Delivered · POD pending'], next: 'POD expected by Oct 7', eta: 'Delivered Oct 5', commodity: JUICE, pallets: 24 }),
    L('VL-24125', 'PO-5095', 'Fresno, CA', 'Reno, NV', '2026-10-03', '2026-10-05', 'Delivered', 'Reefer LTL', { near: 'Delivered', left: 0, last: ['Oct 6, 7:15 AM', 'Delivered · POD received'], next: '', eta: 'Delivered Oct 6', commodity: JUICE, pallets: 5 }),
    L('VL-24119', 'PO-5088', 'Dinuba, CA', 'Los Angeles, CA', '2026-09-29', '2026-09-30', 'Delivered', 'Reefer 53′', { near: 'Delivered', left: 0, last: ['Sep 30, 5:30 AM', 'Delivered · POD received'], next: '', eta: 'Delivered Sep 30', commodity: JUICE, pallets: 22 })
  ];
  var ORIGINS = ['Dinuba, CA', 'Fresno, CA'];
  function D(name, hours, from, mi, transit, ontime, appt) {
    return { name: name, hours: hours, from: from, mi: mi, transit: transit, ontime: ontime, appt: appt || 'Required' };
  }
  var DEST = {
    'Riverside, CA': D('Riverside grocery DC', 'Mon–Fri 5:00 AM – 2:00 PM', 'Dinuba, CA', 255, '1 day', '4 of 4 on time this quarter'),
    'Phoenix, AZ': D('Phoenix distribution center', 'Mon–Sat 4:00 AM – 12:00 PM', 'Fresno, CA', 590, '1–2 days', '3 of 3 on time this quarter'),
    'Las Vegas, NV': D('Las Vegas foods warehouse', 'Mon–Fri 6:00 AM – 3:00 PM', 'Fresno, CA', 400, '1 day', '2 of 3 on time this quarter'),
    'Sacramento, CA': D('Sacramento grocery DC', 'Mon–Fri 6:00 AM – 4:00 PM', 'Dinuba, CA', 210, 'Same day', 'First load to this DC'),
    'Albuquerque, NM': D('Albuquerque cold storage', 'Mon–Fri 7:00 AM – 3:00 PM', 'Fresno, CA', 985, '2 days', 'First load to this DC'),
    'San Diego, CA': D('San Diego grocery DC', 'Mon–Fri 5:00 AM – 1:00 PM', 'Fresno, CA', 340, 'Same day', 'First load to this DC'),
    'Oakland, CA': D('Oakland co-op warehouse', 'Mon–Fri 7:00 AM – 5:00 PM', 'Dinuba, CA', 215, 'Same day', '5 of 5 on time this quarter', 'Not required'),
    'Tucson, AZ': D('Tucson grocery DC', 'Mon–Fri 5:00 AM – 1:00 PM', 'Fresno, CA', 700, '1–2 days', '2 of 2 on time this quarter'),
    'Reno, NV': D('Reno foods warehouse', 'Mon–Fri 6:00 AM – 2:00 PM', 'Fresno, CA', 300, '1 day', '3 of 3 on time this quarter'),
    'Los Angeles, CA': D('Los Angeles cold storage', 'Mon–Sun 24 hours', 'Dinuba, CA', 215, 'Same day', '6 of 6 on time this quarter')
  };

  var active = function (l) { return l.status !== 'Delivered'; };
  var moving = function (l) { return l.status === 'In transit' || l.status === 'Picked up'; };
  var city = function (s) { return s.replace(/, .*/, ''); };
  var byId = function (id) { for (var i = 0; i < LOADS.length; i++) if (LOADS[i].id === id) return LOADS[i]; return null; };
  var filter = function (fn) { return LOADS.filter(fn); };

  // Colour of a destination pin: worst inbound status, deep green if only delivered.
  function destColor(ls) {
    var act = ls.filter(active);
    if (!act.length) return ST.Delivered.dot;
    if (act.some(function (l) { return l.status === 'Exception'; })) return ST.Exception.dot;
    if (act.some(moving)) return ST['In transit'].dot;
    return ST.Booked.dot;
  }
  function routePts(l) { return [PL[l.oc]].concat(WP[l.oc + '|' + l.dc] || [], [PL[l.dc]]); }

  // ───────── panel markup ─────────
  // state: { origin, dest, load } (names / load id). With interactive false, controls render
  // as plain text: that is the no-JavaScript overview the build writes into the page.
  function chip(status) {
    var s = ST[status];
    return '<span class="vm-chip"><span class="dot" style="--dot:' + s.dot + '"></span><span class="vm-chip__g" aria-hidden="true">' + s.g + '</span>' + status + '</span>';
  }
  function panel(state, interactive) {
    var act = function (tag, attrs, cls, inner) {
      return interactive
        ? '<button type="button" class="' + cls + '" ' + attrs + '>' + inner + '</button>'
        : '<div class="' + cls + '">' + inner + '</div>';
    };
    var fact = function (k, v) { return '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>'; };
    var head = function (eyebrow, title, sub) {
      return '<div class="vm-head"><span class="vm-eyebrow">' + eyebrow + '</span><h4 class="vm-h" tabindex="-1">' + title + '</h4>' + (sub ? '<p class="vm-muted">' + sub + '</p>' : '') + '</div>';
    };
    var back = function (label) { return interactive ? '<button type="button" class="vm-link" data-back>← ' + label + '</button>' : ''; };
    var loadRow = function (l, nested) {
      return act('button', 'data-load="' + l.id + '"', 'vm-row' + (nested ? ' vm-row--nested' : '') + (state.load === l.id ? ' is-sel' : ''),
        '<span class="vm-row__top"><span class="vm-row__lane">' + l.near + '</span>' + chip(l.status) + '</span>'
        + (l.reason ? '<span class="vm-reason">' + l.reason + '</span>' : '')
        + '<span class="vm-row__meta"><span class="vm-mono">' + l.id + '</span><span>' + city(l.oc) + ' → ' + city(l.dc) + '</span><span>' + l.eta + '</span></span>');
    };
    var foot = '<p class="vm-muted vm-foot">Updated from driver check-calls at ~8 AM and ~2 PM Pacific.</p>';

    if (state.load) {
      var l = byId(state.load), d = DEST[l.dc], del = l.status === 'Delivered', moves = l.prog != null && !del;
      var pct = del ? 100 : Math.round((l.prog || 0) * 100);
      return back(state.dest ? city(state.dest) : state.origin ? city(state.origin) + ' loads' : 'All lanes')
        + '<div class="vm-head"><span class="vm-load-id"><span class="vm-mono">' + l.id + '</span>' + chip(l.status) + '</span><h4 class="vm-h" tabindex="-1">' + l.near + '</h4><p class="vm-muted">' + l.oc + ' → ' + l.dc + ' · ' + d.name + '</p></div>'
        + (l.reason ? '<div class="vm-alert"><strong>' + l.reason + '.</strong> ' + l.note + '</div>' : '')
        + '<div class="vm-progress"><div class="vm-progress__ends"><span>' + city(l.oc) + '</span><span>' + city(l.dc) + '</span></div>'
        + '<div class="vm-progress__bar" role="img" aria-label="' + pct + '% of the way"><span style="width:' + pct + '%;background:' + ST[l.status].dot + '"></span>' + (moves ? '<i style="left:' + pct + '%"></i>' : '') + '</div>'
        + '<div class="vm-progress__ends"><span>' + (del ? 'Delivered' : l.left + ' mi to go') + '</span><span>' + l.eta + '</span></div></div>'
        + '<dl class="vm-facts">' + fact('Last update', '<span class="vm-mono">' + l.last[0] + '</span><br><span class="vm-muted">' + l.last[1] + '</span>')
        + (l.next ? fact('What’s next', '<strong>' + l.next + '</strong>') : '')
        + fact('Receiving hours', d.hours) + fact('Appointment', d.appt) + fact('Load', l.equip + ' · ' + l.pallets + ' pallets') + fact('Commodity', l.commodity) + '</dl>'
        + '<p class="vm-muted">Position comes from driver check-calls at ~8 AM and ~2 PM, not live GPS.</p>'
        + '<p class="vm-muted vm-note">In the portal, this opens the full shipment: dates, documents and notes.</p>';
    }

    if (state.dest) {
      var name = state.dest, D2 = DEST[name], ls = filter(function (x) { return x.dc === name; });
      var inb = ls.filter(active), done = ls.filter(function (x) { return !active(x); });
      return back(state.origin ? city(state.origin) + ' lanes' : 'All lanes')
        + head('Destination', name, D2.name)
        + '<dl class="vm-facts">' + fact('Receiving hours', D2.hours) + fact('Appointment', D2.appt) + fact('From ' + city(D2.from), D2.mi + ' mi · ' + D2.transit) + fact('Track record', D2.ontime) + '</dl>'
        + '<div><span class="vm-eyebrow">Inbound · ' + inb.length + '</span><div class="vm-list">' + (inb.length ? inb.map(function (x) { return loadRow(x); }).join('') : '<p class="vm-muted vm-empty">Nothing heading here right now.</p>') + '</div></div>'
        + (done.length ? '<div><span class="vm-eyebrow">Delivered here · ' + done.length + '</span><div class="vm-list">' + done.map(function (x) { return loadRow(x); }).join('') + '</div></div>' : '');
    }

    var o = state.origin;
    var all = filter(function (x) { return !o || x.oc === o; }), a = all.filter(active);
    var ex = a.filter(function (x) { return x.status === 'Exception'; }).length;
    var lede = '<strong>' + a.filter(moving).length + ' on the road</strong>, '
      + a.filter(function (x) { return x.delivery === TODAY; }).length + ' delivering today, '
      + a.filter(function (x) { return x.status === 'Booked'; }).length + ' waiting on pickup'
      + (ex ? ', <strong class="vm-risk">' + ex + ' needs attention</strong>' : '') + '.';
    var count = function (n) { return all.filter(function (x) { return x.dc === n && active(x); }).length; };
    var dests = Object.keys(DEST).filter(function (n) { return all.some(function (x) { return x.dc === n; }); })
      .sort(function (p, q) { return count(q) - count(p); });
    var origins = ORIGINS.map(function (n) {
      var c = LOADS.filter(function (x) { return x.oc === n && active(x); }).length;
      return act('button', 'data-origin="' + n + '"' + (interactive ? ' aria-pressed="' + (o === n) + '"' : ''), 'vm-origin', '<span class="vm-origin__n">' + c + '</span>' + city(n));
    }).join('');
    var groups = dests.map(function (n) {
      var inb = all.filter(function (x) { return x.dc === n && active(x); });
      return '<div class="vm-group">' + act('button', 'data-dest="' + n + '"', 'vm-row vm-row--dest',
        '<span class="vm-row__top"><span class="vm-row__lane">' + n + '</span><span class="vm-muted">' + (inb.length ? inb.length + ' inbound' : 'none inbound') + '</span></span>'
        + '<span class="vm-muted">' + DEST[n].hours + ' · ' + DEST[n].transit + ' from your dock</span>')
        + inb.map(function (x) { return loadRow(x, true); }).join('') + '</div>';
    }).join('');
    return head(o ? 'Leaving from' : 'Right now', o || 'Where your freight is', lede)
      + (o && interactive ? '<button type="button" class="vm-link" data-clear>Show all origins</button>' : '')
      + '<div><span class="vm-eyebrow">Origins</span><div class="vm-origins">' + origins + '</div></div>'
      + '<div><span class="vm-eyebrow">By destination</span><div class="vm-list">' + groups + '</div></div>'
      + foot;
  }

  var api = {
    ST: ST, PL: PL, LOADS: LOADS, ORIGINS: ORIGINS, DEST: DEST,
    active: active, city: city, byId: byId, destColor: destColor, routePts: routePts, panel: panel
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ValenceMapData = api;
})(this);
