#!/usr/bin/env python3
# Cuts the Valence logo out of its white background and makes every brand asset from it:
# the site mark and words (assets/img/brand), the favicons, app icons and the social card.
# Sources: src/brand/{mark,lockup-horizontal,lockup-vertical}.png, the brand files on white.
# Run from anywhere: python3 scripts/brand-assets.py   (needs numpy, scipy, Pillow)
import os
import numpy as np
from PIL import Image
from scipy import ndimage
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
U = R + 'src/brand/'

def cutout(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    mn = a.min(axis=2)
    near = mn > 238                                  # near-white
    lab, n = ndimage.label(near)
    sizes = ndimage.sum(near, lab, range(1, n + 1))
    h, w = near.shape
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    big = {i + 1 for i, s in enumerate(sizes) if s > h * w * 0.0015}
    bg = np.isin(lab, list(edge | big))
    # soft edge: in a 3px band around the background, take alpha from how far the pixel is from white
    band = ndimage.binary_dilation(bg, iterations=3) & ~bg
    alpha = np.ones((h, w), np.float32)
    alpha[bg] = 0
    t = np.clip((255 - mn) / (255 - 150), 0, 1)       # 0 at white, 1 at mid-grey
    alpha[band] = t[band]
    # un-mix white from the edge pixels so they don't halo on dark backgrounds
    al = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.where(band[..., None], np.clip((a - 255 * (1 - al)) / al, 0, 255), a)
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    return im.crop(im.getbbox())

def square(im, size, pad=0.06, bg=None):
    s = max(im.size); side = int(s * (1 + 2 * pad))
    c = Image.new('RGBA', (side, side), bg or (0, 0, 0, 0))
    c.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return c.resize((size, size), Image.LANCZOS)

mark = cutout(U + 'mark.png')
lock = cutout(U + 'lockup-horizontal.png')
vert = cutout(U + 'lockup-vertical.png')
print('mark', mark.size, 'lockup', lock.size, 'vertical', vert.size)

# site use
square(mark, 256, 0).save(R + 'assets/img/brand/valence-mark.png', optimize=True)
square(mark, 256, 0).save(R + 'assets/img/brand/valence-mark.webp', quality=90, method=6)

# icons: on white so the silver reads in browser tabs and Google results, both light and dark
white = (255, 255, 255, 255)
square(mark, 512, 0.08).save(R + 'valence-mark-512.png', optimize=True)
square(mark, 512, 0.08, white).save(R + 'icon-512.png', optimize=True)
square(mark, 192, 0.08, white).save(R + 'icon-192.png', optimize=True)
square(mark, 180, 0.10, white).convert('RGB').save(R + 'apple-touch-icon.png', optimize=True)
fav = square(mark, 256, 0.04, white)
fav.save(R + 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
square(mark, 96, 0.04, white).save(R + 'favicon-96.png', optimize=True)
square(mark, 48, 0.04, white).save(R + 'favicon-48.png', optimize=True)

# social card: the vertical lockup on white, 1200x630
og = Image.new('RGBA', (1200, 630), white)
v = vert.copy(); v.thumbnail((1000, 520), Image.LANCZOS)
og.alpha_composite(v, ((1200 - v.width) // 2, (630 - v.height) // 2))
og.convert('RGB').save(R + 'og-image.png', optimize=True)

# split the lockup into its mark and its words, so the header can size the words for reading
A = np.asarray(lock)[..., 3] > 20
cols = A.any(axis=0)
runs, x = [], 0
while x < len(cols):
    if cols[x]:
        s = x
        while x < len(cols) and cols[x]: x += 1
        runs.append((s, x))
    x += 1
gaps = [(runs[i][1], runs[i + 1][0]) for i in range(len(runs) - 1)]
cut = max(gaps, key=lambda g: g[1] - g[0])           # the widest gap is between mark and words
words = lock.crop((cut[1], 0, lock.width, lock.height)); words = words.crop(words.getbbox())
# words on a light background: remove the white left inside letters (P, A, R counters)
w = np.asarray(words).copy(); wm = w[..., :3].min(axis=2)
w[..., 3] = np.where(wm > 200, 0, np.clip((255 - wm) / (255 - 120) * 255, 0, 255)).astype(np.uint8)
w[..., :3] = np.array([30, 38, 46], np.uint8)        # the navy of the lockup, flat
words = Image.fromarray(w, 'RGBA'); words = words.crop(words.getbbox())
print('words', words.size, 'cut', cut)
words.save(R + 'assets/img/brand/valence-words.png', optimize=True)
# and a paper-coloured copy for dark backgrounds
w2 = w.copy(); w2[..., :3] = np.array([238, 237, 232], np.uint8)
Image.fromarray(w2, 'RGBA').crop(words.getbbox()).save(R + 'assets/img/brand/valence-words-light.png', optimize=True)
