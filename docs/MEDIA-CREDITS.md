# Media credits and slots

Every photo, video and logo on the site, where it came from, and its license.
Add a row whenever a file goes in through `scripts/add-media.mjs` or `assets/logos/`.

## Video

| File | Source | License |
|---|---|---|
| `assets/video/week-bg.mp4`, `week-bg.jpg` | Mixkit clip 41361, "Aerial view of cars and trucks traveling on a highway" (https://mixkit.co/free-stock-video/), self-hosted | Mixkit Free License: commercial use, no credit required |

## Photos

All six slots are still empty and render as labeled placeholders. Fill each with
`node scripts/add-media.mjs <slot> <file>` (run `node scripts/add-media.mjs list` for subjects and ratios).

| Slot | Ratio | Subject | Source | License |
|---|---|---|---|---|
| `industries/food-and-beverage` | 4:3 | Co-packer or beverage line | — | — |
| `industries/space` | 4:3 | Test stand or hardware crate | — | — |
| `industries/data-centers` | 4:3 | Flatbed carrying a transformer | — | — |
| `heroes/food-and-beverage` | 4:5 | Co-packer line or grocery DC dock | — | — |
| `heroes/space` | 4:5 | Test stand or hardware on air-ride | — | — |
| `heroes/data-centers` | 4:5 | Flatbed with transformer, crane on site | — | — |

Preferred source: Pexels (photos and video, Pexels License, no attribution required).

## Logos (Proof conveyor)

Drop `assets/logos/<slug>.svg` (single color, preferred) or `.png`, then run `node scripts/build.mjs`.
SVGs are inlined in the tile's text color at 14% opacity behind the name. Slugs are the lowercase
name with dashes, for example `anheuser-busch`, `treehouse-foods`, `f-x-matt-brewing`.

| Brand | File | Source |
|---|---|---|
| Volvo | `volvo.svg` | Simple Icons 16.34.0 (`volvo`), icon data CC0; the mark is Volvo's trademark |
| Aldi | `aldi.svg` | Simple Icons 16.34.0 (`aldisud`), icon data CC0; the mark is Aldi's trademark |

Still needed: Walmart, Anheuser-Busch, Rivian, Labatt, Ingredion, TreeHouse Foods, Refresco,
Rich Products, Ferrara, Harvest Hill Beverage, FGF Brands, Premium Waters, LT Foods Americas,
Canadian Canning, Johanna Foods, F.X. Matt Brewing, Sanders Candy, Astor Chocolate.

Tile colors are approximations of each brand's color, set in `BRANDS` in `scripts/build.mjs`.
