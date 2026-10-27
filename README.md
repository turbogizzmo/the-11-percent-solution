# The 11% Solution

Got a rebate check for an odd amount like $86.28? Enter it, keep a list of things you'd buy anyway, and the app finds the combination that uses up the check (sales tax included) without paying a few hundred extra.

Not affiliated with or endorsed by Menards. Prices are whatever you enter.

## Features

- Closest-match search over your own list, with sales tax so totals match the register
- Stack several checks, set how much you're OK paying out of pocket, and mark "must buy" items
- Limit how many different items go in one trip
- Copy a shopping list, or share your item list with a link
- Lists are saved in the browser on each device; works offline in the store and can be added to the home screen

## Why no live prices?

Menards has no public product API. The only automated options are paid third-party scraping services, which cost money per lookup, break when the site changes, and run against the site's terms. Each item links to a Menards.com search so you can check the current price.

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

The default sales tax is 5.5% (Eau Claire, WI). Change `tax:5.5` in `index.html` to set a different default; users can also change it on the check.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app: markup, styles, and script, including the match solver |
| `sw.js` | Offline caching |
| `manifest.webmanifest`, `icon*.png`, `icon.svg` | Home-screen install |
| `_headers` | Cloudflare Pages response headers |
