#!/usr/bin/env python3
"""Writes the "The software behind your freight" section into src/pages/home.html between the
<!-- product:start --> and <!-- product:end --> markers. All data is fictional (Harvest Lane Foods)."""
import math, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
PAGE = ROOT / 'src/pages/home.html'

# ---------- map geometry ----------
OUTLINE = [(-117.1,32.5),(-117.3,33.0),(-118.4,33.8),(-118.9,34.0),(-120.5,34.5),(-120.7,35.2),(-121.9,36.6),(-122.4,37.2),(-122.5,37.8),(-123.0,38.3),(-123.7,38.9),(-124.1,40.0),(-124.4,40.4),(-124.1,41.5),(-124.5,42.8),(-124.1,43.7),(-124.0,44.7),(-124.0,46.2),(-124.1,46.9),(-124.7,47.9),(-124.7,48.4),(-123.0,48.1),(-122.8,49.0),(-95.2,49.0),(-95.2,49.4),(-94.8,49.3),(-94.6,48.7),(-92.5,48.4),(-89.6,48.0),(-88.4,48.3),(-86.5,47.5),(-84.8,46.9),(-84.5,46.5),(-83.6,46.0),(-83.0,45.8),(-82.5,45.3),(-82.1,43.6),(-82.5,42.9),(-83.1,42.0),(-82.7,41.7),(-80.5,42.3),(-79.0,42.8),(-79.2,43.4),(-76.8,43.6),(-76.2,44.1),(-74.9,45.0),(-71.5,45.0),(-70.9,45.3),(-70.0,46.7),(-69.2,47.4),(-68.2,47.3),(-67.8,47.1),(-67.8,45.7),(-67.0,44.9),(-68.0,44.4),(-69.3,43.9),(-70.2,43.6),(-70.8,42.7),(-70.6,41.8),(-70.0,41.7),(-71.4,41.5),(-72.5,41.3),(-73.9,40.6),(-74.0,40.3),(-74.2,39.7),(-75.0,38.8),(-75.4,38.0),(-76.0,37.0),(-75.9,36.5),(-75.7,35.6),(-76.4,34.9),(-77.4,34.4),(-78.5,33.9),(-79.3,33.2),(-80.6,32.4),(-81.2,31.5),(-81.5,30.7),(-81.4,30.0),(-80.8,28.6),(-80.4,27.5),(-80.1,26.5),(-80.1,25.6),(-80.8,25.1),(-81.5,25.6),(-82.0,26.5),(-82.6,27.6),(-82.8,28.5),(-83.2,29.4),(-84.0,30.1),(-85.0,29.7),(-85.6,30.2),(-86.5,30.4),(-87.5,30.3),(-88.2,30.4),(-89.3,30.3),(-89.9,29.7),(-90.3,29.2),(-91.3,29.3),(-92.1,29.6),(-93.3,29.8),(-94.5,29.5),(-95.1,29.2),(-96.3,28.6),(-97.1,27.9),(-97.4,27.0),(-97.2,26.0),(-98.2,26.1),(-99.1,26.4),(-99.5,27.5),(-100.6,28.0),(-101.4,29.8),(-102.4,29.8),(-103.1,29.0),(-104.0,29.3),(-104.7,30.2),(-105.9,31.3),(-106.5,31.8),(-108.2,31.8),(-108.2,31.3),(-111.1,31.3),(-114.8,32.5),(-114.7,32.7)]
K, CX = 20.0, math.cos(math.radians(38))
def P(lon, lat): return (round((lon + 125.5) * CX * K + 10, 1), round((49.6 - lat) * K + 10, 1))
W, H = 950, 520

