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
