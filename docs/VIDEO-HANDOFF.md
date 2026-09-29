# Valence site: video handoff

All clips are free Mixkit stock footage (the Mixkit Free License covers commercial use, and no credit is required).
Every clip has direct MP4 URLs in this pattern:

- 720p: `https://assets.mixkit.co/videos/{ID}/{ID}-720.mp4`  (use for full-screen backgrounds)
- 360p: `https://assets.mixkit.co/videos/{ID}/{ID}-360.mp4`  (fallback / small frames)
- Poster image: `https://assets.mixkit.co/videos/{ID}/{ID}-thumb-360-0.jpg`

**Recommended:** download each 720p file and self-host it, e.g. `/videos/26005.mp4`.
If the site just keeps the Mixkit links, the videos could break if Mixkit moves its files.

## Exact clips and where each is used

| ID | Clip | Used in |
|---|---|---|
| 26005 | Freight trucks heading through a forest | **Hero rotation** clip 1 (first shown) |
| 23011 | Freight truck arriving at the warehouse | CPG industry (card image, sticky frame, detail page hero) |
| 52428 | Flying over a busy highway serpentine by the mountains | Automotive industry |
| 1919  | Trailers on a foggy road | Pharma industry, plus the 24/7 statement mood |
| 52447 | Aerial view: several freightliners on black asphalt, sunny | Retail industry |
| 41361 | Aerial view of cars and trucks traveling on a highway | Distribution industry, plus the **Quote/contact section** background (35% opacity) |
| 2741  | Orange heavy cargo transport moving on the road | Manufacturing industry |
| 23852 | Worker giving directions to a freight truck | **"Our Standard"** section (left half-screen video) |

Mixkit pages, for reference: `https://mixkit.co/free-stock-video/` + the slug, e.g.
https://mixkit.co/free-stock-video/freight-trucks-heading-through-a-forest-26005/

## Video tag setup (this is what makes them autoplay)

Browsers only autoplay background video when it's **muted + playsinline**. Use exactly:

```html
<video autoplay muted loop playsinline preload="auto"
       poster="https://assets.mixkit.co/videos/26005/26005-thumb-360-0.jpg"
       style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
  <source src="https://assets.mixkit.co/videos/26005/26005-720.mp4" type="video/mp4">
  <source src="https://assets.mixkit.co/videos/26005/26005-360.mp4" type="video/mp4">
</video>
```

Also run this once after the page loads, because some browsers (Safari/iOS) ignore the attribute:

```js
document.querySelectorAll('video').forEach(v => { v.muted = true; v.play().catch(() => {}); });
```

## How each section uses them

- **Hero:** ROTATION of 6 stacked videos: 26005, 52447, 41361, 2741, 23011, 1919. Only one is visible at a time; it crossfades (opacity 1.6s) every 7s with a slow 1→1.08 zoom. Full-screen (`min-height:100vh`), scaled to 1.06, with a slow parallax zoom on scroll.
  One light overlay only: `linear-gradient(180deg, rgba(10,11,13,.35), transparent 22%, transparent 58%, rgba(10,11,13,.78))`.
  The text is small and sits in the bottom-left: "Valence. / Bonded to your deadline." (Archivo 800, clamp(34px,4.4vw,68px)) plus one description line, with a single outlined "Request a Quote" button on the right.
  There is no top header on the hero; the header (Valence + Get a Quote only) slides down once the page is scrolled 40px.
- **Industries grid:** six clickable cards. Each shows its clip's **poster jpg** as the image, and each links to `#industry-{slug}`
  (cpg, automotive, pharma, retail, distribution, manufacturing).
- **Sticky industry frame:** all six industry videos are stacked in one frame with an angled top-right corner
  (`clip-path: polygon(0 0, calc(100% - 72px) 0, 100% 72px, 100% 100%, 0 100%)`).
  Only the active one has opacity 1 (0.8s fade). The active one is whichever industry row is closest to the middle of the screen while scrolling.
- **Industry detail page:** a full-screen hero with that industry's 720p clip and the same dark overlays.
- **Our Standard:** clip 23852 fills the left half, with a clipped bottom-left corner.
- **Quote section:** clip 41361 fills the section at `opacity:.35` under a dark gradient.

## Palette / fonts (for consistency)

- Black `#111315`, deep black `#0A0B0D`, soft white bg `#F6F4EF`, eggshell `#EEEDE8`, **accent Estate Green `#98AE9C`**, darker green text `#3F5E48`, body grey `#45484D`. (The old stone accent was #C9BFAE / #6F6656.)
- Phone: 516-710-5656 · Email: info@valencesupplychain.com
- Headlines: **Archivo** 800, uppercase, `font-stretch:88%`. Body: **IBM Plex Sans**. Labels: **IBM Plex Mono**.
- Google Fonts: `https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap`
