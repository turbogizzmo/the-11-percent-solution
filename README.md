# The 11% Solution

Got a rebate check for an odd amount like $86.28? Enter it, keep a list of things you'd buy anyway, and the app finds the combination that uses up the check (sales tax included) without paying a few hundred extra.

Not affiliated with or endorsed by Menards. Prices are whatever you enter.

## Features

- Closest-match search over your own list, with sales tax so totals match the register
- Stack several checks, set how much you're OK paying out of pocket, and mark "must buy" items
- Limit how many different items go in one trip
- Copy a shopping list, or share your item list with a link
- Lists are saved in the browser on each device; works offline in the store and can be added to the home screen

## What should I buy? (planner)

`ideas.json` is a curated list of about 170 things people actually use (filters, salt, bulbs, batteries, cleaning supplies, tools, pet food, car care), each with an estimated price, a season, and who it's for. The planner picks a basket from the ideas that match the categories you tap and the time of year, sized to the check with tax. Big checks also get one or two bigger items. Shuffle, keep (🔒), swap (↻) or remove any item. **Start shopping** turns the basket into a checklist with a running "left on the check" total and suggestions that fit what's left.

## Real Menards prices

Menards has no public product API, so `scripts/refresh-catalog.mjs` uses Bright Data's free tier (5,000 credits a month, 1 per lookup):

1. **Find:** for each idea without saved products, a Google search for `site:menards.com <phrase>` through Bright Data's SERP API finds up to 3 Menards product pages. They're saved in `scripts/idea-urls.json`, so this only happens once per idea.
2. **Price:** Bright Data's "Menards Products" scraper (`gd_motp6b7s1n9zlq6lwj`) reads those pages. Ideas with a real price show it instead of "about $X", and link straight to the product.

The first run costs roughly 170 searches plus up to about 500 product lookups; monthly refreshes only pay for the product lookups. Bright Data's `price` field is the register price; its `sale_price` is the price after the 11% mail-in rebate, so the script ignores it.

To refresh:

1. Add repo secrets `BRIGHTDATA_API_KEY` and `BRIGHTDATA_SERP_ZONE` (the name of a SERP API zone in your Bright Data account), e.g. `gh secret set BRIGHTDATA_API_KEY`.
2. Run the **Refresh Menards catalog** workflow (Actions tab), or wait for the 2nd of the month.
3. To have the workflow redeploy the site, also add `CLOUDFLARE_API_TOKEN` (Pages edit) and `CLOUDFLARE_ACCOUNT_ID`.

Locally: `BRIGHTDATA_API_KEY=... BRIGHTDATA_SERP_ZONE=... node scripts/refresh-catalog.mjs`. Add `--find-only` to stop after the searches, `--raw` to save the scraper output, or `--from export.json` to build from a Bright Data download without using credits.

## Run locally

It's a static site with no build step:

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

The service worker (offline mode) only registers over HTTPS, so test that part on the deployed site.

## Deploy to Cloudflare Pages

- **Dashboard:** Workers & Pages → Create → Pages → Connect to Git, pick this repo. Framework preset: None. Build command: empty. Output directory: `/`.
- **Or upload:** Workers & Pages → Create → Pages → Upload assets, and drag in this folder.

`_headers` sets security headers and keeps `index.html` and `sw.js` from being cached stale.

## Settings

The default sales tax is 5.5%. Change `tax:5.5` in `index.html` to set a different default; users can also change it on the check.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app: markup, styles, and script, including the planner, cart and match solver |
| `sw.js` | Offline caching |
| `ideas.json` | Curated ideas with estimated prices |
| `catalog.json` | Real Menards items and prices (generated) |
| `scripts/refresh-catalog.mjs` | Finds Menards products for each idea and pulls prices from Bright Data |
| `scripts/idea-urls.json` | Menards product pages found for each idea (generated) |
| `scripts/urls.txt` | Extra product pages to price |
| `.github/workflows/refresh-catalog.yml` | Monthly refresh and redeploy |
| `manifest.webmanifest`, `icon*.png`, `icon.svg` | Home-screen install |
| `_headers` | Cloudflare Pages response headers |
