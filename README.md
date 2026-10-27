# The 11% Solution

Got a rebate check for an odd amount like $86.28? Enter it, keep a list of things you'd buy anyway, and the app finds the combination that uses up the check (sales tax included) without paying a few hundred extra.

Not affiliated with or endorsed by Menards. Prices are whatever you enter.

## Features

- Closest-match search over your own list, with sales tax so totals match the register
- Stack several checks, set how much you're OK paying out of pocket, and mark "must buy" items
- Limit how many different items go in one trip
- Copy a shopping list, or share your item list with a link
- Lists are saved in the browser on each device; works offline in the store and can be added to the home screen

## Menards picks (catalog)

Menards has no public product API, so prices come from Bright Data's "Menards Products" scraper (dataset `gd_motp6b7s1n9zlq6lwj`) and are saved in `catalog.json`. The app searches that file on the phone: single items, or 2 or 3 different items, closest to the check with tax. Prices are a snapshot and vary by store, so every item links to its Menards.com page.

To refresh:

1. Put Menards product page URLs in `scripts/urls.txt` (one per line). Each URL is one Bright Data record; the free tier is 5,000 a month.
2. Add the repo secret `BRIGHTDATA_API_KEY` (`gh secret set BRIGHTDATA_API_KEY`).
3. Run the **Refresh Menards catalog** workflow (Actions tab), or it runs on the 2nd of each month.
4. To have the workflow redeploy the site, also add `CLOUDFLARE_API_TOKEN` (Pages edit) and `CLOUDFLARE_ACCOUNT_ID` secrets.

Locally: `BRIGHTDATA_API_KEY=... node scripts/refresh-catalog.mjs --raw` (the `--raw` flag saves the scraper output so you can check its field names).

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
| `index.html` | The whole app: markup, styles, and script, including the match solver |
| `sw.js` | Offline caching |
| `catalog.json` | Menards items and prices (generated) |
| `scripts/refresh-catalog.mjs`, `scripts/urls.txt` | Catalog refresh from Bright Data |
| `.github/workflows/refresh-catalog.yml` | Monthly refresh and redeploy |
| `manifest.webmanifest`, `icon*.png`, `icon.svg` | Home-screen install |
| `_headers` | Cloudflare Pages response headers |
