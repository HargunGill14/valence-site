// Values shared by build.mjs, check.mjs and verify.mjs.

export const SITE = 'https://www.valencesupplychain.com';

// The one approved Customer login URL (plan step 6.1): labs.valencesupplychain.com, where
// customers sign in to Valence Labs. Every login link on the site points here, exactly:
// absolute https, no query string, same tab. check.mjs fails the build on any other
// login-looking link, and on a page with a login count other than 0 or 2 (header and
// footer). Until labs. is live the site has no login link at all (0 on every page).
export const LOGIN = 'https://labs.valencesupplychain.com';

// Hosts that only the login link may point at. A link to any of them that isn't
// exactly LOGIN fails the build: a second, different "login" is what a hijacked
// commit or a copy-paste slip would look like. The old app hosts stay listed so no
// page links to them by mistake.
export const APP_HOST_PATTERNS = [
  /^(?!www\.)[a-z0-9-]+\.substrate-lab\.com$/i, // app., api., app-staging. … (the marketing site at the apex is a normal link)
  /\.railway\.app$/i,
  /^(?!www\.)[a-z0-9-]+\.valencesupplychain\.com$/i, // labs., labs-api., staging hosts …
];

// Google Analytics 4 (plan 7.26). The build loads Google's tag from SCRIPT_HOSTS and
// writes the setup lines into dist/assets/js/analytics.js (no inline script), so the
// CSP stays hash-only. Google's GA4 hosts are listed below and nowhere else; scripts may come only from
// www.googletagmanager.com, and Google signals and ad personalization are switched off.
export const GA_ID = 'G-GV04GR4XZP';
export const GA_TAG_URL = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;

// Microsoft Clarity (session replay and heatmaps). The build loads Microsoft's tag from
// www.clarity.ms after a same-site queue stub (dist/assets/js/clarity.js), both deferred so
// they run in order; the tag then loads clarity.js from scripts.clarity.ms and reports to
// *.clarity.ms and c.bing.com (Microsoft's documented hosts).
export const CLARITY_ID = 'z426pshvaq';
export const CLARITY_TAG_URL = `https://www.clarity.ms/tag/${CLARITY_ID}`;

// Cloudflare Turnstile (lane 16): the bot check on the "Get your rate" box. The site key is
// public by design; the secret is a Worker secret (TURNSTILE_SECRET_KEY) and never in the repo.
// Loaded only on pages that hold the box, rendered explicitly by assets/js/rate.js; the widget
// runs in an iframe from TURNSTILE_ORIGIN, so that origin is the CSP's only frame-src.
export const TURNSTILE_SITE_KEY = '0x4AAAAAAGHdx_jA0Lixlou7';
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
export const TURNSTILE_SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;

// The only scripts a page may load from another site. check.mjs fails the build on any
// other external <script src>: an analytics or chat snippet added later needs its own
// line here, a CSP entry and a reason (plan 6.5).
export const THIRD_PARTY_SCRIPTS = [GA_TAG_URL, CLARITY_TAG_URL, TURNSTILE_SCRIPT_URL];
export const SCRIPT_HOSTS = ['https://www.googletagmanager.com', 'https://www.clarity.ms', 'https://scripts.clarity.ms', TURNSTILE_ORIGIN]; // exact hosts, no wildcard

// Content-Security-Policy, without script-src: build.mjs adds script-src with a
// sha256 for each inline head script it writes (plan steps 1.13 and 1.14) and SCRIPT_HOSTS.
// Where the five-question contact form sends its answers. A Formspree form endpoint
// (https://formspree.io/f/<id>) whose recipient is ops@. The page posts JSON to it from
// assets/js/ask.js; the host goes into connect-src below. The quote Worker (worker/quote.mjs)
// does NOT use it: quote requests go to a separate "Quote requests" form whose ID is the Worker
// secret FORMSPREE_QUOTE_FORM_ID, kept out of the repo, dist/ and the page. Empty string: no network at all,
// the last step opens the visitor's mail app instead (the site collects nothing itself).
export const LEAD_ENDPOINT = 'https://formspree.io/f/xvkkywjn';
const LEAD_HOST = LEAD_ENDPOINT ? new URL(LEAD_ENDPOINT).origin : '';

export const CSP_BASE = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: https://*.google-analytics.com https://www.googletagmanager.com https://*.clarity.ms https://c.bing.com",
  "media-src 'self'",
  `connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.clarity.ms https://c.bing.com${LEAD_HOST ? ' ' + LEAD_HOST : ''}`,
  "manifest-src 'self'",
  `frame-src ${TURNSTILE_ORIGIN}`, // the Turnstile widget, and nothing else
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
];

export const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), autoplay=(self), bluetooth=(), browsing-topics=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(), serial=(), usb=(), xr-spatial-tracking=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Origin-Agent-Cluster': '?1',
};

export const ASSET_CACHE = 'public, max-age=86400';