CITIES = {
  'fresno': ('Fresno, CA', -119.8, 36.7), 'denver': ('Denver, CO', -104.9, 39.7), 'portland': ('Portland, OR', -122.7, 45.5),
  'phoenix': ('Phoenix, AZ', -112.1, 33.4), 'kc': ('Kansas City, MO', -94.6, 39.1), 'chicago': ('Chicago, IL', -87.6, 41.9),
  'atlanta': ('Atlanta, GA', -84.4, 33.7), 'dallas': ('Dallas, TX', -96.8, 32.8), 'allentown': ('Allentown, PA', -75.5, 40.6),
  'boston': ('Boston, MA', -71.1, 42.4), 'charlotte': ('Charlotte, NC', -80.8, 35.2), 'minneapolis': ('Minneapolis, MN', -93.3, 45.0),
  'seattle': ('Seattle, WA', -122.3, 47.6), 'slc': ('Salt Lake City, UT', -111.9, 40.8),
}
# load, PO, origin key, origin facility, dest key, dest facility, status, progress (0-1 if moving), last report
LOADS = [
  ('HL-2206', 'PO 4466', 'fresno', 'Harvest Lane Foods plant', 'denver', 'Grocery DC', 'delivered', None, 'Delivered Wed 2:40 pm'),
  ('HL-2209', 'PO 4470', 'fresno', 'Harvest Lane Foods plant', 'phoenix', 'Club DC', 'risk', .62, 'last reported 1h 20m ago'),
  ('HL-2210', 'PO 4473', 'kc', 'Co-packer', 'chicago', 'Grocery DC', 'ontime', .45, 'last reported 25 min ago'),
  ('HL-2211', 'PO 4474', 'kc', 'Co-packer', 'atlanta', 'Regional DC', 'late', .8, 'last reported 2h ago'),
  ('HL-2212', 'PO 4475', 'fresno', 'Harvest Lane Foods plant', 'dallas', 'Grocery DC', 'ontime', .55, 'last reported 40 min ago'),
  ('HL-2213', 'PO 4477', 'allentown', 'Co-packer', 'boston', 'Grocery DC', 'ontime', .3, 'last reported 15 min ago'),
  ('HL-2214', 'PO 4478', 'allentown', 'Co-packer', 'charlotte', 'Natural foods DC', 'ontime', None, 'Booked · picks up Thu'),
  ('HL-2215', 'PO 4480', 'kc', 'Co-packer', 'minneapolis', 'Grocery DC', 'risk', .5, 'last reported 55 min ago'),
  ('HL-2216', 'PO 4481', 'fresno', 'Harvest Lane Foods plant', 'seattle', 'Grocery DC', 'ontime', .7, 'last reported 30 min ago'),
  ('HL-2217', 'PO 4482', 'fresno', 'Harvest Lane Foods plant', 'slc', 'Natural foods DC', 'ontime', None, 'Booked · picks up Fri'),
]
def lane_path(o, d):
  (x1, y1), (x2, y2) = P(*CITIES[o][1:]), P(*CITIES[d][1:])
  mx, my = (x1 + x2) / 2, (y1 + y2) / 2
  dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1
  cx, cy = mx - dy / L * L * .22, my + dx / L * L * .22   # bow the lane
  return f'M{x1} {y1} Q{cx:.1f} {cy:.1f} {x2} {y2}'

def map_svg(loads, small=False):
  return (pathlib.Path(__file__).parent / ('map-phone.svg' if small else 'map-desktop.svg')).read_text()

STATUS = {'delivered': ('Delivered', 'ok'), 'risk': ('At risk', 'warn'), 'ontime': ('In transit', 'go'), 'late': ('Late', 'risk'), 'booked': ('Booked', 'info')}

# ---------- app shell ----------
NAV = ['Shipments', 'Map', 'Documents', 'Alerts', 'Deductions', 'Account']
def shell(kind, on, title, body, badge, cursor=True, cls=''):
  nav = ''.join(f'<span class="app__navi{" is-on" if n == on else ""}">{n}</span>' for n in NAV)
  cur = '<span class="app__cursor" aria-hidden="true"><svg width="18" height="20" viewBox="0 0 18 20" fill="none"><path d="M1 1l6.5 16 2.3-6.3L16 8.4 1 1z" fill="#15140F" stroke="#FFFFFF" stroke-width="1.3" stroke-linejoin="round"/></svg><i class="app__click"></i></span>' if cursor else ''
  b = '<span class="tag-live">Live today</span>' if badge == 'live' else '<span class="tag-soon">Coming soon</span>'
  return f'''<div class="app {cls}" data-app="{kind}" aria-hidden="true">
  <div class="app__bar"><span class="app__dots"><i></i><i></i><i></i></span><span class="app__url">labs.valencesupplychain.com</span><span class="app__badge">{b}</span></div>
  <div class="app__frame">
    <nav class="app__nav"><img class="app__logo" src="/assets/img/brand/valence-mark.png" alt="" width="28" height="28"><span class="app__org">Harvest Lane Foods</span>{nav}</nav>
    <div class="app__main">
      <div class="app__head"><span class="app__title">{title}</span><span class="app__clock" data-clock></span></div>
      {body}
    </div>
  </div>
  {cur}
</div>'''

