// The "Get an instant quote" box and the homepage map's pick-a-lane (lane 16): the fixed lists and
// length caps, in one place. build.mjs renders the options from these lists, and the Worker (worker/quote.mjs)
// accepts only these values, so the page and the endpoint can't drift apart.
// Node built-ins only; the Worker bundles this file as is.

export const QUOTE_ENDPOINT = '/api/quote-request';

// The four tabs. Jesse confirmed all four on Nov 18.
export const MODES = {
  truck: 'LTL · FTL · Cargo van · Box truck',
  intl: 'International ocean and air',
  dray: 'Drayage',
  parcel: 'Parcel',
};

export const EQUIPMENT = [
  'Full truckload · dry van',
  'Full truckload · reefer',
  'Full truckload · flatbed',
  'LTL',
  'Cargo van',
  'Box truck',
];

export const INTL_MODES = [
  'Ocean · full container (FCL)',
  'Ocean · less than container (LCL)',
  'Air',
  'Not sure, advise me',
];

export const PORTS = [
  'Port of Los Angeles',
  'Port of Long Beach',
  'Port of Oakland',
  'Port of Seattle / Tacoma',
  'Port of Houston',
  'Port of Savannah',
  'Port of New York / New Jersey',
  'Port of Vancouver',
  'Rail ramp (tell us which)',
];

export const CONTAINERS = ['20 ft', '40 ft', '45 ft'];

// The homepage map's pick-a-lane: the four tabs, plus "Not sure yet". It asks only for the extras
// each mode needs and an email; the places come from scripts/map-places.mjs.
export const MAP_MODES = { ...MODES, unsure: 'Not sure yet' };

// The quote page (/quote/): items, then the pickup and delivery options. build.mjs renders the item
// types and the option buttons from these lists; assets/js/quote.js holds each option's explainer,
// keyed by the same ids (check.mjs fails the build if the two drift apart). The Worker accepts only
// these ids and types, and works out the total weight itself.
export const ITEM_TYPES = ['Pallet', 'Crate', 'Box', 'Drum', 'Bundle', 'Roll', 'Other'];
export const ITEM_LIMITS = { items: 20, qty: 999, lbs: 50000, dim: 999, total: 200000 };
export const QUOTE_OPTIONS = {
  pickup: {
    res_pu: 'Residential pickup',
    lift_pu: 'Liftgate pickup',
    appt_pu: 'Pickup appointment',
    lim_pu: 'Limited access pickup',
    con_pu: 'Construction site pickup',
    show_pu: 'Convention or trade show pickup',
    two_pu: 'Two-person pickup',
    pallet_pu: 'Palletization',
    floor_pu: 'Floor loaded',
    reefer_pu: 'Refrigerated',
    assist_pu: 'Driver assist with pallet jack',
    inside_pu: 'Inside pickup',
    hazmat: 'Hazmat',
    alcohol: 'Alcohol',
  },
  delivery: {
    res_dl: 'Residential delivery',
    lift_dl: 'Liftgate delivery',
    appt_dl: 'Delivery appointment',
    lim_dl: 'Limited access delivery',
    con_dl: 'Construction site delivery',
    show_dl: 'Convention or trade show delivery',
    dunnage: 'Dunnage and debris removal',
    two_dl: 'Two-person delivery',
    assist_dl: 'Driver assist with pallet jack',
    inside_dl: 'Inside delivery',
  },
};
export const QUOTE_OPTIONS_SHOWN = 6;   // per group, before "Show all"

// Longest accepted value for every text field, in characters. The page sets the same maxlength.
export const MAX = {
  zip: 5,
  place: 120,      // international from/to: a port, an airport, a city or a ZIP
  address: 200,    // parcel from/to
  containerno: 20,
  box: 40,
  weight: 9,
  commodity: 120,
  name: 100,
  company: 120,
  email: 254,
  phone: 40,
  note: 1000,
};
