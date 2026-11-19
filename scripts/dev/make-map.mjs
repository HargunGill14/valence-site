// Builds the map SVG used by the product section from us-atlas (public domain, Census cartographic
// boundaries, pre-projected Albers USA 975x610). Writes scripts/dev/map-desktop.svg and map-phone.svg,
// which make-product-section.py inlines. Run from a folder where us-atlas, topojson-client and d3-geo
// are installed: node /path/to/make-map.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(process.cwd() + '/');
const { feature, mesh, merge } = require('topojson-client');
const { presimplify, simplify, quantile } = require('topojson-simplify');
const { geoAlbersUsa, geoPath } = require('d3-geo');
const here = path.dirname(fileURLToPath(import.meta.url));

let us = JSON.parse(readFileSync(require.resolve('us-atlas/states-albers-10m.json'), 'utf8'));
us = presimplify(us); us = simplify(us, quantile(us, 0.45));   // keep the recognisable shape, drop the coastline noise
const fmt = geoPath().digits(0);
const lower48 = (f) => !['02', '15', '72'].includes(f.id);   // Alaska, Hawaii, Puerto Rico
const states = feature(us, us.objects.states).features.filter(lower48);
const bordersPath = fmt(mesh(us, us.objects.states, (a, b) => a !== b && lower48(a) && lower48(b)));
const landPath = fmt(merge(us, us.objects.states.geometries.filter(lower48)));

// the atlas is projected with geoAlbersUsa().scale(1300).translate([487.5, 305]); project cities the same way
const proj = geoAlbersUsa().scale(1300).translate([487.5, 305]);
const P = (lon, lat) => proj([lon, lat]).map((v) => +v.toFixed(1));

const CITIES = {
  vancouver: ['Vancouver', -123.12, 49.28], toronto: ['Toronto', -79.38, 43.65], montreal: ['Montreal', -73.57, 45.50], calgary: ['Calgary', -114.07, 51.05],
  reno: ['Reno', -119.81, 39.53], vegas: ['Las Vegas', -115.14, 36.17], elpaso: ['El Paso', -106.49, 31.76], sanantonio: ['San Antonio', -98.49, 29.42],
  memphis: ['Memphis', -90.05, 35.15], nashville: ['Nashville', -86.78, 36.16], stlouis: ['St. Louis', -90.20, 38.63], indianapolis: ['Indianapolis', -86.16, 39.77],
  columbus: ['Columbus', -82.99, 39.96], detroit: ['Detroit', -83.05, 42.33], pittsburgh: ['Pittsburgh', -79.99, 40.44], philadelphia: ['Philadelphia', -75.17, 39.95],
  richmond: ['Richmond', -77.44, 37.54], jacksonville: ['Jacksonville', -81.66, 30.33], orlando: ['Orlando', -81.38, 28.54], neworleans: ['New Orleans', -90.07, 29.95],
  omaha: ['Omaha', -95.93, 41.26], okc: ['Oklahoma City', -97.52, 35.47], albuquerque: ['Albuquerque', -106.65, 35.08], boise: ['Boise', -116.20, 43.62],
  spokane: ['Spokane', -117.43, 47.66], sacramento: ['Sacramento', -121.49, 38.58], stockton: ['Stockton', -121.29, 37.96], modesto: ['Modesto', -120.99, 37.64],
  seattle: ['Seattle', -122.33, 47.61], portland: ['Portland', -122.68, 45.52], sf: ['San Francisco', -122.42, 37.77], la: ['Los Angeles', -118.24, 34.05],
  fresno: ['Fresno', -119.79, 36.74], phoenix: ['Phoenix', -112.07, 33.45], slc: ['Salt Lake City', -111.89, 40.76], denver: ['Denver', -104.99, 39.74],
  dallas: ['Dallas', -96.80, 32.78], houston: ['Houston', -95.37, 29.76], kc: ['Kansas City', -94.58, 39.10], minneapolis: ['Minneapolis', -93.27, 44.98],
  chicago: ['Chicago', -87.63, 41.88], atlanta: ['Atlanta', -84.39, 33.75], miami: ['Miami', -80.19, 25.76], charlotte: ['Charlotte', -80.84, 35.23],
  dc: ['Washington', -77.04, 38.91], nyc: ['New York', -74.01, 40.71], boston: ['Boston', -71.06, 42.36], allentown: ['Allentown', -75.49, 40.60],
};
const LABEL = ['seattle', 'portland', 'sf', 'la', 'fresno', 'phoenix', 'slc', 'denver', 'dallas', 'houston', 'kc', 'minneapolis', 'chicago', 'atlanta', 'miami', 'dc', 'nyc', 'boston'];
const ANCHOR = { fresno: 'end', sf: 'end', la: 'end', portland: 'end', seattle: 'end', miami: 'start', houston: 'start', nyc: 'start', boston: 'start', dc: 'start' };

