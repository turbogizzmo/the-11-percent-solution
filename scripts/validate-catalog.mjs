// Checks catalog.json and scripts/idea-urls.json before the refresh workflow commits and deploys them,
// so a bad or tampered Bright Data response can't reach the live site.
//
//   node scripts/validate-catalog.mjs
//
// Exits 1 and lists the problems if anything looks wrong.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const PRODUCT = /^https:\/\/www\.menards\.com\/main\/.+\/p-\d+[^?#]*$/; // same pages refresh-catalog.mjs accepts
const MAX_CENTS = 10_000_000; // $100,000; real items top out around $1,600
const CONTROL = /[\u0000-\u001f\u007f]/;

const problems = [];
const bad = (where, why) => { if (problems.length < 50) problems.push(`${where}: ${why}`); };
const text = (v, max) => typeof v === "string" && v.trim() && v.length <= max && !CONTROL.test(v);
const load = async f => { try { return JSON.parse(await readFile(path.join(root, f), "utf8")); } catch (e) { bad(f, e.message); return null; } };

const { ideas = [] } = (await load("ideas.json")) || {};
const ids = new Set(ideas.map(d => d.id));

const catalog = await load("catalog.json");
if (catalog) {
  if (typeof catalog.updated !== "string" || isNaN(Date.parse(catalog.updated))) bad("catalog.json", "updated is not a date");
  if (!Array.isArray(catalog.items) || !catalog.items.length) bad("catalog.json", "items is empty or missing");
  else catalog.items.forEach((x, k) => {
    const at = `catalog.json items[${k}]`;
    if (!x || typeof x !== "object") return bad(at, "not an object");
    const extra = Object.keys(x).filter(f => !["n", "p", "d", "u", "i"].includes(f));
    if (extra.length) bad(at, `unexpected fields ${extra.join(", ")}`);
    if (!text(x.n, 120)) bad(at, "n must be 1-120 characters of text");
    if (!Number.isInteger(x.p) || x.p <= 0 || x.p > MAX_CENTS) bad(at, `p ${JSON.stringify(x.p)} is not a sane price in cents`);
    if (typeof x.d !== "string" || x.d.length > 120 || CONTROL.test(x.d)) bad(at, "d must be text up to 120 characters");
    if (typeof x.u !== "string" || x.u.length > 500 || !PRODUCT.test(x.u)) bad(at, `u ${JSON.stringify(String(x.u).slice(0, 80))} is not a Menards product page`);
    if (x.i !== undefined && !ids.has(x.i)) bad(at, `i ${JSON.stringify(x.i)} is not an idea in ideas.json`);
  });
}

const saved = await load("scripts/idea-urls.json");
if (saved) {
  if (typeof saved !== "object" || Array.isArray(saved)) bad("scripts/idea-urls.json", "not an object");
  else for (const [id, urls] of Object.entries(saved)) {
    const at = `scripts/idea-urls.json ${JSON.stringify(id)}`;
    if (!ids.has(id)) bad(at, "not an idea in ideas.json");
    if (!Array.isArray(urls)) { bad(at, "not a list"); continue; }
    for (const u of urls) if (typeof u !== "string" || u.length > 500 || !PRODUCT.test(u)) bad(at, `${JSON.stringify(String(u).slice(0, 80))} is not a Menards product page`);
  }
}

if (problems.length) {
  console.error(`Catalog check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`Catalog check passed: ${catalog.items.length} items, ${Object.keys(saved).length} ideas with saved pages.`);
