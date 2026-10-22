// Proof 2: edits made in the Sheet land in the right place, and only there.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extract, toData, apply } from "../engine/model.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = process.argv[2];
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) fails++; };

const p = "performances";
const src = fs.readFileSync(path.join(ROOT, `${p}.html`), "utf8");
const data = toData(extract(p, src));
const block = (k) => data.blocks.find((b) => b.key === `${p}/${k}`);

// 1. a heading
block("upcoming-shows").slots.find((s) => s.what === "Heading").value = "Our Events & Tours";
// 2. events: add one, hide one, add a past one, scramble order
const ev = block("upcoming-list").lists[0];
ev.rows.push({ key: "new-1", show: true, cells: { Item: "**1 Mar 2027** — *Test Premiere*: [Tickets](https://example.com/t)" } });
ev.rows.push({ key: "new-2", show: true, cells: { Item: "**1 Jan 2020** — An old show" } });
ev.rows[2].show = false;
ev.rows.reverse();
// 3. a card: bold + new card
const cards = block("what-makes-adc-unique").lists[0];
cards.rows[0].cells.Text = "Everything is made **in-house**, start to finish.";
cards.rows.push({ key: "new-3", show: true, cells: { "Small heading": "New Card", Text: "Added from the Sheet." } });
// 4. photo + video
const gt = block("get-tickets").slots.find((s) => s.kind === "photo");
gt.value = "assets/web/content/test-photo.jpg"; gt.alt = "A test photo";
block("what-makes-adc-unique").slots.find((s) => s.kind === "video").value = "https://youtu.be/la7C2BQlbHY";

const out = apply(p, src, data, { today: Date.parse("2026-10-23") });
if (OUT) fs.writeFileSync(OUT, out.src);
const again = toData(extract(p, out.src));
const b2 = (k) => again.blocks.find((b) => b.key === `${p}/${k}`);

ok(b2("upcoming-shows").slots.find((s) => s.what === "Heading").value === "Our Events & Tours", "heading changed (and & written safely)");
ok(out.src.includes("Our Events &amp; Tours"), "ampersand escaped in HTML");
const items = b2("upcoming-list").lists[0].rows.map((r) => r.cells.Item);
ok(items.length === 11, `events: 11 kept (11 + 2 added − 1 hidden − 1 past) → ${items.length}`);
ok(!items.some((i) => i.includes("An old show")), "past event dropped");
ok(!items.some((i) => i.includes("14 Nov 2026")), "hidden event left out");
ok(items[0].startsWith("**4 Nov 2026**") && items[items.length - 1].includes("Test Premiere"), "events sorted by date");
ok(out.src.includes('<a href="https://example.com/t" target="_blank" rel="noopener">Tickets</a>'), "link written with new-tab");
const c2 = b2("what-makes-adc-unique").lists[0].rows;
ok(c2.length === 4 && c2[3].cells["Small heading"] === "New Card", "new card added");
ok(out.src.includes("made <strong>in-house</strong>, start"), "bold written");
ok(out.src.includes('src="assets/web/content/test-photo.jpg" alt="A test photo"'), "photo and description changed");
ok(out.src.includes("https://youtu.be/la7C2BQlbHY") && out.src.includes("img.youtube.com/vi/la7C2BQlbHY/hqdefault.jpg"), "video changed and its picture follows");
// everything outside the edited parts is untouched
const untouched = ["productions", "past-performances"].every((k) => JSON.stringify(b2(k)) === JSON.stringify(block(k)));
ok(untouched, "other sections unchanged");
ok(out.problems.length === 0, `no problems (${out.problems.join("; ")})`);
process.exit(fails ? 1 : 0);
