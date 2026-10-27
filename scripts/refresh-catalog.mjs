// Rebuilds catalog.json with real Menards prices for the ideas in ideas.json.
//
//   BRIGHTDATA_API_KEY=... BRIGHTDATA_SERP_ZONE=... node scripts/refresh-catalog.mjs
//
// 1. Find: for each idea with no saved products yet, a Google search limited to menards.com
//    (Bright Data SERP API, 1 credit each) picks up to 3 Menards product pages. They're saved
//    to scripts/idea-urls.json so later runs skip this step. Skipped when BRIGHTDATA_SERP_ZONE isn't set.
// 2. Price: Bright Data's "Menards Products" scraper reads every saved product page, plus any extra
//    URLs in scripts/urls.txt (1 record each).
// Options: --find-only stops after step 1. --limit N looks up at most N ideas this run.
//          --retry-missing searches again for ideas that found nothing last time.
//          --raw saves the untouched scraper output to scripts/raw-snapshot.json for checking field names.
//          --from <file.json> builds catalog.json from a Bright Data export instead of calling the API.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DATASET_ID = "gd_motp6b7s1n9zlq6lwj"; // Bright Data: Menards Products (collect by URL)
const API = "https://api.brightdata.com/datasets/v3";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const fromIdx = process.argv.indexOf("--from");
const fromFile = fromIdx > 0 ? process.argv[fromIdx + 1] : null;
const key = process.env.BRIGHTDATA_API_KEY;
if (!key && !fromFile) { console.error("Set BRIGHTDATA_API_KEY first."); process.exit(1); }
const auth = { Authorization: `Bearer ${key}` };

const PRODUCT = /^https:\/\/www\.menards\.com\/main\/.+\/p-\d+[^?#]*/;
const clean = u => String(u || "").split(/[?#]/)[0];

async function readUrls() {
  const text = await readFile(path.join(here, "urls.txt"), "utf8").catch(() => "");
  const urls = text.split(/\r?\n/).map(l => l.split(",")[0].trim().replace(/^"|"$/g, ""))
    .filter(l => PRODUCT.test(l)).map(clean);
  return [...new Set(urls)];
}

const ideaUrlsFile = path.join(here, "idea-urls.json");
const readJson = async (f, fallback) => JSON.parse(await readFile(f, "utf8").catch(() => JSON.stringify(fallback)));

// A found product only counts if its link mentions the idea's key word, so "washer fluid"
// doesn't pick up zinc washers. The key word is the idea's m, or the last word of its name.
function relevant(idea, link) {
  // .../<category>/<product-name>/<sku>/p-123.htm: only the product name counts, not the category folders.
  const parts = link.toLowerCase().split("/");
  const slug = parts[parts.length - 3] || "";
  const head = idea.n.split(",")[0].trim().split(/\s+/).pop().toLowerCase().replace(/s$/, "");
  return new RegExp(idea.m || head.replace(/[^a-z0-9-]/g, "")).test(slug);
}

// Google results for `site:menards.com <phrase>` through Bright Data's SERP API.
async function findProducts(ideas, saved) {
  const zone = process.env.BRIGHTDATA_SERP_ZONE;
  const li = process.argv.indexOf("--limit");
  const retry = process.argv.includes("--retry-missing");
  const todo = ideas.filter(i => !(i.id in saved) || (retry && !saved[i.id].length)).slice(0, li > 0 ? +process.argv[li + 1] || Infinity : Infinity);
  if (!todo.length) return;
  if (!zone) { console.log(`${todo.length} ideas haven't been searched yet; set BRIGHTDATA_SERP_ZONE to look them up.`); return; }
  console.log(`Looking up ${todo.length} ideas on Google…`);
  let found = 0;
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(todo.slice(i, i + 5).map(async idea => {
      // Each phrasing finds Menards products for a different set of items (tested Oct 2026),
      // so try them in turn until one turns up a matching product.
      const term = idea.q.replace(/(^|\s)-/g, "$1");
      const q = s => encodeURIComponent(s);
      const google = (s, extra = "") => `https://www.google.com/search?q=${q(s)}&gl=us&hl=en&brd_json=1${extra}`;
      const engines = [
        google(`menards ${term}`),
        `https://www.bing.com/search?q=${q(`menards ${term}`)}&cc=us&brd_json=1`,
        google(`${term} site:menards.com/main`),
        google(term, "&as_sitesearch=www.menards.com"),
      ];
      try {
        let links = [], all = [];
        for (const url of engines) {
          let data;
          for (let attempt = 0; attempt < 3 && !data; attempt++) {
            const res = await call("https://api.brightdata.com/request", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ zone, url, format: "raw" }),
            });
            // Busy searches sometimes come back empty; try again.
            if (res && typeof res === "object") data = res;
            else if (res) { console.log(`  ${new URL(url).hostname} said: ${String(res).slice(0, 100)}`); break; } // not results; try the other engine
            else await sleep(2000);
          }
          if (!data) continue;
          all = (data.organic || []).map(r => clean(r.link || r.url));
          links = all.filter(l => PRODUCT.test(l) && relevant(idea, l));
          if (links.length) break;
        }
        saved[idea.id] = [...new Set(links)].slice(0, 3);
        if (saved[idea.id].length) found++;
        else console.log(`  no Menards products for "${idea.n}" (top results: ${all.slice(0, 3).join(" ") || "none"})`);
      } catch (e) {
        if (/^40[13] /.test(e.message)) throw e; // bad key or zone: every lookup would fail the same way
        console.log(`  lookup failed for "${idea.n}": ${e.message.slice(0, 160)}`);
      }
    }));
    await writeFile(ideaUrlsFile, JSON.stringify(saved, null, 1));
  }
  console.log(`Found products for ${found} of ${todo.length} ideas.`);
}