def chips(*names, new=None):
  return ''.join(f'<span class="docchip{" docchip--new" if n == new else ""}">{n}</span>' for n in names)

# ---------- screen 1: shipments list ----------
ROWS = [
  ('HL-2206', 'PO 4466', 'Fresno plant → Grocery DC, Denver CO', 'Tue 8:00 am', 'Wed 1:00–3:00 pm', 'delivered', 'Delivered 2:40 pm', ('BOL', 'POD')),
  ('HL-2212', 'PO 4475', 'Fresno plant → Grocery DC, Dallas TX', 'Wed 7:00 am', 'Fri 9:00 am', 'ontime', 'Last update 40 min ago near Amarillo, TX', ('BOL',)),
  ('HL-2209', 'PO 4470', 'Fresno plant → Club DC, Phoenix AZ', 'Wed 9:30 am', 'Thu 2:00 pm', 'risk', 'Last update 1h 20m ago near Blythe, CA', ('BOL',)),
  ('HL-2210', 'PO 4473', 'Co-packer, Kansas City MO → Grocery DC, Chicago IL', 'Wed 6:00 am', 'Thu 10:00 am', 'ontime', 'Last update 25 min ago near Des Moines, IA', ('BOL',)),
  ('HL-2211', 'PO 4474', 'Co-packer, Kansas City MO → Regional DC, Atlanta GA', 'Tue 1:00 pm', 'Thu 8:00 am', 'late', 'Exception: pallet damaged at receiving, photo on file', ('BOL', 'POD')),
  ('HL-2213', 'PO 4477', 'Co-packer, Allentown PA → Grocery DC, Boston MA', 'Thu 5:00 am', 'Thu 6:00 am (moved)', 'ontime', 'Picked up 5:04 am', ('BOL',)),
  ('HL-2214', 'PO 4478', 'Co-packer, Allentown PA → Natural foods DC, Charlotte NC', 'Thu 10:00 am', 'Fri 3:00 pm', 'booked', 'Carrier confirmed', ()),
  ('HL-2198', 'PO 4471', 'Fresno plant → Grocery DC, Denver CO', 'Oct 27 8:00 am', 'Oct 28 1:00 pm', 'delivered', 'Delivered Oct 28 · POD missing', ('BOL',)),
]
def shipments():
  tr = []
  for load, po, lane, pu, dl, st, upd, docs in ROWS:
    label, kind = STATUS[st]
    tr.append(f'<tr data-row="{load}"><td><b>{load}</b><small>{po}</small></td><td>{lane}</td><td>{pu}<small>{dl}</small></td><td><span class="st st--{kind}">{label}</span><small class="app__upd">{upd}</small></td><td>{chips(*docs)}</td></tr>')
  body = f'''<div class="app__tools"><span class="app__search"><i></i>Search by load or PO</span><span class="app__filter is-on">All</span><span class="app__filter">In transit</span><span class="app__filter">Exceptions</span><span class="app__filter">This week ▾</span></div>
      <div class="app__scroll"><table class="app__table app__table--ship"><thead><tr><th>Load</th><th>Lane</th><th>Pickup · delivery appt</th><th>Status</th><th>Docs</th></tr></thead><tbody>{''.join(tr)}</tbody></table></div>'''
  return shell('ship', 'Shipments', 'Shipments · 8 this week', body, 'live')

