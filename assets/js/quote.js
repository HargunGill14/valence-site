/* The quote page (/quote/): lane, pickup date, items, pickup and delivery options with an explainer
   for each, then where to send the quote. The form itself is rendered by scripts/build.mjs from
   scripts/quote-fields.mjs (item types, option ids and titles, max lengths); this file adds what each
   option means, the items table, prefill from the homepage, and the send. On send it posts JSON with
   a Cloudflare Turnstile token to /api/quote-request as kind "quote_page" (worker/quote.mjs checks it
   all again). The thank-you shows only when the endpoint answers {"ok":true}. No <form>, and never a
   price. Prefill: ?from=&to= (ZIPs), ?fromPlace=&toPlace= (map picks, "city:Dallas" or "state:Texas"),
   ?equipment= (into the note). */
(function () {
  'use strict';
  var root = document.querySelector('[data-quote]'); if (!root) return;
  var ENDPOINT = root.getAttribute('data-quote-endpoint') || '';
  var SITEKEY = root.getAttribute('data-quote-sitekey') || '';
  var PHONE = '(628) 212-9947';
  var FAIL = "That didn't go through. Try again, or call " + PHONE + '.';
  var STATUS = {
    400: "Something in the form doesn't look right. Check the fields and try again, or call " + PHONE + '.',
    403: "We couldn't confirm the request came from a person. Try again, or call " + PHONE + '.',
    429: 'Too many requests from your network just now. Wait a minute and try again, or call ' + PHONE + '.',
  };
  var ZIP = /^\d{5}$/;
  var EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function q(s) { return root.querySelector(s); }
  function each(l, fn) { Array.prototype.forEach.call(l, fn); }
  function v(s) { var el = q(s); return el ? el.value.trim() : ''; }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

  /* ---------- ZIP prefix → state (first three digits; standard USPS ranges) ---------- */
  var ZR = [[5,5,'NY'],[6,9,'PR'],[10,27,'MA'],[28,29,'RI'],[30,38,'NH'],[39,49,'ME'],[50,59,'VT'],[60,69,'CT'],[70,89,'NJ'],[100,149,'NY'],[150,196,'PA'],[197,199,'DE'],[200,205,'DC'],[206,219,'MD'],[220,246,'VA'],[247,268,'WV'],[270,289,'NC'],[290,299,'SC'],[300,319,'GA'],[320,349,'FL'],[350,369,'AL'],[370,385,'TN'],[386,397,'MS'],[400,427,'KY'],[430,459,'OH'],[460,479,'IN'],[480,499,'MI'],[500,528,'IA'],[530,549,'WI'],[550,567,'MN'],[570,577,'SD'],[580,588,'ND'],[590,599,'MT'],[600,629,'IL'],[630,658,'MO'],[660,679,'KS'],[680,693,'NE'],[700,714,'LA'],[716,729,'AR'],[730,749,'OK'],[750,799,'TX'],[800,816,'CO'],[820,831,'WY'],[832,838,'ID'],[840,847,'UT'],[850,865,'AZ'],[870,884,'NM'],[889,898,'NV'],[900,961,'CA'],[967,968,'HI'],[970,979,'OR'],[980,994,'WA'],[995,999,'AK']];
  var SN = { NY: 'New York', PR: 'Puerto Rico', MA: 'Massachusetts', RI: 'Rhode Island', NH: 'New Hampshire', ME: 'Maine', VT: 'Vermont', CT: 'Connecticut', NJ: 'New Jersey', PA: 'Pennsylvania', DE: 'Delaware', DC: 'Washington, DC', MD: 'Maryland', VA: 'Virginia', WV: 'West Virginia', NC: 'North Carolina', SC: 'South Carolina', GA: 'Georgia', FL: 'Florida', AL: 'Alabama', TN: 'Tennessee', MS: 'Mississippi', KY: 'Kentucky', OH: 'Ohio', IN: 'Indiana', MI: 'Michigan', IA: 'Iowa', WI: 'Wisconsin', MN: 'Minnesota', SD: 'South Dakota', ND: 'North Dakota', MT: 'Montana', IL: 'Illinois', MO: 'Missouri', KS: 'Kansas', NE: 'Nebraska', LA: 'Louisiana', AR: 'Arkansas', OK: 'Oklahoma', TX: 'Texas', CO: 'Colorado', WY: 'Wyoming', ID: 'Idaho', UT: 'Utah', AZ: 'Arizona', NM: 'New Mexico', NV: 'Nevada', CA: 'California', HI: 'Hawaii', OR: 'Oregon', WA: 'Washington', AK: 'Alaska' };
  function stateOf(zip) { if (!ZIP.test(zip)) return ''; var n = +zip.slice(0, 3); for (var i = 0; i < ZR.length; i++) if (n >= ZR[i][0] && n <= ZR[i][1]) return SN[ZR[i][2]]; return ''; }
  function placeLine(name) { q('[data-q-place="' + name + '"]').textContent = stateOf(v('[data-q="' + name + '"]')); }
  each(['from', 'to'], function (n) { q('[data-q="' + n + '"]').addEventListener('input', function () { placeLine(n); }); });

  /* ---------- what each option means, by the id the page renders (scripts/quote-fields.mjs) ---------- */
  var COPY = {
    res_pu: { art: 'house', d: 'The pickup is at a house, apartment or a business run out of a home, not a commercial dock.', add: 'The truck is coming to a home address, a storage unit or anywhere without a loading dock.', skip: 'The carrier shows up with a 53 ft trailer that cannot get down the street, and the pickup is rescheduled.' },
    lift_pu: { art: 'liftgate', d: 'The truck brings its own lift to lower the freight from dock height to the ground. Needed wherever there is no dock or forklift.', add: 'Nobody at the pickup can get a pallet up into a trailer that sits four feet off the ground.', skip: 'The driver cannot load it, leaves, and you pay for the attempt.' },
    appt_pu: { art: 'clock', d: 'The shipper needs the carrier to arrive in a set window instead of any time that day.', add: 'The warehouse, co-packer or 3PL only loads at booked times.', skip: 'The truck arrives when the dock is closed or busy and the pickup slips a day.' },
    lim_pu: { art: 'gate', d: 'A place that is hard for a tractor-trailer to get into: a school, church, farm, military base, mine, prison, storage facility or anywhere with a gate and no dock.', add: 'The pickup needs a check-in, an escort, a small truck or more time than a normal dock stop.', skip: 'The carrier bills it after the fact at a worse rate than quoting it up front.' },
    con_pu: { art: 'crane', d: 'Picking up from an active job site: no dock, uneven ground, a gate and a foreman to find.', add: 'The freight is on a job site.', skip: 'Same as limited access: billed later, at a worse rate.' },
    show_pu: { art: 'booth', d: 'Picking up from a convention center or show floor, with a marshalling yard, union labor and a move-out window.', add: 'The freight is leaving a show.', skip: 'The driver waits in the marshalling yard for hours and you pay for the time.' },
    two_pu: { art: 'two', d: 'A second person on the truck to help load heavy or awkward pieces.', add: 'Nobody at the pickup can help, and the pieces are too heavy for one person.', skip: 'One driver, one pallet jack. If it cannot be moved by one person, it stays.' },
    pallet_pu: { art: 'pallet', d: 'The freight is loose and needs to be put on pallets and wrapped before it can ship.', add: 'Your goods are in boxes or crates, not on a pallet.', skip: 'Loose cartons on an LTL truck get crushed, lost or refused.' },
    floor_pu: { art: 'floor', d: 'The freight is stacked straight onto the trailer floor, no pallets. Takes longer to load and unload by hand.', add: 'You ship cartons loose to use every inch of the trailer.', skip: 'The carrier assumes pallets and a forklift; a floor load gets refused or re-priced.' },
    reefer_pu: { art: 'reefer', d: 'A temperature-controlled trailer, set to the range you give us, with the log to prove it.', add: 'Food, beverage, beauty or anything that cannot sit in a hot trailer.', skip: 'Summer heat in a dry van is why heat claims exist.' },
    assist_pu: { art: 'jack', d: 'The driver helps move the freight with a pallet jack instead of just taking it at the trailer.', add: 'Nobody at your end can move a loaded pallet, and there is no forklift.', skip: 'Most LTL drivers will not load by hand. If your side cannot do it, the truck leaves empty.' },
    inside_pu: { art: 'inside', d: 'The driver goes past the door or dock to collect the freight from inside the building.', add: 'The freight is not at the dock and nobody can bring it there.', skip: 'The driver takes only what is at the door.' },
    hazmat: { art: 'hazmat', d: 'The freight is a hazardous material (aerosols, alcohol-based product, lithium batteries, cleaning chemicals, paints). Needs a certified carrier, placards and paperwork.', add: 'Anything with a UN number on the safety data sheet.', skip: 'Undeclared hazmat is refused at pickup or fined in transit.' },
    alcohol: { art: 'bottle', d: 'Beer, wine or spirits. Needs a carrier licensed for alcohol and the right receiver permits.', add: 'You ship alcohol.', skip: 'Many carriers will not touch it; the pickup is refused.' },
    res_dl: { art: 'house', d: 'Delivering to a house, apartment or home business, not a commercial dock.', add: 'The delivery address is a home.', skip: 'A 53 ft trailer cannot make the turn and the delivery is rescheduled with a fee.' },
    lift_dl: { art: 'liftgate', d: 'The truck lowers the freight to the ground on its own lift. Needed wherever there is no dock or forklift.', add: 'The receiver has no dock and no forklift.', skip: 'The freight stays on the truck and comes back to the terminal.' },
    appt_dl: { art: 'clock', d: 'The receiver requires a booked delivery window. Retail and grocery DCs almost always do.', add: 'You are delivering to a DC, a retailer or anywhere that schedules its dock.', skip: 'The truck is turned away and the next appointment is days out, with a fee from the retailer.' },
    lim_dl: { art: 'gate', d: 'A delivery address that is hard for a tractor-trailer: schools, farms, bases, storage units, gated sites.', add: 'The receiver has a gate, a check-in or no dock.', skip: 'Billed after the fact at a worse rate.' },
    con_dl: { art: 'crane', d: 'Delivering to an active job site: no dock, rough ground, a foreman to find.', add: 'The freight is going to a job site.', skip: 'Same as limited access: billed later, at a worse rate.' },
    show_dl: { art: 'booth', d: 'Delivering to a show floor or an advance warehouse, with a move-in window and show rules.', add: 'The freight is going to a show.', skip: 'It misses the move-in window and sits in the marshalling yard.' },
    dunnage: { art: 'debris', d: 'The driver takes the pallets, wrap and packing material away after delivery.', add: 'The receiver will not keep the pallets or packaging.', skip: 'The receiver is left with the mess, and some refuse the delivery because of it.' },
    two_dl: { art: 'two', d: 'A second person to help unload heavy or awkward pieces.', add: 'Nobody at the receiver can help and the pieces are heavy.', skip: 'One driver, one pallet jack. If it cannot be moved by one person, it goes back.' },
    assist_dl: { art: 'jack', d: 'The driver helps move the freight with a pallet jack instead of just handing it over at the trailer.', add: 'Nobody at your end can move a loaded pallet, and there is no forklift.', skip: 'Most LTL drivers will not unload by hand. If the receiver cannot do it, the truck leaves full.' },
    inside_dl: { art: 'inside', d: 'The driver brings the freight past the door or dock to a room, floor or bay you name.', add: 'The freight needs to end up somewhere other than the dock.', skip: 'It is left at the door.' }
  };
  /* The options, in page order, with the title the page shows. */
  var OPTS = Array.prototype.map.call(root.querySelectorAll('[data-opt]'), function (el) {
    var id = el.getAttribute('data-opt'), c = COPY[id] || {};
    return { id: id, k: el.closest('[data-q-opts]').getAttribute('data-q-opts'), t: el.querySelector('[data-opt-pick]').textContent.trim(), art: c.art, d: c.d || '', add: c.add || '', skip: c.skip || '' };
  });
  var chosen = {};

  /* small line drawings, one per art key, in the site's hand (paper, ink, one green) */
  function art(kind) {
    var g = '#4F6B55', ink = '#1E242B';
    var truck = '<rect x="330" y="70" width="190" height="80" rx="4" fill="#fff" stroke="' + ink + '" stroke-width="2"/><rect x="520" y="95" width="48" height="55" rx="4" fill="#fff" stroke="' + ink + '" stroke-width="2"/><circle cx="365" cy="152" r="12" fill="#2A2F36"/><circle cx="395" cy="152" r="12" fill="#2A2F36"/><circle cx="545" cy="152" r="12" fill="#2A2F36"/>';
    var pallet = function (x) { return '<rect x="' + x + '" y="110" width="60" height="34" fill="#F3F5F7" stroke="' + ink + '" stroke-width="2"/><rect x="' + (x - 4) + '" y="144" width="68" height="8" fill="#CCB494" stroke="' + ink + '" stroke-width="2"/>'; };
    var ground = '<line x1="0" y1="164" x2="600" y2="164" stroke="' + g + '" stroke-width="3"/>';
    var person = function (x) { return '<circle cx="' + x + '" cy="118" r="7" fill="#D8C0A8" stroke="' + ink + '" stroke-width="2"/><rect x="' + (x - 7) + '" y="126" width="14" height="22" rx="3" fill="' + g + '" stroke="' + ink + '" stroke-width="2"/><line x1="' + (x - 4) + '" y1="148" x2="' + (x - 4) + '" y2="164" stroke="' + ink + '" stroke-width="3"/><line x1="' + (x + 4) + '" y1="148" x2="' + (x + 4) + '" y2="164" stroke="' + ink + '" stroke-width="3"/>'; };
    var label = function (x, y, t) { return '<text x="' + x + '" y="' + y + '" font-family="ui-monospace,Menlo,monospace" font-size="11" letter-spacing="1.5" fill="' + ink + '">' + t + '</text>'; };
    var building = '<rect x="30" y="60" width="150" height="104" fill="#fff" stroke="' + ink + '" stroke-width="2"/><rect x="110" y="110" width="50" height="54" fill="#DCE0E5" stroke="' + ink + '" stroke-width="2"/>' + label(44, 86, 'RECEIVER');
    var house = '<polygon points="40,110 105,60 170,110" fill="#fff" stroke="' + ink + '" stroke-width="2"/><rect x="55" y="110" width="100" height="54" fill="#fff" stroke="' + ink + '" stroke-width="2"/><rect x="95" y="130" width="22" height="34" fill="#DCE0E5" stroke="' + ink + '" stroke-width="2"/>';
    var body = '';
    switch (kind) {
      case 'house': body = house + truck + pallet(250) + label(190, 50, 'NO DOCK · NARROW STREET'); break;
      case 'liftgate': body = building + truck + '<rect x="285" y="138" width="45" height="6" fill="' + g + '" stroke="' + ink + '" stroke-width="2"/>' + pallet(278).replace('y="110"', 'y="104"').replace('y="144"', 'y="138"') + label(200, 50, 'THE TRUCK LOWERS IT TO THE GROUND'); break;
      case 'clock': body = building + truck + '<circle cx="250" cy="100" r="26" fill="#fff" stroke="' + ink + '" stroke-width="2"/><line x1="250" y1="100" x2="250" y2="82" stroke="' + ink + '" stroke-width="2"/><line x1="250" y1="100" x2="263" y2="106" stroke="' + g + '" stroke-width="2"/>' + label(190, 50, 'BOOKED WINDOW · 1:00 TO 3:00 PM'); break;
      case 'gate': body = '<line x1="40" y1="164" x2="40" y2="90" stroke="' + ink + '" stroke-width="3"/><line x1="200" y1="164" x2="200" y2="90" stroke="' + ink + '" stroke-width="3"/><line x1="40" y1="100" x2="200" y2="100" stroke="' + ink + '" stroke-width="2"/><line x1="40" y1="130" x2="200" y2="130" stroke="' + ink + '" stroke-width="2"/>' + truck + person(240) + label(60, 50, 'GATE · CHECK-IN · NO DOCK'); break;
      case 'crane': body = '<line x1="80" y1="164" x2="80" y2="40" stroke="' + ink + '" stroke-width="3"/><line x1="80" y1="44" x2="230" y2="44" stroke="' + ink + '" stroke-width="3"/><line x1="200" y1="44" x2="200" y2="100" stroke="' + ink + '" stroke-width="1.5"/>' + pallet(170).replace('y="110"', 'y="100"').replace('y="144"', 'y="134"') + truck + label(90, 30, 'JOB SITE · ROUGH GROUND · FOREMAN'); break;
      case 'booth': body = '<rect x="30" y="80" width="170" height="84" fill="#fff" stroke="' + ink + '" stroke-width="2"/><rect x="45" y="60" width="140" height="20" fill="' + g + '"/>' + label(52, 75, 'HALL B · BOOTH 412').replace(ink, '#fff') + truck + label(230, 50, 'MARSHALLING YARD · MOVE-OUT WINDOW'); break;
      case 'two': body = building + truck + person(230) + person(262) + pallet(290) + label(200, 50, 'TWO PEOPLE · HEAVY PIECES'); break;
      case 'pallet': body = '<rect x="40" y="120" width="30" height="24" fill="#fff" stroke="' + ink + '" stroke-width="2"/><rect x="75" y="110" width="30" height="34" fill="#fff" stroke="' + ink + '" stroke-width="2"/><rect x="110" y="126" width="30" height="18" fill="#fff" stroke="' + ink + '" stroke-width="2"/><text x="170" y="135" font-size="22" fill="' + g + '">→</text>' + pallet(220) + truck + label(40, 50, 'LOOSE CARTONS → ONE WRAPPED PALLET'); break;
      case 'floor': body = '<rect x="330" y="70" width="190" height="80" rx="4" fill="#fff" stroke="' + ink + '" stroke-width="2"/>' + [0, 1, 2, 3, 4].map(function (i) { return '<rect x="' + (340 + i * 36) + '" y="118" width="30" height="28" fill="#F3F5F7" stroke="' + ink + '" stroke-width="2"/><rect x="' + (340 + i * 36) + '" y="88" width="30" height="28" fill="#F3F5F7" stroke="' + ink + '" stroke-width="2"/>'; }).join('') + '<rect x="520" y="95" width="48" height="55" rx="4" fill="#fff" stroke="' + ink + '" stroke-width="2"/><circle cx="365" cy="152" r="12" fill="#2A2F36"/><circle cx="545" cy="152" r="12" fill="#2A2F36"/>' + person(290) + label(200, 50, 'STACKED BY HAND · NO PALLETS'); break;
      case 'reefer': body = truck.replace('fill="#fff" stroke="' + ink + '" stroke-width="2"/><rect x="520"', 'fill="#DAE4EC" stroke="' + ink + '" stroke-width="2"/><rect x="520"') + '<rect x="330" y="56" width="40" height="14" fill="#fff" stroke="' + ink + '" stroke-width="2"/>' + label(345, 110, '34°F · LOGGED') + pallet(250) + label(190, 50, 'SET TO YOUR RANGE · LOG ON FILE'); break;
      case 'jack': body = building + truck + '<rect x="262" y="130" width="40" height="6" fill="' + g + '"/><line x1="262" y1="130" x2="252" y2="96" stroke="' + ink + '" stroke-width="3"/><circle cx="268" cy="152" r="6" fill="#2A2F36"/><circle cx="298" cy="152" r="6" fill="#2A2F36"/>' + pallet(266).replace('y="110"', 'y="96"').replace('y="144"', 'y="130"') + person(236) + label(200, 50, 'NO FORKLIFT AT THIS END · THE DRIVER MOVES IT'); break;
      case 'inside': body = building + '<line x1="135" y1="112" x2="90" y2="112" stroke="' + g + '" stroke-width="2" stroke-dasharray="5 4"/>' + pallet(60).replace('y="110"', 'y="104"').replace('y="144"', 'y="138"') + truck + person(240) + label(200, 50, 'PAST THE DOOR, TO THE ROOM YOU NAME'); break;
      case 'hazmat': body = truck + '<polygon points="430,62 448,80 430,98 412,80" fill="#fff" stroke="' + ink + '" stroke-width="2"/><text x="423" y="85" font-size="11" font-weight="700" fill="' + ink + '">UN</text>' + pallet(250) + label(190, 50, 'PLACARDS · CERTIFIED CARRIER · PAPERWORK'); break;
      case 'bottle': body = truck + '<rect x="262" y="100" width="12" height="44" rx="4" fill="#fff" stroke="' + ink + '" stroke-width="2"/><rect x="266" y="90" width="4" height="12" fill="' + ink + '"/><rect x="282" y="100" width="12" height="44" rx="4" fill="#fff" stroke="' + ink + '" stroke-width="2"/><rect x="286" y="90" width="4" height="12" fill="' + ink + '"/>' + label(190, 50, 'LICENSED CARRIER · RECEIVER PERMIT'); break;
      case 'debris': body = building + truck + '<rect x="230" y="120" width="40" height="24" fill="#F3F5F7" stroke="' + ink + '" stroke-width="2" stroke-dasharray="4 3"/><rect x="226" y="144" width="48" height="8" fill="#CCB494" stroke="' + ink + '" stroke-width="2"/><text x="290" y="135" font-size="22" fill="' + g + '">→</text>' + label(200, 50, 'PALLETS AND WRAP LEAVE WITH THE TRUCK'); break;
      default: body = building + truck + pallet(250);
    }
    return '<svg viewBox="0 0 600 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + body + ground + '</svg>';
  }

  /* ---------- the option buttons ---------- */
  function setOpt(id, on) { chosen[id] = !!on; each(root.querySelectorAll('[data-opt="' + id + '"]'), function (el) { el.classList.toggle('is-on', !!on); el.querySelector('[data-opt-pick]').setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
  root.addEventListener('click', function (e) {
    var pick = e.target.closest('[data-opt-pick]'); if (pick) { var id = pick.getAttribute('data-opt-pick'); setOpt(id, !chosen[id]); return; }
    var info = e.target.closest('[data-opt-info]'); if (info) { opener = info; openInfo(info.getAttribute('data-opt-info')); return; }
    var more = e.target.closest('[data-q-more]'); if (more) { var k = more.getAttribute('data-q-more'), wrap = q('[data-q-opts="' + k + '"]'), open = !wrap.classList.contains('is-all'); wrap.classList.toggle('is-all', open); more.setAttribute('aria-expanded', open ? 'true' : 'false'); more.textContent = open ? 'Show fewer ' + k + ' options' : 'Show all ' + k + ' options'; }
  });

  /* ---------- the explainer dialog ---------- */
  var dlg = document.getElementById('qinfo'), cur = null, opener = null;
  function d(s) { return dlg.querySelector(s); }
  function openInfo(id) {
    var o = OPTS.filter(function (x) { return x.id === id; })[0]; if (!o) return; cur = o;
    d('[data-qinfo-art]').innerHTML = art(o.art); d('[data-qinfo-title]').textContent = o.t; d('[data-qinfo-desc]').textContent = o.d; d('[data-qinfo-add]').textContent = o.add; d('[data-qinfo-skip]').textContent = o.skip;
    d('[data-qinfo-kind]').textContent = o.k === 'pickup' ? 'Pickup' : 'Delivery';
    var chips = d('[data-qinfo-chips]'); chips.textContent = '';
    OPTS.filter(function (x) { return x.k === o.k; }).forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'qinfo__chip' + (x.id === o.id ? ' is-on' : '') + (chosen[x.id] ? ' is-chosen' : '');
      b.setAttribute('data-qinfo-go', x.id); if (x.id === o.id) b.setAttribute('aria-current', 'true'); b.textContent = x.t; chips.appendChild(b);
    });
    syncToggle();
    if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
    var on = d('[data-qinfo-chips] .is-on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function syncToggle() { var b = d('[data-qinfo-toggle]'); b.textContent = chosen[cur.id] ? 'Added ✓ · Remove' : 'Add ' + cur.t.toLowerCase(); b.classList.toggle('is-done', !!chosen[cur.id]); }
  function step(dir) { var sibs = OPTS.filter(function (x) { return x.k === cur.k; }), i = sibs.indexOf(cur); openInfo(sibs[(i + dir + sibs.length) % sibs.length].id); }
  function closeInfo() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
  dlg.addEventListener('close', function () { if (opener) { opener.focus(); opener = null; } });
  dlg.addEventListener('click', function (e) {
    if (e.target.closest('[data-qinfo-close]') || e.target === dlg) return closeInfo();
    if (e.target.closest('[data-qinfo-prev]')) return step(-1);
    if (e.target.closest('[data-qinfo-next]')) return step(1);
    var go = e.target.closest('[data-qinfo-go]'); if (go) return openInfo(go.getAttribute('data-qinfo-go'));
    if (e.target.closest('[data-qinfo-toggle]')) { setOpt(cur.id, !chosen[cur.id]); syncToggle(); d('[data-qinfo-chips] [data-qinfo-go="' + cur.id + '"]').classList.toggle('is-chosen', !!chosen[cur.id]); }
  });

  /* ---------- items: rows from the page's <template>, at most data-q-max ---------- */
  var items = q('[data-q-items]'), tpl = q('[data-q-itemrow]'), addBtn = q('[data-q-additem]'), MAXI = +items.getAttribute('data-q-max') || 20;
  function rows() { return items.querySelectorAll('.qitem'); }
  function addItem() {
    if (rows().length >= MAXI) return;
    var row = tpl.content.firstElementChild.cloneNode(true);
    row.querySelector('[data-i="qty"]').value = '1';
    items.appendChild(row); total();
    addBtn.hidden = rows().length >= MAXI;
    return row;
  }
  function num(s) { s = String(s || '').replace(/,/g, '').trim(); return /^\d{1,6}$/.test(s) ? +s : NaN; }
  function readItems() { return Array.prototype.map.call(rows(), function (r) { var g = function (n) { return r.querySelector('[data-i="' + n + '"]').value.trim(); }; return { type: g('type'), qty: g('qty'), lbs: g('lbs'), l: g('l'), w: g('w'), h: g('h') }; }); }
  function totals() { var n = 0, lb = 0; readItems().forEach(function (i) { var a = num(i.qty) || 0, b = num(i.lbs) || 0; n += a; lb += a * b; }); return { n: n, lb: lb }; }
  function total() { var t = totals(); q('[data-q-total]').textContent = t.n.toLocaleString('en-US') + (t.n === 1 ? ' item' : ' items') + ' · ' + t.lb.toLocaleString('en-US') + ' lbs total'; }
  items.addEventListener('input', total);
  items.addEventListener('click', function (e) {
    var x = e.target.closest('[data-i-remove]'); if (!x || rows().length < 2) return;
    var row = x.closest('.qitem'), next = row.nextElementSibling || row.previousElementSibling;
    row.remove(); total(); addBtn.hidden = false;
    if (next) { var f = next.querySelector('select, input'); if (f) f.focus(); }
  });
  addBtn.addEventListener('click', function () { var r = addItem(); if (r) r.querySelector('select').focus(); });

  /* ---------- prefill from the homepage (the box's truck tab, or the map) ---------- */
  var P = {};
  location.search.replace(/^\?/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (!p[0]) return; try { P[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); } catch (e) { /* a malformed parameter is ignored */ } });
  if (ZIP.test(P.from || '')) q('[data-q="from"]').value = P.from;
  if (ZIP.test(P.to || '')) q('[data-q="to"]').value = P.to;
  placeLine('from'); placeLine('to');
  var PLACE = /^(city|state):[A-Za-z .'-]{2,40}$/;
  var fromPlace = PLACE.test(P.fromPlace || '') ? P.fromPlace : '', toPlace = PLACE.test(P.toPlace || '') ? P.toPlace : '';
  if (fromPlace || toPlace) {
    var mn = q('[data-q-mapnote]'), nm = function (p) { return p ? p.replace(/^(city|state):/, '') : '?'; };
    mn.textContent = 'From the map: ' + nm(fromPlace) + ' → ' + nm(toPlace) + '.' + (ZIP.test(P.from || '') && ZIP.test(P.to || '') ? '' : ' Add both ZIP codes above for an exact quote.');
    mn.hidden = false;
  }
  q('[data-q="date"]').min = today();
  if (P.equipment && P.equipment.length <= 80) q('[data-q="note"]').value = P.equipment + '. ';
  addItem();

  /* ---------- Turnstile, as in the quote box: rendered on load (invisible unless it needs a click),
     reset after every attempt that didn't succeed, because tokens are single use ---------- */
  var slot = q('[data-q-turnstile]'), widget = null, token = '', waiters = [];
  function settle(t) { token = t || ''; var w = waiters; waiters = []; w.forEach(function (fn) { fn(); }); }
  function startCheck() {
    if (widget !== null || !slot || !window.turnstile || !SITEKEY) return;
    try {
      widget = window.turnstile.render(slot, {
        sitekey: SITEKEY, action: 'quote', appearance: 'interaction-only',
        callback: function (t) { settle(t); },
        'expired-callback': function () { token = ''; },
        'error-callback': function () { settle(''); return true; },
      });
    } catch (e) { widget = null; }
  }
  function resetCheck() { token = ''; if (widget !== null && window.turnstile) { try { window.turnstile.reset(widget); } catch (e) { /* ignore */ } } }
  function getToken(ms) {
    return new Promise(function (resolve) {
      startCheck();
      if (token) return resolve(token);
      var over = false, t = setTimeout(function () { if (!over) { over = true; resolve(''); } }, ms);
      waiters.push(function () { if (!over) { over = true; clearTimeout(t); resolve(token); } });
    });
  }
  startCheck();

  /* ---------- send ---------- */
  var err = q('[data-q-error]'), btn = q('[data-q-submit]'), LABEL = btn.textContent;
  function fail(m) { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); }
  function busy(on) { btn.disabled = on; btn.textContent = on ? 'Sending…' : LABEL; }
  function check() {
    if (!ZIP.test(v('[data-q="from"]')) || !ZIP.test(v('[data-q="to"]'))) return 'Two 5-digit US ZIP codes, please.';
    var date = v('[data-q="date"]');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Pick a pickup date.';
    if (date < today()) return 'Pick a pickup date from today on.';
    var list = readItems();
    for (var i = 0; i < list.length; i++) {
      var it = list[i], qty = num(it.qty), lbs = num(it.lbs), dims = [it.l, it.w, it.h], set = dims.filter(Boolean).length;
      if (!(qty >= 1 && qty <= 999)) return 'Each item needs a quantity, a whole number from 1 to 999.';
      if (!(lbs >= 1 && lbs <= 50000)) return 'Each item needs a weight in pounds per piece, up to 50,000.';
      if (set && set < 3) return 'Give all three dimensions for an item, or leave them blank.';
      if (set && dims.some(function (x) { var n = num(x); return !(n >= 1 && n <= 999); })) return 'Dimensions are whole inches, up to 999.';
    }
    if (totals().lb > 200000) return 'That is over 200,000 lb in total. Call ' + PHONE + ' and we will plan it with you.';
    if (!v('[data-q="name"]')) return 'Your name.';
    if (!v('[data-q="company"]')) return 'Your company.';
    if (!EMAIL.test(v('[data-q="email"]'))) return 'A work email we can send the quote to.';
    return '';
  }
  function ids(kind) { return OPTS.filter(function (o) { return o.k === kind && chosen[o.id]; }).map(function (o) { return o.id; }); }
  function titles(kind) { return OPTS.filter(function (o) { return o.k === kind && chosen[o.id]; }).map(function (o) { return o.t; }); }
  function payload(tok) {
    var p = { kind: 'quote_page', from: v('[data-q="from"]'), to: v('[data-q="to"]'), date: v('[data-q="date"]'), items: readItems(), pickup: ids('pickup'), delivery: ids('delivery'),
      name: v('[data-q="name"]'), company: v('[data-q="company"]'), email: v('[data-q="email"]'), phone: v('[data-q="phone"]'), note: v('[data-q="note"]'), website: v('[data-q="website"]'), token: tok };
    if (fromPlace) p.fromPlace = fromPlace;
    if (toPlace) p.toPlace = toPlace;
    return p;
  }
  function done() {
    var t = totals(), pu = titles('pickup'), dl = titles('delivery');
    q('[data-q-summary]').textContent = v('[data-q="from"]') + ' → ' + v('[data-q="to"]') + ' · ' + t.n.toLocaleString('en-US') + (t.n === 1 ? ' item' : ' items') + ' · ' + t.lb.toLocaleString('en-US') + ' lbs' + (pu.length ? ' · Pickup: ' + pu.join(', ') : '') + (dl.length ? ' · Delivery: ' + dl.join(', ') : '');
    q('[data-qstep="1"]').hidden = true;
    var d2 = q('[data-qstep="2"]'); d2.hidden = false;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    d2.focus({ preventScroll: true });
  }
  btn.addEventListener('click', function () {
    if (btn.disabled) return;
    var msg = check(); if (msg) return fail(msg);
    err.hidden = true;
    // No endpoint, no fetch or no Turnstile (blocked by an extension, say): an error, never a false "sent".
    if (!ENDPOINT || !window.fetch || !window.Promise) return fail(FAIL);
    if (!window.turnstile) return fail("The spam check didn't load, so we can't send this from here. Refresh the page, or call " + PHONE + '.');
    busy(true);
    getToken(8000).then(function (tok) {
      if (!tok) { busy(false); resetCheck(); return fail('Still checking this is a person. Give it a moment and press send again, or call ' + PHONE + '.'); }
      return fetch(ENDPOINT, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload(tok)) })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.ok && j && j.ok === true) { done(); return; }
            throw new Error(String(r.status));
          });
        })
        .catch(function (e) { busy(false); resetCheck(); fail(STATUS[+(e && e.message)] || FAIL); });
    });
  });
  root.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.target.closest('.qitem')) { e.preventDefault(); btn.click(); } });
})();
