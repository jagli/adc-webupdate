// Proof 4: laying a page out in the Sheet and reading it back gives the same content,
// including rows an editor adds, hides and moves.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { readSite, PAGES, PAGE_NAMES } from "../engine/site.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = { SITE: "https://abhinava.dance/", JSON, String, Object, Math, Array, Date };
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
      ok(t && t.key === l.key && JSON.stringify(t.columns) === JSON.stringify(l.columns), `${p}: list ${l.key} (${t && t.what})`);
      ok(t && t.rows.length === l.rows.length, `${p}: list ${l.key} rows ${t && t.rows.length} vs ${l.rows.length}`);
      l.rows.forEach((row, k) => ok(t && t.rows[k] && t.rows[k].key === row.key && sortObj(clean(t.rows[k].cells)) === sortObj(clean(row.cells)), `${p}: ${row.key}`));
    });
    if (b.gallery) ok(JSON.stringify(r.gallery.rows.map(({ sheetRow, ...g }) => g)) === JSON.stringify(b.gallery.rows.map((g) => ({ show: true, type: g.type, src: g.src, shape: g.shape || "wide", caption: g.caption || "" }))), `${p}: gallery`);
  });
}

// editor actions on the Performances tab, the way an editor (or the panel's buttons) would do them
const p = "performances";
const live = site.pages[p];
const fresh = () => toValues(ctx.layoutPage_([p, "Performances"], live));
const W = fresh()[0].length;
const blank = (marker) => { const r = [marker, true]; while (r.length < W) r.push(""); return r; };
const idx = (vals, pred) => vals.findIndex(pred);
const evOf = (vals) => ctx.readPageRows_(vals, p).blocks.find((b) => b.key === "performances/upcoming-list").lists[0];
const liveEv = live.blocks.find((b) => b.key === "performances/upcoming-list").lists[0];