# ---------- screen 2: shipment detail ----------
TIMELINE = [
  ('done', 'Booked', 'Mon Oct 20 · 9:14 am', 'Carrier confirmed, appointment set'),
  ('done', 'Picked up', 'Tue Oct 21 · 7:50 am', 'Harvest Lane Foods plant, Fresno CA · appt 8:00 am'),
  ('done', 'Check-call', 'Tue · 12:10 pm', 'Near Barstow, CA'),
  ('done', 'Check-call', 'Tue · 6:40 pm', 'Near Flagstaff, AZ'),
  ('done', 'Check-call', 'Wed · 9:05 am', 'Near Grand Junction, CO'),
  ('ok', 'Delivered', 'Wed Oct 22 · 2:40 pm', 'Grocery DC, Denver CO · appt 1:00–3:00 pm · signed 2:41 pm'),
]
def detail_body(compact=False):
  tl = ''.join(f'<li class="tl__item tl__item--{k}"><i></i><div><b>{t}</b><span class="tl__when">{w}</span><span class="tl__sub">{s}</span></div></li>' for k, t, w, s in TIMELINE)
  return f'''<div class="app__panel-head"><div><b>HL-2206</b> <span class="app__muted">· PO 4466 · 22 pallets, dry</span></div><span class="st st--ok">Delivered</span></div>
      <div class="app__cols">
        <ol class="tl">{tl}</ol>
        <div class="app__side">
          <div class="app__kv"><span>Appointment</span><b>Wed 1:00–3:00 pm</b></div>
          <div class="app__kv"><span>Arrived</span><b>Wed 2:40 pm · on time</b></div>
          <div class="app__docs">
            <div class="app__docrow"><span class="docchip">BOL</span><span>BOL_HL-2206.pdf</span><em>View</em><em>Download</em></div>
            <div class="app__docrow"><span class="docchip docchip--new">POD</span><span>POD_HL-2206_signed.pdf</span><em>View</em><em>Download</em></div>
          </div>
          <div class="app__note">No exceptions on this load.</div>
          <span class="app__btn">Message Valence</span>
        </div>
      </div>'''
def detail():
  return shell('detail', 'Shipments', 'Shipments › HL-2206', detail_body(), 'live', cursor=False)

# ---------- screen 3: map hero ----------
def map_screen():
  panel = f'''<div class="vmap__panel" data-panel hidden>
        <div class="vmap__panel-head"><div><b>HL-2206</b><span class="app__muted"> · PO 4466</span></div><span class="st st--ok">Delivered</span></div>
        <div class="vmap__panel-lane">Harvest Lane Foods plant, Fresno CA → Grocery DC, Denver CO</div>
        <ol class="tl tl--tight">{''.join(f'<li class="tl__item tl__item--{k}{" tl__item--call" if t == "Check-call" else ""}"><i></i><div><b>{t}</b><span class="tl__when">{w}</span><span class="tl__sub">{s}</span></div></li>' for k, t, w, s in TIMELINE)}</ol>
        <div class="app__docs"><div class="app__docrow"><span class="docchip">BOL</span><span>BOL_HL-2206.pdf</span><em>View</em></div><div class="app__docrow"><span class="docchip docchip--new">POD</span><span>POD_HL-2206_signed.pdf</span><em>View</em></div></div>
        <span class="app__btn">Message Valence</span>
      </div>'''
  body = f'''<div class="vmap" data-vmap>
        <div class="vmap__stage">{map_svg(LOADS)}
        <div class="vmap__legend"><span><i class="lg lg--ontime"></i>On time</span><span><i class="lg lg--risk"></i>At risk</span><span><i class="lg lg--late"></i>Late</span><span><i class="lg lg--delivered"></i>Delivered</span><span class="vmap__legend-note">Positions come from carrier check-calls, not live GPS.</span></div></div>
        {panel}
      </div>'''
  return shell('map', 'Map', 'Map · 10 active loads', body, 'soon', cls='app--map')

# ---------- screen 4: documents ----------
DOCS = [('HL-2206', 'PO 4466', 'Oct 22', 'POD', 'signed'), ('HL-2206', 'PO 4466', 'Oct 21', 'BOL', ''), ('HL-2211', 'PO 4474', 'Oct 23', 'POD', 'signed'),
        ('HL-2211', 'PO 4474', 'Oct 21', 'BOL', ''), ('HL-2205', 'PO 4465', 'Oct 20', 'POD', 'signed'), ('HL-2198', 'PO 4471', 'Oct 27', 'BOL', ''), ('HL-2197', 'PO 4469', 'Oct 27', 'POD', 'signed')]
