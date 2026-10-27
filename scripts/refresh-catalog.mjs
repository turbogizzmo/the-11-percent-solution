// Rebuilds catalog.json from Bright Data's "Menards Products" scraper.
//
//   BRIGHTDATA_API_KEY=... node scripts/refresh-catalog.mjs
//
// Reads product page URLs from scripts/urls.txt (one per line, or a CSV with a "url" column,
// like the input file Bright Data's dashboard exports). Each URL costs one Bright Data record.
// Options: --raw saves the untouched scraper output to scripts/raw-snapshot.json for checking field names.
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

async function readUrls() {
  const text = await readFile(path.join(here, "urls.txt"), "utf8");
  const urls = text.split(/\r?\n/).map(l => l.split(",")[0].trim().replace(/^"|"$/g, ""))
    .filter(l => /^https:\/\/www\.menards\.com\/main\/.+\/p-\d+/.test(l));
  return [...new Set(urls)];
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
  const u = String(row.url || "").split("?")[0];
  const stock = String(pick(row, ["availability", "in_stock", "stock_status"]) ?? "").toLowerCase();
  if (!n || !p || !u) return null;
  if (/site can.t be reached|pardon our interruption|access denied/i.test(n)) return null; // blocked fetches
  if (/out.of.stock|unavailable|discontinued|false/.test(stock)) return null;
  if (/gift card/i.test(n)) return null; // rebate checks can't buy gift cards
  return { n: n.slice(0, 120), p, d: dept(row), u };
}

let rows;
if (fromFile) rows = JSON.parse(await readFile(fromFile, "utf8"));
else {
  const urls = await readUrls();
  if (!urls.length) { console.error("No Menards product URLs in scripts/urls.txt."); process.exit(1); }
  rows = await scrape(urls);
}
const list = Array.isArray(rows) ? rows : [];
if (process.argv.includes("--raw")) await writeFile(path.join(here, "raw-snapshot.json"), JSON.stringify(list, null, 2));

const items = list.map(toItem).filter(Boolean);
if (!items.length) {
  console.error(`Got ${list.length} rows but none had a name and price. First row keys: ${Object.keys(list[0] || {}).join(", ")}`);
  process.exit(1);
}
items.sort((a, b) => a.d.localeCompare(b.d) || a.p - b.p);
await writeFile(path.join(root, "catalog.json"), JSON.stringify({ updated: new Date().toISOString(), items }));
console.log(`Wrote catalog.json with ${items.length} of ${list.length} items.`);
