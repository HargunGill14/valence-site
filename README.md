# valencesupplychain.com

Static marketing site for Valence Supply Chain. Plain HTML, one stylesheet, two small scripts,
no framework. Every page reads fully with JavaScript off; scripts only add the animations and
the phone menu.

## Layout

- `src/pages/*.html` is the source for each page. Shared header, footer, closing section, logo
  mark, image slots and the logo conveyor come from directives in `scripts/build.mjs`.
- `node scripts/build.mjs` writes `index.html`, `<page>/index.html`, `404.html` and `sitemap.xml`.
  The built files are committed, so the host serves the repo as is.
- `assets/css/site.css` holds every design token from the design spec.
- `assets/js/site.js` runs the menu, splash, video autoplay and reduced-motion handling.
  `assets/js/home.js` runs the hero card and the "How it feels" loop.

## Common jobs

- Change copy: edit `src/pages/<page>.html`, then `npm run build`.
- Add a photo or the background video: `node scripts/add-media.mjs list`, then
  `node scripts/add-media.mjs <slot> <file>`. Log the source in `docs/MEDIA-CREDITS.md`.
- Add a logo: save it as `assets/logos/<slug>.svg`, then `npm run build`.
- Show the ticker hero instead of the split card: add `?hero=ticker` to the URL.
- Re-render favicon, icons and the social image: see the header of `scripts/render-brand-assets.mjs`.

## Run locally

```sh
npm install
npm start          # serves the repo on http://localhost:3000
```

`npm start` must not use `serve -s`: single-page mode answers every page URL with the home page.
