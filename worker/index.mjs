// The site's Cloudflare Worker (wrangler.jsonc). dist/ is served as static assets with the
// headers in dist/_headers; only /api/* runs this code (assets.run_worker_first).
import { handleQuote } from './quote.mjs';
import { QUOTE_ENDPOINT } from '../scripts/quote-fields.mjs';

const notFound = () => new Response(JSON.stringify({ ok: false }), {
  status: 404,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === QUOTE_ENDPOINT) return handleQuote(request, env);
    if (pathname.startsWith('/api/')) return notFound();
    return env.ASSETS.fetch(request);
  },
};