def documents():
  rows = ''.join(f'<tr{" class=is-sel" if i == 0 else ""}><td><b>{l}</b></td><td>{po}</td><td>{d}</td><td><span class="docchip{" docchip--new" if t == "POD" else ""}">{t}</span> {n}</td><td><em>View</em> <em>Download</em></td></tr>' for i, (l, po, d, t, n) in enumerate(DOCS))
  body = f'''<div class="app__tools"><span class="app__search"><i></i>Search by load, PO or date</span><span class="app__filter is-on">All</span><span class="app__filter">POD</span><span class="app__filter">BOL</span></div>
      <div class="app__cols app__cols--docs">
        <div class="app__scroll"><table class="app__table"><thead><tr><th>Load</th><th>PO</th><th>Date</th><th>Document</th><th></th></tr></thead><tbody>{rows}</tbody></table></div>
        <div class="app__preview"><div class="app__page"><b>Proof of delivery</b><span>HL-2206 · PO 4466</span><i></i><i></i><i></i><i></i><span class="app__page-sig">Received in full · 22 plts · 2:41 pm</span></div><div class="app__preview-cap">POD_HL-2206_signed.pdf · kept in your account</div></div>
      </div>'''
  return shell('docs', 'Documents', 'Documents · 214 on file', body, 'live', cursor=False)

# ---------- screen 5: alerts ----------
ALERTS = [
  ('warn', 'At risk', 'HL-2209 · Club DC, Phoenix AZ', 'Running about 50 minutes behind the 2:00 pm appointment.', 'Valence is following up and will rebook the appointment if it slips.'),
  ('risk', 'POD missing', 'HL-2198 · PO 4471', 'Delivered Oct 28; no signed POD received yet. A signed copy protects you from a short-pay.', 'Valence is following up with the receiver.'),
  ('info', 'Appointment changed', 'HL-2213 · Grocery DC, Boston MA', 'Receiver moved delivery to Thu 6:00 am.', 'Nothing to do. Your confirmation is on file.'),
  ('risk', 'Exception', 'HL-2211 · Regional DC, Atlanta GA', 'Pallet damaged at receiving: photo on file.', 'Valence is on it; a claim is being prepared for your approval.'),
]
def alerts():
  items = ''.join(f'<div class="al"><span class="st st--{k}">{t}</span><div><b>{who}</b><p>{what}</p><p class="al__doing"><i></i>{doing}</p></div><em>Message Valence</em></div>' for k, t, who, what, doing in ALERTS)
  return shell('alerts', 'Alerts', 'Alerts · 4 open', f'<div class="al__list">{items}</div>', 'soon', cursor=False)

