# valencesupplychain.com

Static marketing site for Valence Supply Chain. Plain HTML, one stylesheet, a few small scripts,
no framework. Every page reads fully with JavaScript off; scripts only run the phone menu, the
background video and the home page map demo.

## Layout

- `src/pages/*.html` is the source for each page. Shared header, footer, closing section, logo
  mark, image slots and the logo carousel come from directives in `scripts/build.mjs`.
- `node scripts/build.mjs` writes `index.html`, `<page>/index.html`, `404.html` and `sitemap.xml`.
  The built files are committed, so the host serves the repo as is.
- `assets/css/site.css` holds every design token from the design spec.
- `assets/js/site.js` runs the menu and the background video (plays only on screen, never with reduced motion).
  `assets/js/home.js` lazy-loads the "How it feels" map demo (`assets/js/portal-map*.js`) when it
  nears the screen. The hero card is static. The demo shows a static image (`assets/img/portal/map-*`)
  until `data-tiles` is set in `src/pages/home.html`; Leaflet is self-hosted in `assets/vendor/`.

## Common jobs

- Change copy: edit `src/pages/<page>.html`, then `npm run build`.
- Add a photo or the background video: `node scripts/add-media.mjs list`, then
  `node scripts/add-media.mjs <slot> <file>`. Log the source in `docs/MEDIA-CREDITS.md`.
- Add a logo: save it as `assets/logos/<slug>.svg`, then `npm run build`.
- Re-render the map demo's static image: see the header of `scripts/render-portal-map.mjs`.
- Re-render favicon, icons and the social image: see the header of `scripts/render-brand-assets.mjs`.

## Run locally

```sh
npm install
npm start          # serves the repo on http://localhost:3000
```

`npm start` must not use `serve -s`: single-page mode answers every page URL with the home page.