// load, origin, dest, status, progress along the lane, last report
const LOADS = [
  ['HL-2206', 'fresno', 'denver', 'delivered', null, ''],
  ['HL-2209', 'fresno', 'phoenix', 'risk', .62, 'last reported 1h 20m ago'],
  ['HL-2210', 'kc', 'chicago', 'ontime', .45, 'last reported 25 min ago'],
  ['HL-2211', 'kc', 'atlanta', 'late', .8, 'last reported 2h ago'],
  ['HL-2212', 'fresno', 'dallas', 'ontime', .55, 'last reported 40 min ago'],
  ['HL-2213', 'allentown', 'boston', 'ontime', .3, 'last reported 15 min ago'],
  ['HL-2214', 'allentown', 'charlotte', 'ontime', null, ''],
  ['HL-2215', 'kc', 'minneapolis', 'risk', .5, 'last reported 55 min ago'],
  ['HL-2216', 'fresno', 'seattle', 'ontime', .7, 'last reported 30 min ago'],
  ['HL-2217', 'fresno', 'slc', 'ontime', null, ''],
];
const HERO = [
  ['la', 'dallas', 'Truckload', 'Dry van', 'ontime'], ['la', 'phoenix', 'LTL', 'LTL', 'ontime'], ['fresno', 'denver', 'Truckload', 'Dry van', 'delivered'],
  ['fresno', 'seattle', 'Truckload', 'Reefer', 'ontime'], ['stockton', 'slc', 'LTL', 'LTL', 'ontime'], ['sacramento', 'portland', 'Truckload', 'Dry van', 'ontime'],
  ['la', 'chicago', 'Truckload', 'Reefer', 'ontime'], ['la', 'atlanta', 'Truckload', 'Dry van', 'ontime'], ['dallas', 'atlanta', 'Truckload', 'Dry van', 'ontime'],
  ['dallas', 'houston', 'LTL', 'LTL', 'delivered'], ['houston', 'neworleans', 'LTL', 'LTL', 'ontime'], ['dallas', 'kc', 'Truckload', 'Dry van', 'ontime'],
  ['kc', 'chicago', 'Truckload', 'Dry van', 'ontime'], ['kc', 'minneapolis', 'LTL', 'LTL', 'risk'], ['chicago', 'detroit', 'LTL', 'LTL', 'ontime'],
  ['chicago', 'columbus', 'Truckload', 'Dry van', 'ontime'], ['stlouis', 'nashville', 'LTL', 'LTL', 'ontime'], ['memphis', 'atlanta', 'Truckload', 'Reefer', 'ontime'],
  ['atlanta', 'orlando', 'Truckload', 'Reefer', 'ontime'], ['atlanta', 'charlotte', 'LTL', 'LTL', 'ontime'], ['charlotte', 'richmond', 'LTL', 'LTL', 'delivered'],
  ['allentown', 'boston', 'Truckload', 'Dry van', 'ontime'], ['allentown', 'charlotte', 'Truckload', 'Dry van', 'ontime'], ['philadelphia', 'pittsburgh', 'LTL', 'LTL', 'ontime'],
  ['nyc', 'dc', 'LTL', 'LTL', 'ontime'], ['pittsburgh', 'detroit', 'Truckload', 'Dry van', 'ontime'], ['boston', 'nyc', 'Truckload', 'Reefer', 'ontime'],
  ['denver', 'kc', 'Truckload', 'Dry van', 'ontime'], ['slc', 'boise', 'LTL', 'LTL', 'ontime'],
  ['phoenix', 'elpaso', 'Truckload', 'Dry van', 'ontime'], ['sanantonio', 'okc', 'Truckload', 'Flatbed', 'ontime'], ['albuquerque', 'denver', 'LTL', 'LTL', 'ontime'],
  ['omaha', 'chicago', 'Truckload', 'Dry van', 'ontime'], ['indianapolis', 'columbus', 'LTL', 'LTL', 'ontime'], ['jacksonville', 'atlanta', 'Truckload', 'Dry van', 'late'],
  ['reno', 'stockton', 'LTL', 'LTL', 'delivered'], ['vegas', 'la', 'Truckload', 'Dry van', 'ontime'], ['spokane', 'seattle', 'LTL', 'LTL', 'ontime'], ['modesto', 'la', 'Truckload', 'Reefer', 'ontime'],
];
const ZIP = { la: '90058', dallas: '75247', phoenix: '85043', fresno: '93725', denver: '80216', seattle: '98108', stockton: '95206', slc: '84104', sacramento: '95828', portland: '97211', chicago: '60632', atlanta: '30336', houston: '77029', neworleans: '70123', kc: '64120', minneapolis: '55413', detroit: '48210', columbus: '43228', stlouis: '63110', nashville: '37210', memphis: '38118', orlando: '32809', charlotte: '28208', richmond: '23224', allentown: '18106', boston: '02128', philadelphia: '19153', pittsburgh: '15220', nyc: '10474', dc: '20018', toronto: 'M9W', montreal: 'H4T', vancouver: 'V6V', boise: '83716', elpaso: '79906', sanantonio: '78219', okc: '73129', albuquerque: '87105', omaha: '68110', indianapolis: '46241', jacksonville: '32218', reno: '89502', vegas: '89115', spokane: '99216', modesto: '95358' };
function lane(o, d) {
  const [x1, y1] = P(CITIES[o][1], CITIES[o][2]), [x2, y2] = P(CITIES[d][1], CITIES[d][2]);
  let dx = x2 - x1, dy = y2 - y1; if (dx < 0) { dx = -dx; dy = -dy; }   // always bow the lane northward
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const cx = mx + dy * .2, cy = my - dx * .2;
  return `M${x1} ${y1} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2} ${y2}`;
}
function svg(loads, { viewBox, par, labels }) {
  const out = [`<svg class="vmap__svg" viewBox="${viewBox}" preserveAspectRatio="${par}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`,
    `<path class="vmap__land" d="${landPath}"/>`, `<path class="vmap__borders" d="${bordersPath}"/>`];
  if (labels) for (const k of LABEL) { const [n, lon, lat] = CITIES[k], [x, y] = P(lon, lat), a = ANCHOR[k] || 'middle', dx = a === 'end' ? -7 : a === 'start' ? 7 : 0, dy = a === 'middle' ? -8 : 3.5;
    out.push(`<g class="vmap__place"><circle cx="${x}" cy="${y}" r="2.2"/><text x="${x + dx}" y="${y + dy}" text-anchor="${a}">${n}</text></g>`); }
  for (const [id, o, d, st] of loads) out.push(`<path class="vmap__lane vmap__lane--${st}" d="${lane(o, d)}" data-lane="${id}" pathLength="100"/>`);
  const ends = new Set(); for (const [, o, d] of loads) { ends.add(o); ends.add(d); }
  for (const k of ends) { const [x, y] = P(CITIES[k][1], CITIES[k][2]); out.push(`<circle class="vmap__city" cx="${x}" cy="${y}" r="3.4"/>`); }
  for (const [id, , , st, prog, rep] of loads) if (prog != null) out.push(`<g class="vmap__truck vmap__truck--${st}" data-truck="${id}" data-prog="${prog}"><rect x="-9" y="-6" width="18" height="12" rx="2.5"/><text x="0" y="-11" text-anchor="middle">${rep}</text></g>`);
  out.push('</svg>');
  return out.join('\n');
}
const ABBR = { Alabama: 'AL', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
function heroSvg() {
  const out = [`<svg class="net__svg" viewBox="0 0 975 610" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`,
    `<path class="net__land" d="${landPath}"/>`, `<g class="net__states">`];
  for (const f of states) { const [cx, cy] = geoPath().centroid(f); out.push(`<path class="net__state" d="${fmt(f)}" data-state="${f.properties.name}" data-abbr="${ABBR[f.properties.name] || ''}" data-cx="${cx.toFixed(1)}" data-cy="${cy.toFixed(1)}"/>`); }
  out.push(`</g>`, `<path class="net__borders" d="${bordersPath}"/>`);
  const ends = new Set();
  HERO.forEach(([o, d, mode, eq, st], i) => { ends.add(o); ends.add(d);
    out.push(`<path class="net__lane net__lane--${st}" d="${lane(o, d)}" data-net-lane="${i}" data-from="${CITIES[o][0]}" data-to="${CITIES[d][0]}" data-from-zip="${ZIP[o] || ''}" data-to-zip="${ZIP[d] || ''}" data-mode="${mode}" data-eq="${eq}" data-st="${st}" pathLength="100"/>`); });
  for (const k of ends) { const [n, lon, lat] = CITIES[k], [x, y] = P(lon, lat); out.push(`<g class="net__city" data-city="${n}" data-zip="${ZIP[k] || ''}" data-x="${x}" data-y="${y}"><circle class="net__hit" cx="${x}" cy="${y}" r="11"/><circle cx="${x}" cy="${y}" r="3"/><text x="${x}" y="${y - 8}" text-anchor="middle">${n}</text></g>`); }
  out.push(`<path class="net__picklane" d="" data-pick-lane/>`, `<g class="net__pin net__pin--a" data-pin="a" hidden><circle r="7"/><text y="-13" text-anchor="middle">FROM</text></g>`, `<g class="net__pin net__pin--b" data-pin="b" hidden><circle r="7"/><text y="-13" text-anchor="middle">TO</text></g>`);
  HERO.forEach(([o, d, mode, eq, st], i) => { if (st !== 'delivered') out.push(`<circle class="net__dot net__dot--${st}" r="4" data-net-dot="${i}" data-speed="${(0.6 + ((i * 7) % 5) * 0.18).toFixed(2)}" data-phase="${((i * 37) % 100) / 100}"/>`); });
  out.push('</svg>');
  return out.join('\n');
}
writeFileSync(path.join(here, 'map-hero.svg'), heroSvg());
writeFileSync(path.join(here, 'map-desktop.svg'), svg(LOADS, { viewBox: '0 0 975 610', par: 'xMidYMid meet', labels: true }));
writeFileSync(path.join(here, 'map-phone.svg'), svg(LOADS.filter((l) => l[1] === 'fresno'), { viewBox: '20 40 540 400', par: 'xMidYMid slice', labels: true }));
console.log('wrote map-desktop.svg and map-phone.svg');