# ---------- screen 6: deductions ----------
DED = [
  ('Northgate Grocers', 'Short ship', 'PO 4466', 'HL-2206', '-$1,240', 'Nov 3', 'disputable', 'Disputable', 'Signed POD shows full quantity', ('POD', 'BOL', 'Appt')),
  ('Prairie Club', 'Missing POD', 'PO 4471', 'HL-2198', '-$2,100', 'Oct 30', 'new', 'New', 'Signed POD for PO 4471 would win this one', ('BOL',)),
  ('Summit Natural', 'Late delivery', 'PO 4452', 'HL-2199', '-$380', 'Nov 1', 'not', 'Not disputable', 'Delivered after the window', ('POD', 'BOL')),
  ('Bayline Markets', 'Unit price', 'PO 4440', 'HL-2187', '-$615', 'Oct 24', 'indispute', 'In dispute', 'Filed Oct 28', ('POD', 'BOL', 'Invoice')),
  ('Northgate Grocers', 'Shortage', 'PO 4421', 'HL-2170', '-$860', 'Oct 12', 'recovered', 'Recovered', 'Credited Nov 2', ('POD', 'BOL')),
]
DST = {'disputable': 'go', 'new': 'warn', 'not': 'info', 'indispute': 'go', 'recovered': 'ok'}
def deductions():
  rows = ''.join(f'<tr data-ded="{po}"><td><b>{r}</b><small>{why} · {dt}</small></td><td>{po}<small>{load}</small></td><td class="app__num neg">{amt}</td><td><span class="st st--{DST[k]}" data-ded-st>{lab}</span><small data-ded-why>{why2}</small></td><td>{chips(*ev)}</td></tr>' for r, why, po, load, amt, dt, k, lab, why2, ev in DED)
  body = f'''<div class="app__strip"><div><span>Deducted this month</span><b class="neg">$5,195</b></div><div><span>Disputable now</span><b>$1,240</b></div><div><span>Missing evidence</span><b>$2,100</b><small>Signed POD for PO 4471 would win this one</small></div><div><span>Recovered</span><b class="app__ok" data-recovered>$860</b></div></div>
      <div class="app__scroll"><table class="app__table app__table--ded"><thead><tr><th>Retailer · reason</th><th>PO · load</th><th>Amount</th><th>Status</th><th>Evidence</th></tr></thead><tbody>{rows}</tbody></table></div>
      <div class="app__packet" data-packet><div><b>Dispute packet · PO 4466</b><span class="app__muted"> · drafted by Valence, waiting for your approval</span><p>Short ship claim of $1,240 against a signed POD showing 22 of 22 pallets received. Packet: POD, BOL, appointment confirmation, invoice.</p></div><div class="app__row"><span class="app__btn" data-btn-approve>Approve and send</span><span class="app__btn app__btn--ghost">Edit</span></div></div>
      <div class="app__toast" data-toast hidden><span class="dot" style="--dot:var(--green)"></span><span><b>Sent to Northgate Grocers.</b> Nothing goes out without your approval.</span></div>'''
  return shell('ded', 'Deductions', 'Deductions · November', body, 'soon', cls='app--tall')

# ---------- phones ----------
def phone(kind, title, body):
  tabs = ''.join(f'<span class="{"is-on" if t == title else ""}"><i class="ptab ptab--{t.lower()}"></i>{t}</span>' for t in ['Shipments', 'Map', 'Docs', 'Alerts'])
  return f'''<div class="phone" data-phone="{kind}" aria-hidden="true">
            <div class="phone__screen">
              <div class="phone__status"><span>9:41</span><span class="phone__island"></span><span class="phone__sys"><i class="phone__cell"></i><i class="phone__wifi"></i><i class="phone__batt"></i></span></div>
              <div class="phone__nav"><img src="/assets/img/brand/valence-mark.png" alt="" width="22" height="22"><span class="phone__org">Harvest Lane Foods</span><span class="phone__bell"></span></div>
              <h4 class="phone__title">{title}</h4>
              <div class="phone__body">{body}</div>
              <div class="phone__tabs">{tabs}</div>
              <div class="phone__home"></div>
            </div>
          </div>'''
def phone_list():
  cards = ''
  for load, po, lane, pu, dl, st, upd, docs in ROWS[:5]:
    label, kind = STATUS[st]
    cards += f'<div class="pcard"><div class="pcard__top"><b>{load}</b><span class="st st--{kind}">{label}</span></div><div class="pcard__lane">{lane}</div><div class="pcard__meta">{dl} · {chips(*docs) or "no docs yet"}</div><div class="pcard__upd">{upd}</div></div>'
  return phone('list', 'Shipments', f'<div class="phone__search"><i></i>Search by load or PO</div><div class="phone__seg"><span class="is-on">All</span><span>In transit</span><span>Exceptions</span></div>{cards}')
def phone_map():
  west = [l for l in LOADS if l[2] == 'fresno']
  return phone('map', 'Map', f'<div class="phone__map">{map_svg(west, small=True)}</div><div class="phone__sheet"><i class="phone__grab"></i><div class="pcard__top"><b>HL-2212</b><span class="st st--go">In transit</span></div><div class="pcard__lane">Fresno plant → Grocery DC, Dallas TX</div><div class="pcard__upd">Last reported 40 min ago near Amarillo, TX · delivery Fri 9:00 am</div><span class="app__btn app__btn--full">Message Valence</span></div>')

