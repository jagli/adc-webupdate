// Proof 1: reading every page and writing the same content back changes nothing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extract, toData, apply } from "../engine/model.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PAGES = ["index", "about", "performances", "school", "activities", "store", "support", "contact", "research", "testimonials", "credentials", "gallery"];
let bad = 0, slots = 0, lists = 0, rows = 0;
for (const p of PAGES) {
  const src = fs.readFileSync(path.join(ROOT, `${p}.html`), "utf8");
  const data = toData(extract(p, src));
  for (const b of data.blocks) { slots += b.slots.length; lists += b.lists.length; rows += b.lists.reduce((n, l) => n + l.rows.length, 0); }
  const out = apply(p, src, JSON.parse(JSON.stringify(data)), { today: 0 });
  if (out.src !== src) { bad++; const i = [...src].findIndex((c, k) => c !== out.src[k]); console.log(`✗ ${p}: differs at ${i}: …${JSON.stringify(src.slice(i - 40, i + 60))}\n   got …${JSON.stringify(out.src.slice(i - 40, i + 60))}`); }
  else console.log(`✓ ${p.padEnd(13)} ${data.blocks.length} sections`);
  if (out.problems.length) console.log("   problems:", out.problems.slice(0, 3));
}
console.log(`\n${slots} single texts/photos/videos, ${lists} lists with ${rows} rows`);
process.exit(bad ? 1 : 0);
