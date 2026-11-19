# Launch: www.valencesupplychain.com moves from Railway to the Cloudflare Worker

One launch (Hargun, Nov 18 16:14). Nothing goes live until Jesse approves the redesign on the
workers.dev preview. Order: **www moves to the Worker first, then the PRs merge.** Do not merge #37
into main before www is on the Worker: Railway publishes main and has no `/api/quote-request`, so
the live forms would fail.

Every command is run by Hargun. Each step says how to undo it.

## How the switch works

www is a proxied DNS record (orange cloud) pointing at Railway. A **Worker route** on
`www.valencesupplychain.com/*` makes Cloudflare answer www from the Worker before the request ever
reaches Railway. The DNS record is not touched at launch, so undoing the route sends www straight
back to Railway within seconds. The apex keeps its Cloudflare 301 to www.

The route lives in `wrangler.jsonc`, not only in the dashboard: Wrangler treats the config's routes
as the full list and can drop a route added by hand on the next deploy. Until launch,
`wrangler.jsonc` has no routes and a test (`test/check.test.mjs`) fails if one appears, so the
preview can only ever be on workers.dev.

## 0. Before launch (all must be true)

1. Jesse approved the preview at the Worker's workers.dev address.
2. On the preview, one box request (drayage tab), one map request and one quote page request
   (`/quote/`) each arrived in Slack #quote-requests **and** in the "Quote requests" form's
   Submissions (not Spam). While sending them,
   `npx wrangler@4.156.2 tail valence-site --format pretty` showed `"slack":"sent"` and
   `"email":"sent"` for all three.
3. The Turnstile widget's hostnames include `www.valencesupplychain.com`,
   `valencesupplychain.com` and the workers.dev host.
4. `npx wrangler@4.156.2 secret list` shows `SLACK_WEBHOOK_URL`, `TURNSTILE_SECRET_KEY` and
   `FORMSPREE_QUOTE_FORM_ID`.
5. **Railway stops deploying main.** In Railway, open the valence-site service → Settings → Source
   and disconnect the GitHub repo (or turn off automatic deploys, whichever the screen offers). The
   running deployment stays up. Check under Deployments that the active one is today's site. From
   here, Railway is a frozen copy of today's site: the rollback target.
6. Note what www answers today, to compare later:
   `curl -sI https://www.valencesupplychain.com/`

## 1. www to the Worker

1. Claude prepares the launch commit on `site/redesign`. It adds the route to `wrangler.jsonc`:
   `"routes": [{ "pattern": "www.valencesupplychain.com/*", "zone_name": "valencesupplychain.com" }]`,
   and changes the pre-launch test to require exactly that route. Hargun commits and pushes it.
2. Build and deploy from that commit:
   `npm --prefix /Users/hargungill/code/valence-site run build`
   then, from the repo folder, `npx wrangler@4.156.2 deploy`.
   If Wrangler shows a difference between the remote and local settings, the only change should be
   the added www route.

**Undo:** Cloudflare dashboard → Workers & Pages → valence-site → Settings → Domains & Routes →
delete the `www.valencesupplychain.com/*` route. www is back on Railway at once, with no DNS change.
Then revert the launch commit before any later deploy, or the deploy adds the route back.

## 2. Check www on the Worker

```sh
curl -sI https://www.valencesupplychain.com/                    # 200, a CSP naming challenges.cloudflare.com, no Railway headers
curl -sI https://www.valencesupplychain.com/food-and-beverage/  # 301, location /cpg/
curl -sI https://www.valencesupplychain.com/_headers            # 404
curl -sI https://valencesupplychain.com/                        # 301 to https://www.valencesupplychain.com/
curl -s -X POST https://www.valencesupplychain.com/api/quote-request -H 'content-type: application/json' -d '{}'   # {"ok":false}, 403 (no token): the endpoint is live
```

Then in a browser:

- `/`, `/contact/` and `/cpg/` show no CSP errors in the console.
- One real box request, one real map request and one real quote page request each land in Slack
  and in Submissions, while `wrangler tail` shows `sent` for both deliveries.
- `/quote/` shows no CSP errors, and the truck tab on `/` hands off to it with both ZIPs.
- securityheaders.com still gives its grade for www.

**Undo:** the same as step 1.

## 3. Merge

1. The redesign PR into `site/quote-box`, once CI is green.
2. PR #37 (`site/quote-box`) into `main`.

Railway is disconnected, so neither merge deploys anywhere. www keeps running the Worker version
deployed in step 1, built from the same commits.

**Undo:** still the route deletion from step 1. Railway serves its frozen copy of the old site. To
also put main back, revert the merge on main.

## 4. A week later

1. Workers Builds: connect the repo to the valence-site Worker. Production branch `main`, build
   command `npm run build`, deploy command `npx wrangler@4.156.2 deploy`, variable `NODE_VERSION=22`.
   Deploys then come from main.
2. Retire Railway. The route needs a proxied DNS record on www, so first change the www record from
   the Railway CNAME to the Workers placeholder: `AAAA www 100::`, proxied. Check www, then delete
   the Railway valence-site service.

**Undo, from here on:** `npx wrangler@4.156.2 rollback` to the previous Worker version. Railway is
no longer a fallback.
