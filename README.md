# valencesupplychain.com

Static marketing site for Valence Supply Chain. Plain HTML, one stylesheet, two small scripts,
no framework. Every page reads fully with JavaScript off; scripts only run the phone menu and
the background video.

## Layout

- `src/pages/*.html` is the source for each page. Shared header, footer, closing section, logo
  mark, image slots and the logo carousel come from directives in `scripts/build.mjs`.
- `node scripts/build.mjs` writes the site into `dist/`: `index.html`, `<page>/index.html`,
  `404.html`, `sitemap.xml`, `assets/` and the icons. Only `dist/` is served, so source files,
  docs and `package.json` are never public. It also writes `serve.json` (security headers, with
  the CSP hash of the inline head script) and `src/lastmod.json` (each page's last real change,
  for the sitemap). Commit all three with your change; CI fails if they are stale.
- The build ends with `scripts/check.mjs` and fails on: source files in `dist/`, an inline script
  missing from the CSP, a login link that isn't exactly `LOGIN` in `scripts/config.mjs`, or any
  form, password field or iframe. `npm test` proves each of those checks catches what it should.
- `scripts/config.mjs` holds the site URL, the one approved Customer login URL (`LOGIN`,
  `https://labs.valencesupplychain.com`) and the headers. The site has no login link until `labs.`
  is live; then the header and footer each get one link to `LOGIN` (the check allows 0 or 2 per page).
- Google Analytics (`GA_ID` in `scripts/config.mjs`): the build adds Google's tag to every page
  and writes the setup lines to `dist/assets/js/analytics.js`, so the CSP needs no inline scripts.
  Google signals and ad personalization are off. Any other script from another site fails the
  build until it is added to `THIRD_PARTY_SCRIPTS` and `SCRIPT_HOSTS` with a reason.
- The security headers and every CSP directive come only from `scripts/config.mjs`; the check fails
  if `serve.json` is edited by hand to weaken one. `.npmrc` turns off package install scripts, and
  CI checks npm registry signatures and runs `npm audit`.
- A new page (for example the Valence Labs page, terms or support) is a new file in `src/pages/`
  with its JSON header. The build adds it to `dist/` and the sitemap, and the checks and
  `scripts/verify.mjs` cover it with no other change.
- `assets/css/site.css` holds every design token from the design spec.
- `assets/js/site.js` runs the menu and the background video (plays only on screen, never with reduced motion).
  `assets/js/home.js` only switches the hero card variant; the hero cards and the portal are static.

## Common jobs

- Change copy: edit `src/pages/<page>.html`, then `npm run build`.
- Add a photo or the background video: `node scripts/add-media.mjs list`, then
  `node scripts/add-media.mjs <slot> <file>`. Log the source in `docs/MEDIA-CREDITS.md`.
- Add a logo: save it as `assets/logos/<slug>.svg`, then `npm run build`.
- Show the ticker hero instead of the split card: add `?hero=ticker` to the URL.
- Re-make the logo files, favicons, app icons and the social image from `src/brand/`: `python3 scripts/brand-assets.py`.

## Run locally

```sh
npm ci
npm run build      # dist/ + serve.json + checks
npm test           # the checks' own tests
npm start          # serves dist/ on http://localhost:3000 with the headers in serve.json
```

`npm start` must not use `serve -s`: single-page mode answers every page URL with the home page.
It refuses to start without `serve.json`, so the site never runs without its headers.
Browser checks (every page, three widths, reduced motion, JavaScript off, CSP errors): see the
header of `scripts/verify.mjs`.

## Hosting: Cloudflare Worker with static assets

The site runs on Cloudflare as one Worker (`wrangler.jsonc`). `dist/` is served as static assets with
the headers in `dist/_headers`, which the build writes from the same rules as `serve.json`
(`scripts/headers.mjs`; `check.mjs` fails if they differ). Only `/api/*` runs code:
`worker/index.mjs` → `worker/quote.mjs`, the quote endpoint at `/api/quote-request`. Two forms post
to it: the "Get an instant quote" box (`@rate`, and the closing band `@cta` on most pages) and the
homepage map's pick-a-lane (`@pick`, sent as `kind: "map"`). `dist/_redirects` (moved pages, from
a page's `"redirect"` field) is applied by Cloudflare as 301s.

The endpoint rate-limits per IP (the `QUOTE_LIMITER` binding), drops the honeypot, verifies the
Turnstile token server-side, validates every field against `scripts/quote-fields.mjs` (the map's
places against `scripts/map-places.mjs`, taking each city's ZIP from there), and sends
each request to Slack #quote-requests and, independently, to ops@ through the "Quote requests"
Formspree form. It answers `{"ok":true}` if either landed, `{"ok":false}` otherwise.

Secrets are set with a hidden prompt and never committed:

```sh
npx wrangler@4.156.2 secret put SLACK_WEBHOOK_URL
npx wrangler@4.156.2 secret put TURNSTILE_SECRET_KEY
npx wrangler@4.156.2 secret put FORMSPREE_QUOTE_FORM_ID
```

`FORMSPREE_QUOTE_FORM_ID` takes the form's ID (the part after `/f/`) or its full
`https://formspree.io/f/…` URL. Each request logs one line, with no personal data:
`{"event":"quote-request","kind":"box"|"map","mode":…,"slack":"sent"|"http 4xx"|"error …","email":…,"email_codes":[…]}`.
Watch it with `npx wrangler@4.156.2 tail valence-site --format pretty`. `email` says
`error FORMSPREE_QUOTE_FORM_ID not set` or `… malformed` when the secret is the problem, and
`http 4xx` with Formspree's error codes when Formspree refused the post.

`wrangler.jsonc` has no routes or custom domains, so a deploy reaches only the workers.dev address
(a test keeps it that way). Moving www to the Worker is the launch: see `docs/LAUNCH.md`.

Deploy: `npm run build`, then `npx wrangler@4.156.2 deploy`. Locally, `npx wrangler@4.156.2 dev`
runs the Worker and the assets together; put test values in `.dev.vars` (git-ignored). Turnstile's
test secret `2x0000000000000000000000000000000AA` always fails verification, which is handy for checking the refusals.