# ---------- proof between the screens (real, approved copy; moved from the testimonial and proof band) ----------
SPROUTS = '''<figure class="tquote tquote--inline">
          <span class="tquote__mark" aria-hidden="true">“</span>
          <blockquote class="tquote__text"><p>Getting into Sprouts through Forager Finds was the easy part, we quickly realized staying there was the hard part. Valence took everything off our plate, freight shipping into the DCs, chasing our co-packer and suppliers on dates, keeping track of inventory across every place it sat. We’re a small brand and Valence treated us like its biggest account, and when our review came up we were in stock and ready. The team caught problems before we did, every time.</p></blockquote>
          <figcaption class="tquote__by">
            <span class="tquote__avatar"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M10 2.5h4M10.5 2.5v4.2c0 .6-.3 1.1-.7 1.5C8.6 9.3 8 10.6 8 12v8a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 16 20v-8c0-1.4-.6-2.7-1.8-3.8-.4-.4-.7-.9-.7-1.5V2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 14h8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></span>
            <span class="tquote__who"><span class="tquote__name">Emerging beverage brand</span><span class="tquote__meta">Sprouts Forager Finds</span></span>
            <span class="tquote__tag">Valence client</span>
          </figcaption>
        </figure>'''
GLOSSIER = '''<article class="proofcard proofcard--inline proofcard--row">
          <p class="proofcard__tag">Beauty, summer reefer</p>
          <p class="proofcard__n">$0<span>in heat claims, down from $63K</span></p>
          <p class="proofcard__quote">Heat-sensitive oils and emulsions for Glossier, from a Dallas warehouse to retail DCs across the South and Southwest, June to September. 214 refrigerated loads at 60 to 65°F, and not one rejected at receiving.</p>
          <p class="proofcard__by">Valence · Glossier</p>
        </article>'''
CARRIERS = '''<article class="proofcard proofcard--inline">
          <p class="proofcard__tag">The network</p>
          <p class="proofcard__n">3,850<span>carriers our team has worked with</span></p>
          <p class="proofcard__quote">Thirteen years of lanes for brewers, bakeries, beverage brands and manufacturers across the US and Canada. When one truck falls through, we already know the next one.</p>
          <p class="proofcard__by">Valence · Our carrier record</p>
        </article>'''