// 1. events come back exactly as the page has them
{
  const ev = evOf(fresh());
  ok(ev.rows.length === liveEv.rows.length && ev.rows.every((r, i) => r.cells.Item === liveEv.rows[i].cells.Item), "events: Date | Event | Details | Ticket link read back exactly");
}
// 2. hide an event, add one in a new row (marker copied by the panel), add one by hand-inserted row
{
  const v = fresh();
  const h = idx(v, (r) => String(r[0]).startsWith("events|"));
  v[h + 3][1] = false;
  const add = blank("ev|"); add[2] = "2 Apr 2027"; add[3] = "Test Premiere"; add[4] = "Chowdiah Hall, Bengaluru"; add[5] = "https://example.com/t";
  v.splice(h + 2, 0, add);
  const hand = blank(""); hand[2] = new Date(2027, 3, 3); hand[3] = "Hand Row";
  v.splice(h + 1, 0, hand);
  const ev = evOf(v);
  ok(ev.rows.filter((r) => r.show === false).length === 1, "events: one hidden");
  ok(ev.rows.some((r) => r.cells.Item === "**2 Apr 2027** — *Test Premiere*: Chowdiah Hall, Bengaluru · [Tickets](https://example.com/t)"), "events: new row written in the site's format");
  ok(ev.rows.some((r) => r.cells.Item === "**3 Apr 2027** — *Hand Row*"), "events: a date picked from the calendar reads as 3 Apr 2027");
}
// 3. a card's own list: one item per row — add, hide, and accidental clearing is caught
{
  const v = fresh();
  const card = idx(v, (r) => String(r[0]).startsWith("row|") && String(r[2]).includes("Cultural Festivals"));
  const firstItem = card + 1;
  ok(String(v[firstItem][0]).startsWith("sub|"), "festivals are item rows under their card");
  const col = v[firstItem].findIndex((x, i) => i > 1 && String(x).trim());
  const add = blank("sub|List (one per line)|"); add[col] = "Chennai Dance Festival — Chennai";
  v.splice(firstItem + 1, 0, add);
  v[firstItem + 2][1] = false; // hide the (old) second festival
  const back = ctx.readPageRows_(v, p);
  const list = back.blocks.find((b) => b.key === "performances/past-performances").lists.find((l) => l.rows.some((r) => /Cultural/.test(r.cells.Text)));
  const items = list.rows.find((r) => /Cultural/.test(r.cells.Text)).cells["List (one per line)"].split("\n");
  const orig = live.blocks.find((b) => b.key === "performances/past-performances").lists.find((l) => l.key === list.key).rows.find((r) => /Cultural/.test(r.cells.Text)).cells["List (one per line)"].split("\n");
  ok(items[1] === "Chennai Dance Festival — Chennai" && items.length === orig.length, `festivals: one added, one hidden (${items.length} of ${orig.length + 1})`);
  ok(!items.includes(orig[1]), "festivals: the hidden one is left out");
  ok(back.problems.length === 0, "no problems for normal edits");
  v[firstItem][col] = ""; // an editor clears a festival by mistake
  const bad = ctx.readPageRows_(v, p);
  ok(bad.problems.some((m) => /untick Show instead/.test(m)), "clearing an item by mistake is caught: " + (bad.problems[0] || ""));
}
// 4. clearing a whole card row by mistake is caught, a carousel photo can be hidden
{
  const v = fresh();
  const card = idx(v, (r) => String(r[0]).startsWith("row|") && String(r[2]).includes("Corporate Shows"));
  for (let c = 2; c < W; c++) v[card][c] = "";
  ok(ctx.readPageRows_(v, p).problems.length > 0, "clearing a whole card is caught");
}
{
  const s2 = "school";
  const v = toValues(ctx.layoutPage_([s2, "School"], site.pages[s2]));
  const ph = idx(v, (r) => String(r[0]) === "pho|1");
  v[ph][1] = false;
  const back = ctx.readPageRows_(v, s2);
  const origSlot = site.pages[s2].blocks.flatMap((b) => b.slots).find((x) => x.kind === "photos");
  const slot = back.blocks.flatMap((b) => b.slots).find((x) => x.key === origSlot.key);
  ok(slot.value.split("\n").length === origSlot.value.split("\n").length - 1, "carousel: one photo hidden");
}
// 5. the panel's Move up / Move down: what moves together
{
  const v = fresh();
  const marks = v.map((r) => r[0]);
  const card = idx(v, (r) => String(r[0]).startsWith("row|") && String(r[2]).includes("Corporate Shows"));
  const u = ctx.rowUnit_(marks, card);
  ok(u && u.kind === "row" && u.end > u.start && u.prev && /Cultural/.test(v[u.prev.start][2]), "a card moves with its own items, past the card above");
  const item = idx(v, (r) => String(r[0]).startsWith("sub|"));
  const ui = ctx.rowUnit_(marks, item);
  ok(ui && ui.start === ui.end && !ui.prev && ui.next, "an item moves alone, only among its card's items");
  ok(ctx.rowUnit_(marks, idx(v, (r) => String(r[0]).startsWith("block|"))) === null, "bands and headers do not move");
}
// Productions as cards: read back exactly; hide, clear, new card, moving
{
  const P = JSON.parse(JSON.stringify(site.productions));
  const laid = toValues(ctx.layoutProductions_(P));
  const back = JSON.parse(JSON.stringify(ctx.readProductions_(laid)));
  const norm = (l) => l.map((p) => JSON.stringify(Object.fromEntries(["Production", "Show", ...ctx.PRODUCTION_FIELDS].map((c) => [c, String(p[c] ?? (c === "Show" ? "Yes" : ""))]))));
  ok(back.problems.length === 0 && JSON.stringify(norm(back.productions)) === JSON.stringify(norm(P)), "productions: cards read back the same");
  const v = laid.map((r) => r.slice());
  const first = v.findIndex((r) => r[0] === "prod|1");
  v[first][1] = false;
  ok(ctx.readProductions_(v).productions[0].Show === "No", "productions: untick hides");
  const v2 = laid.map((r) => r.slice()); v2[first][3] = "";
  ok(ctx.readProductions_(v2).problems.length === 1, "productions: a cleared name is caught");
  const marks = laid.map((r) => r[0]);
  const u = ctx.rowUnit_(marks, first + 5);
  ok(u && u.kind === "prod" && u.start === first && u.end === first + ctx.PRODUCTION_FIELDS.length + 1 && !u.prev && u.next, "productions: clicking any detail picks the whole card");
}
console.log(fails ? `\n${fails} problem(s)` : "✓ every page lays out and reads back the same; editor actions read correctly");
process.exit(fails ? 1 : 0);
