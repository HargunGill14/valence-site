#!/usr/bin/env node
// Drops a photo or video into one of the site's media slots, then rebuilds.
// Needs ffmpeg on PATH (with libx264 for the video slot). Photos also need a
// WebP encoder: cwebp (brew install webp), or an ffmpeg built with libwebp.
// Node built-ins only.
//
//   node scripts/add-media.mjs <slot> <source-file>
//   node scripts/add-media.mjs list
//
// Photos are center-cropped to the slot's ratio and written as
// assets/img/<slot>-{800,1600}.{jpg,webp}. ffmpeg crops and writes the JPGs
// (Lanczos scaling, light sharpening on the 1600px size since sources are
// often smaller than that); cwebp -q 80 writes the WebPs. The video slot is re-encoded to
// H.264, no audio, faststart, 1280 wide, with a poster frame.
// Record where each file came from in docs/MEDIA-CREDITS.md.

import { spawnSync } from 'node:child_process';
import { existsSync, statSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLOTS = {
  'industries/food-and-beverage': { ratio: [4, 3], subject: 'co-packer or beverage production line' },
  'industries/space': { ratio: [4, 3], subject: 'test stand or aerospace hardware crate' },
  'industries/data-centers': { ratio: [4, 3], subject: 'flatbed carrying a transformer' },
  'heroes/food-and-beverage': { ratio: [4, 5], subject: 'co-packer line or grocery DC dock' },
  'heroes/space': { ratio: [4, 5], subject: 'test stand or hardware on air-ride' },
  'heroes/data-centers': { ratio: [4, 5], subject: 'flatbed with transformer, crane on site' },
  'week-bg': { video: true, subject: 'trucks on a highway through countryside, loopable, under 10 MB' },
};

const [slot, src] = process.argv.slice(2);
if (!slot || slot === 'list' || !SLOTS[slot]) {
  console.log('slots:');
  for (const [k, v] of Object.entries(SLOTS)) console.log(`  ${k.padEnd(30)} ${v.video ? 'video' : v.ratio.join(':')}  ${v.subject}`);
  process.exit(slot && slot !== 'list' ? 1 : 0);
}
if (!src || !existsSync(src)) { console.error(`source file not found: ${src}`); process.exit(1); }

const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
};
const kb = (p) => Math.round(statSync(p).size / 1024) + ' KB';
const runs = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });
const has = (cmd, args) => { const r = runs(cmd, args); return !r.error && r.status === 0 ? r.stdout : null; };

if (!has('ffmpeg', ['-hide_banner', '-version'])) {
  console.error('ffmpeg not found on PATH. Install it (brew install ffmpeg) and retry.');
  process.exit(1);
}

const def = SLOTS[slot];
if (def.video) {
  const out = join(ROOT, 'assets/video/week-bg.mp4');
  ff(['-i', src, '-an', '-vf', 'scale=1280:-2,fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  ff(['-ss', '2', '-i', out, '-frames:v', '1', '-q:v', '4', join(ROOT, 'assets/video/week-bg.jpg')]);
  console.log(`assets/video/week-bg.mp4 ${kb(out)}`);
  if (statSync(out).size > 10 * 1024 * 1024) console.warn('warning: over 10 MB, trim the clip or raise -crf');
} else {
  // WebP: prefer cwebp; fall back to ffmpeg only if it was built with libwebp.
  const cwebp = has('cwebp', ['-version']) !== null;
  const ffWebp = !cwebp && /libwebp/.test(has('ffmpeg', ['-hide_banner', '-encoders']) || '');
  if (!cwebp && !ffWebp) {
    console.error('No WebP encoder: cwebp is not on PATH and this ffmpeg was built without libwebp.\n'
      + 'Install cwebp with `brew install webp` (or `apt install webp`) and retry.');
    process.exit(1);
  }
  const [w, h] = def.ratio;
  const base = join(ROOT, 'assets/img', slot);
  mkdirSync(dirname(base), { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), 'add-media-'));
  try {
    for (const width of [800, 1600]) {
      const height = Math.round((width * h) / w);
      const sharpen = width > 800 ? ',unsharp=5:5:0.6' : '';
      const vf = `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height}${sharpen}`;
      ff(['-i', src, '-vf', vf, '-q:v', '4', `${base}-${width}.jpg`]);
      if (cwebp) {
        const png = join(tmp, `${width}.png`);
        ff(['-i', src, '-vf', vf, png]);
        const r = spawnSync('cwebp', ['-quiet', '-q', '80', png, '-o', `${base}-${width}.webp`], { stdio: 'inherit' });
        if (r.status !== 0) process.exit(r.status || 1);
      } else {
        ff(['-i', src, '-vf', vf, '-c:v', 'libwebp', '-quality', '80', `${base}-${width}.webp`]);
      }
      console.log(`${slot}-${width}: jpg ${kb(`${base}-${width}.jpg`)}, webp ${kb(`${base}-${width}.webp`)}`);
      for (const x of ['jpg', 'webp']) {
        if (statSync(`${base}-${width}.${x}`).size > 300 * 1024) console.warn(`warning: ${slot}-${width}.${x} is over 300 KB`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const b = spawnSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { stdio: 'inherit' });
process.exit(b.status || 0);
