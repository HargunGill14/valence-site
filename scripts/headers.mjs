// dist/_headers, the header file Cloudflare's static assets read (lane 16: the site moves from
// Railway to a Cloudflare Worker with static assets). It is written from the same rules as
// serve.json, which `npm start` still uses locally, so the two can't drift: build.mjs writes
// both from scripts/config.mjs, and check.mjs fails if _headers is not exactly
// headersFile(serve.json).
//
// serve.json globs ("**", "assets/**") become Cloudflare paths ("/*", "/assets/*").
// Cloudflare applies every matching rule, as serve does.

export function headersFile(serveJson) {
  const out = ['# Written by scripts/build.mjs from scripts/config.mjs (the same rules as serve.json). Do not edit.'];
  for (const rule of serveJson.headers || []) {
    const path = '/' + rule.source.replace(/\*\*$/, '*');
    out.push(path);
    for (const { key, value } of rule.headers) out.push(`  ${key}: ${value}`);
  }
  return out.join('\n') + '\n';
}
