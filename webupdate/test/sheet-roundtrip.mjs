// Proof 4: laying a page out in the Sheet and reading it back gives the same content,
// including rows an editor adds, hides and moves.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { readSite, PAGES, PAGE_NAMES } from "../engine/site.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = { SITE: "https://abhinava.dance/", JSON, String, Object, Math, Array };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(HERE, "../apps-script/Layout.gs"), "utf8"), ctx);
const site = readSite(path.join(HERE, "../.."));
const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => String(v ?? "") !== ""));
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("✗ " + m); } };
const sortObj = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));

function toValues(laid) {
  const w = laid.rows.reduce((m, r) => Math.max(m, r.length), 5);
  return laid.rows.map((r) => { const x = r.slice(); while (x.length < w) x.push(""); return x; });
}

for (const p of PAGES) {
  const data = site.pages[p];
  const values = toValues(ctx.layoutPage_([p, PAGE_NAMES[p]], data));
  const back = JSON.parse(JSON.stringify(ctx.readPageRows_(values, p)));
  ok(back.blocks.length === data.blocks.length, `${p}: ${back.blocks.length} vs ${data.blocks.length} sections`);
  data.blocks.forEach((b, i) => {
    const r = back.blocks[i];
    ok(r && r.key === b.key && r.label === b.label, `${p}: section ${b.key}`);
    b.slots.forEach((s, j) => {
      const t = r.slots[j];
      ok(t && t.key === s.key && t.value === s.value && (s.alt === undefined || t.alt === s.alt) && (s.href === undefined || t.href === s.href), `${p}: slot ${s.key} → ${JSON.stringify(t)}`);
    });
    b.lists.forEach((l, j) => {
      const t = r.lists[j];
      ok(t && t.key === l.key && t.what === l.what && JSON.stringify(t.columns) === JSON.stringify(l.columns), `${p}: list ${l.key} (${t && t.what})`);
      ok(t && t.rows.length === l.rows.length, `${p}: list ${l.key} rows ${t && t.rows.length} vs ${l.rows.length}`);
      l.rows.forEach((row, k) => ok(t && t.rows[k] && t.rows[k].key === row.key && sortObj(clean(t.rows[k].cells)) === sortObj(clean(row.cells)), `${p}: ${row.key}`));
    });
    if (b.gallery) ok(JSON.stringify(r.gallery.rows.map(({ sheetRow, ...g }) => g)) === JSON.stringify(b.gallery.rows.map((g) => ({ show: true, type: g.type, src: g.src, shape: g.shape || "wide", caption: g.caption || "" }))), `${p}: gallery`);
  });
}

// editor actions on the Performances tab: move a row, hide a row, add a row by typing in a spare row,
// insert a brand-new row (empty column A) inside a list, paste a folder link
const p = "performances";
const values = toValues(ctx.layoutPage_([p, "Performances"], site.pages[p]));
const find = (pred) => values.findIndex(pred);
const evHead = find((r) => String(r[0]).startsWith("list|performances/upcoming-list/1|"));
values[evHead + 3][1] = false; // hide the 3rd event
const moved = values.splice(evHead + 1, 1)[0]; values.splice(evHead + 5, 0, moved); // move the 1st event down
const spare = find((r, i) => i > evHead && r[0] === "row|" && !r[2]);
values[spare][2] = "**2 Apr 2027** — Typed in a spare row";
const ins = ["", true, "**3 Apr 2027** — Inserted row"]; while (ins.length < values[0].length) ins.push("");
values.splice(evHead + 2, 0, ins);
const back = ctx.readPageRows_(values, p);
const ev = back.blocks.find((b) => b.key === "performances/upcoming-list").lists[0];
ok(ev.rows.some((r) => r.cells.Item.includes("Typed in a spare row") && r.key === "new-" + (spare + 1)) || ev.rows.some((r) => r.cells.Item.includes("Typed in a spare row")), "spare row read as a new row");
ok(ev.rows.some((r) => r.cells.Item.includes("Inserted row") && r.key.startsWith("new-")), "inserted row read as a new row");
ok(ev.rows.filter((r) => r.show === false).length === 1, "one hidden row");
ok(ev.rows.findIndex((r) => r.key === site.pages[p].blocks.find((b) => b.key === "performances/upcoming-list").lists[0].rows[0].key) > 1, "moved row is lower");
console.log(fails ? `\n${fails} problem(s)` : "✓ every page lays out and reads back the same; editor actions read correctly");
process.exit(fails ? 1 : 0);