async function call(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...auth, ...(opts.headers || {}) } });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} from ${url.split("?")[0]}: ${body.slice(0, 400)}`);
  try { return JSON.parse(body); } catch { return body; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function scrape(urls) {
  const { snapshot_id } = await call(`${API}/trigger?dataset_id=${DATASET_ID}&include_errors=true&format=json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: urls.map(url => ({ url, all_variations: false })) }),
  });
  console.log(`Started snapshot ${snapshot_id} for ${urls.length} URLs`);
  for (let i = 0; ; i++) {
    await sleep(Math.min(60000, 10000 + i * 5000));
    const p = await call(`${API}/progress/${snapshot_id}`);
    console.log(`  ${p.status}${p.records != null ? ` · ${p.records} records` : ""}`);
    if (p.status === "ready") break;
    if (p.status === "failed") throw new Error(`Snapshot failed: ${JSON.stringify(p)}`);
    if (i > 120) throw new Error("Gave up waiting for the snapshot.");
  }
  return call(`${API}/snapshot/${snapshot_id}?format=json`);
}

// Field names aren't fully documented, so try the usual ones.
const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== "") return o[k]; };
function cents(v) {
  if (v == null) return 0;
  if (typeof v === "object") v = pick(v, ["value", "amount", "price"]);
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return isFinite(n) ? Math.round(n * 100) : 0;
}
const titleCase = s => s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()).replace(/ And /g, " & ");
function dept(row) {
  const tree = row.category_tree;
  // category_tree starts with "Home"; the department is the next level down.
  if (Array.isArray(tree) && tree.length > 1) { const t = tree[1]; return String(t.name ?? t).trim(); }
  const m = String(row.url || "").match(/menards\.com\/main\/([^/]+)\//);
  return m ? titleCase(m[1]) : String(row.product_category || "").trim();
}

function toItem(row) {
  if (!row || row.error || row.warning_code === "dead_page") return null;
  const n = String(pick(row, ["title", "name", "product_name"]) || "").trim();
  // "price" is the register price. Bright Data's "sale_price" is the price after the 11% mail-in rebate,
  // which isn't what the check has to cover.
  const p = cents(pick(row, ["price", "final_price", "current_price", "initial_price"]));
  const u = clean(row.url || row.input?.url);
  const stock = String(pick(row, ["availability", "in_stock", "stock_status"]) ?? "").toLowerCase();
  if (!n || !p || !u) return null;
  if (/site can.t be reached|pardon our interruption|access denied/i.test(n)) return null; // blocked fetches
  if (/out.of.stock|unavailable|discontinued|false/.test(stock)) return null;
  if (/gift card/i.test(n)) return null; // rebate checks can't buy gift cards
  return { n: n.slice(0, 120), p, d: dept(row), u };
}

const { ideas } = await readJson(path.join(root, "ideas.json"), { ideas: [] });
const saved = await readJson(ideaUrlsFile, {});
const ideaOf = {}; // product url -> idea id
const index = () => { for (const [id, urls] of Object.entries(saved)) for (const u of urls) ideaOf[u] = id; };

let rows;
if (fromFile) { index(); rows = JSON.parse(await readFile(fromFile, "utf8")); }
else {
  await findProducts(ideas, saved);
  if (process.argv.includes("--find-only")) process.exit(0);
  index();
  const urls = [...new Set([...Object.keys(ideaOf), ...await readUrls()])];
  if (!urls.length) { console.error("No Menards product URLs to price. Set BRIGHTDATA_SERP_ZONE or add some to scripts/urls.txt."); process.exit(1); }
  rows = await scrape(urls);
}
const list = Array.isArray(rows) ? rows : [];
if (process.argv.includes("--raw")) await writeFile(path.join(here, "raw-snapshot.json"), JSON.stringify(list, null, 2));

const items = list.map(toItem).filter(Boolean);
for (const it of items) if (ideaOf[it.u]) it.i = ideaOf[it.u];
if (!items.length) {
  console.error(`Got ${list.length} rows but none had a name and price. First row keys: ${Object.keys(list[0] || {}).join(", ")}`);
  process.exit(1);
}
items.sort((a, b) => a.d.localeCompare(b.d) || a.p - b.p);
await writeFile(path.join(root, "catalog.json"), JSON.stringify({ updated: new Date().toISOString(), items }));
console.log(`Wrote catalog.json with ${items.length} of ${list.length} items.`);
