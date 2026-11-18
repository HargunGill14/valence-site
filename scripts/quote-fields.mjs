// The "Get your rate" box (lane 16): the fixed lists and length caps, in one place.
// build.mjs renders the box's options from these lists, and the Worker (worker/quote.mjs)
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