# ---------- the section ----------
def section():
  return f'''<!-- product:start -->
  <section class="how" id="how-it-works" aria-labelledby="how-title">
    <div class="container">
      <div class="how__head" data-reveal>
        <p class="eyebrow">How it works</p>
        <h2 id="how-title" class="h2">Not a normal brokerage. The software is why it's fast.</h2>
        <p class="lede">A broker opens your email, calls three carriers and gets back to you tomorrow. Here, your two ZIPs land in a system that already has our lane history in front of it: the carriers we have run on that corridor and what they cost last time. That is why your quote comes back fast, not tomorrow.</p>
      </div>
      <ol class="how__steps" data-reveal="stagger">
        <li class="how__step">
          <span class="how__n">01</span>
          <h3>Quoted fast, because of the system.</h3>
          <p>Your request arrives with the lane, the equipment and our own history on that corridor already pulled up: carriers we have run it with, what they charged, which ones delivered on time. Your quote comes back by email, with accessorials itemized.</p>
        </li>
        <li class="how__step">
          <span class="how__n">02</span>
          <h3>Booked and watched, by the software and the team.</h3>
          <p>Appointment set, carrier confirmed, check-calls logged as they come in. The system flags a truck that goes quiet or a window a receiver moved; a person makes the call. You hear about it once it is fixed, in plain language, not a status code.</p>
          <p class="how__fine">You never deal with the carrier, the driver or the dispatcher. One number, any hour.</p>
        </li>
        <li class="how__step">
          <span class="how__n">03</span>
          <h3>Proof lands with the load.</h3>
          <p>The signed POD and BOL are in your account the day it delivers. Weeks later, when a retailer short-pays, the proof is already matched to the PO, and the dispute is drafted for your approval. Nothing goes out without your yes.</p>
          <p class="how__fine">Deductions and chargebacks recovery is coming soon; the documents are live today.</p>
        </li>
      </ol>
    </div>
  </section>

  <section class="free" id="free" aria-labelledby="free-title">
    <div class="container net__inner">
      <div class="net__copy">
        <p class="eyebrow">How it gets cheaper</p>
        <h2 id="free-title" class="h2">We earn on the freight. The software comes free.</h2>
        <p class="lede">Every load you move with us comes with Valence Labs, the account shown below: where it is, the documents, the deductions. No seat fees, no platform fee, no contract. We make money the way a good broker does, on the freight, so the only way we grow is by moving yours well enough that you send the next one.</p>
        <ul class="net__free" data-reveal="stagger">
          <li><b>$0</b><span>for the software, for as long as you ship with us</span></li>
          <li><b>One margin</b><span>on the freight, itemized before you book</span></li>
          <li><b>Every load</b><span>lands in the account below: tracking, documents, proof</span></li>
        </ul>
      </div>
    </div>
  </section>

  <section class="prod" id="product" aria-labelledby="prod-title">
    <div class="container">
      <div class="prod__head" data-reveal>
        <p class="eyebrow">Your account</p>
        <h2 id="prod-title" class="h2">Everything we know about your freight, in one place you can read in a minute.</h2>
        <p class="lede">Valence Labs comes with every load we move. It is not a dashboard to learn; it is where the answer already is when you wonder where something is. Fictional shipper shown.</p>
      </div>

      <figure class="prod__shot prod__shot--callouts" data-reveal>
        <div class="callouts__stage">
{shipments()}
          <span class="callout" style="--x:31%;--y:34%"><b>1</b></span>
          <span class="callout" style="--x:72%;--y:46%"><b>2</b></span>
          <span class="callout" style="--x:93%;--y:44%"><b>3</b></span>
        </div>
        <figcaption>
          <p class="callout__t"><b>1</b> Every load with your PO on it, the lane as a facility and a city, and both appointments. Search by load or PO.</p>
          <p class="callout__t"><b>2</b> Where it is, in words: "Last update 40 min ago near Amarillo, TX." Statuses are Booked, Picked up, In transit, Delivered, Exception. An exception says what happened and what we are doing.</p>
          <p class="callout__t"><b>3</b> The documents, as chips. BOL at pickup, POD the day it delivers. Click to view or download.</p>
          <p class="callout__fine"><span class="tag-live">Live today</span> Shipments, shipment detail, documents. No carrier names, truck numbers or rates on any screen.</p>
        </figcaption>
      </figure>

      <div class="prod__break" data-reveal>{SPROUTS}</div>

      <figure class="prod__shot prod__shot--callouts" data-reveal>
        <div class="callouts__stage">
{deductions()}
          <span class="callout" style="--x:14%;--y:20%"><b>1</b></span>
          <span class="callout" style="--x:60%;--y:44%"><b>2</b></span>
          <span class="callout" style="--x:40%;--y:84%"><b>3</b></span>
        </div>
        <figcaption>
          <p class="callout__t"><b>1</b> What was taken this month, what is disputable now, and what is missing. "Signed POD for PO 4471 would win this one" is the sentence that gets money back.</p>
          <p class="callout__t"><b>2</b> Each deduction matched to its load and PO with the evidence on file, and a plain verdict: Disputable, with the reason, or Not disputable, with the reason.</p>
          <p class="callout__t"><b>3</b> The dispute packet, drafted by us, waiting for your approval. Watch it go to In dispute, then Recovered.</p>
          <p class="callout__fine"><span class="tag-soon">Coming soon</span> Deductions, the live map, alerts, and an assistant in your own email and Slack. We will not show you a screen we have not built.</p>
        </figcaption>
      </figure>

    </div>
  </section>

  <section class="proofrow" aria-label="Proof">
    <div class="container" data-reveal>
      {GLOSSIER}
    </div>
  </section>
<!-- product:end -->'''

src = PAGE.read_text()
new = section()
if '<!-- product:start -->' in src:
  src = re.sub(r'<!-- product:start -->.*?<!-- product:end -->', lambda m: new, src, flags=re.S)
else:
  a = src.index('  <section class="saves"'); b = src.index('  <section class="cpg"')
  src = src[:a] + new + '\n\n' + src[b:]
PAGE.write_text(src)
print('wrote product section', len(new), 'chars')
