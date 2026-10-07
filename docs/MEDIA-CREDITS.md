# Media credits and slots

Every photo, video and logo on the site, where it came from, and its license.
Add a row whenever a file goes in through `scripts/add-media.mjs` or `assets/logos/`.

## Video

| File | Source | License |
|---|---|---|
| `assets/video/week-bg.mp4`, `week-bg.jpg` | Mixkit clip 41361, "Aerial view of cars and trucks traveling on a highway" (https://mixkit.co/free-stock-video/), self-hosted | Mixkit Free License: commercial use, no credit required |

## Photos

Each industry uses one still for both of its slots, center-cropped to each ratio with
`node scripts/add-media.mjs <slot> <file>` (run `node scripts/add-media.mjs list` for subjects and ratios).
Mixkit only serves these clips at 720p, so the 1600px files are upscaled (Lanczos, light sharpening).

| Slot | Ratio | Subject | Source | License |
|---|---|---|---|---|
| `industries/food-and-beverage` | 4:3 | Beer bottle production line | Mixkit clip 33003, "Beer bottle production line in the factory" (https://mixkit.co/free-stock-video/beer-bottle-production-line-in-the-factory-33003/), frame at 14.4 s of the 720p file | Mixkit Free License: commercial use, no credit required |
| `heroes/food-and-beverage` | 4:5 | Same frame as above | Mixkit clip 33003, as above | Mixkit Free License |
| `industries/space` | 4:3 | Jet engine open for maintenance in a hangar | Mixkit clip 28016, "Jet engine open and under repair" (https://mixkit.co/free-stock-video/jet-engine-open-and-under-repair-28016/), frame at 14.31 s of the 720p file | Mixkit Free License |
| `heroes/space` | 4:5 | Same frame as above | Mixkit clip 28016, as above | Mixkit Free License |
| `industries/data-centers` | 4:3 | Crew in hard hats at a power substation | Mixkit clip 23493, "Electrical workers in power plant" (https://mixkit.co/free-stock-video/electrical-workers-in-power-plant-23493/), frame at 34.08 s of the 720p file | Mixkit Free License |
| `heroes/data-centers` | 4:5 | Engineers in hard hats at the same substation | Mixkit clip 23493, as above, frame at 36.24 s, 4:5 window taken 220 px from the left edge of the 1280 px frame (not centered) so no one is cut off at the edges | Mixkit Free License |

Source: Mixkit (https://mixkit.co, Mixkit Free License, no attribution required). Self-host every
file; never hotlink.

## Logos (Proof carousel)

Drop `assets/logos/<slug>.svg` (single color, preferred) or `.png`, then run `node scripts/build.mjs`.
SVGs are inlined at full opacity in the carousel's one neutral color, 32px tall (24px on phones).
A brand without a file shows its name as plain text at the same size. Slugs are the lowercase
name with dashes, for example `anheuser-busch`, `treehouse-foods`, `f-x-matt-brewing`.

| Brand | File | Source |
|---|---|---|
| Volvo | `volvo.svg` | Simple Icons 16.34.0 (`volvo`), icon data CC0; the mark is Volvo's trademark |
| Aldi | `aldi.svg` | Simple Icons 16.34.0 (`aldisud`), icon data CC0; the mark is Aldi's trademark |
| Walmart | `walmart.svg` | Wikimedia Commons, https://commons.wikimedia.org/wiki/File:Walmart_logo_(2025;_Alt).svg, public domain (PD-textlogo); the mark is Walmart's trademark |
| Rivian | `rivian.svg` | Wikimedia Commons, https://commons.wikimedia.org/wiki/File:Rivian_logo.svg, public domain (PD-shape); the mark is Rivian's trademark |
| Ingredion | `ingredion.svg` | Wikimedia Commons, https://commons.wikimedia.org/wiki/File:Ingredion.svg, public domain (PD-textlogo); the mark is Ingredion's trademark |
| Refresco | `refresco.svg` | Wikimedia Commons, https://commons.wikimedia.org/wiki/File:Refresco_logo.svg, public domain (PD-textlogo); the mark is Refresco's trademark |
| Ferrara | `ferrara.svg` | Wikimedia Commons, https://commons.wikimedia.org/wiki/File:Ferrara_Candy_Company_logo.svg, public domain (PD-textlogo); the mark is Ferrara's trademark |

The Commons files were flattened to one color (fills, clip paths, ids and editor metadata removed)
so the build can draw them in the carousel's text color.

Still needed (not on Wikimedia Commons): Anheuser-Busch (Commons only has the Budweiser bowtie,
a product logo), Labatt, TreeHouse Foods, Rich Products, Harvest Hill Beverage, FGF Brands,
Premium Waters, LT Foods Americas, Canadian Canning, Johanna Foods, F.X. Matt Brewing,
Sanders Candy, Astor Chocolate.

