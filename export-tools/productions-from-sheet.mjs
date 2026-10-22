/**
 * Productions list → the website.
 *
 * Reads the Productions list (content/productions.csv, the same columns as the
 * "Productions" tab of the Google Sheet) and writes the two things the
 * Performances page needs:
 *
 *   1. the poster tiles, between the two marker comments in performances.html
 *   2. js/productions-data.js, which the pop-up (js/productions.js) reads
 *
 * No page is made per production. The pop-up is built in the visitor's browser
 * from the one data file.
 *
 *   node export-tools/productions-from-sheet.mjs                 use content/productions.csv
 *   node export-tools/productions-from-sheet.mjs downloaded.csv  use a file downloaded from the Sheet
 *                                                                (it is copied to content/productions.csv)
 *   node export-tools/productions-from-sheet.mjs --check         change nothing; fail if the site is out of date
 *
 * Dev-only. Nothing here is published.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV = path.join(ROOT, "content", "productions.csv");
const PAGE = path.join(ROOT, "performances.html");
const DATA = path.join(ROOT, "js", "productions-data.js");
const START = "<!--list:performances.productions-->";
const END = "<!--/list-->";
const COLUMNS = [
  "Production", "Label", "Length", "Artists", "Style", "About", "Performers",
  "Director", "Music", "Lighting", "Availability", "Poster", "Media folder", "Videos", "Show",
];

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const given = args.find((a) => !a.startsWith("--"));

const problems = [];
const notes = [];

/** CSV text → rows of cells. Handles quoted cells, doubled quotes and line breaks inside a cell. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "Krishnaa — Fire to Frost" → "krishnaa-fire-to-frost" */
const slugOf = (name) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Plain text with **bold** and *italic* → safe HTML. */
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");

function youtubeId(url) {
  const m = String(url).match(/(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : "";
}

const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");
const exists = (relPath) => fs.existsSync(path.join(ROOT, relPath));

/** Web-ready photos of one production, in file-name order. */
function photosFor(slug) {
  const dir = path.join(ROOT, "assets", "web", "images", "productions", slug);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort()
    .map((f) => rel(path.join(dir, f)));
}

// ---- read ------------------------------------------------------------------

if (given) {
  if (CHECK) throw new Error("--check takes no file");
  fs.mkdirSync(path.dirname(CSV), { recursive: true });
  fs.copyFileSync(path.resolve(given), CSV);
}
let table = parseCsv(fs.readFileSync(CSV, "utf8"));
// The Sheet has an instruction row above the title row; the title row is the one that starts "Production".
const titleRow = table.findIndex((r) => r[0].trim().toLowerCase() === "production");
if (titleRow < 0) {
  console.error('Productions list: nothing was changed.\n  ✗ No title row found (a row whose first cell is "Production").');
  process.exit(1);
}
table = table.slice(titleRow);
const head = table[0].map((c) => c.trim().toLowerCase());
for (const col of COLUMNS) {
  if (!head.includes(col.toLowerCase())) problems.push(`The "${col}" column is missing from the title row.`);
}
for (const col of head) {
  if (col && !COLUMNS.some((c) => c.toLowerCase() === col)) notes.push(`Column "${col}" is not used by the website and was ignored.`);
}
const at = (row, col) => (row[head.indexOf(col.toLowerCase())] || "").trim();

const productions = [];
const seen = new Set();
table.slice(1).forEach((row, n) => {
  const line = n + 2 + titleRow;
  const name = at(row, "Production");
  if (!name) { problems.push(`Row ${line}: the Production name is empty.`); return; }
  const show = at(row, "Show").toLowerCase();
  if (show && show !== "yes" && show !== "no") problems.push(`Row ${line} (${name}): Show must be Yes or No.`);
  if (show === "no") return;
  const slug = slugOf(name);
  if (seen.has(slug)) { problems.push(`Row ${line}: "${name}" is in the list twice.`); return; }
  seen.add(slug);

  // Poster: a path inside the site. A Drive link cannot be followed until the reader is set up.
  let poster = at(row, "Poster");
  const fallback = `assets/web/slots/productions/${slug}.jpg`;
  if (/^https?:/i.test(poster) || !poster) {
    if (poster) notes.push(`${name}: the poster is a web link; it is fetched once the Drive reader is set up.`);
    poster = exists(fallback) ? fallback : "";
  }
  if (poster && !exists(poster)) { problems.push(`Row ${line} (${name}): poster "${poster}" is not in the site's files.`); poster = ""; }
  if (!poster) notes.push(`${name}: no poster yet. Run "npm run media:slots" to make a placeholder.`);

  const videos = at(row, "Videos").split(/[\s,]+/).filter(Boolean).map((link) => {
    const id = youtubeId(link);
    if (!id) problems.push(`Row ${line} (${name}): "${link}" is not a YouTube link.`);
    return id;
  }).filter(Boolean);

  const photos = photosFor(slug);
  const folder = at(row, "Media folder");
  if (folder && !photos.length) notes.push(`${name}: has a media folder link but no web-ready photos yet (assets/web/images/productions/${slug}/).`);

  const item = { slug, name, poster: poster || fallback };
  const put = (key, value) => { if (value) item[key] = value; };
  put("label", at(row, "Label"));
  put("length", at(row, "Length"));
  put("artists", at(row, "Artists"));
  put("style", at(row, "Style"));
  const about = at(row, "About").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => inline(p).replace(/\n/g, "<br>"));
  if (about.length) item.about = about;
  put("performers", at(row, "Performers"));
  put("director", at(row, "Director"));
  put("music", at(row, "Music"));
  put("lighting", at(row, "Lighting"));
  put("availability", at(row, "Availability"));
  if (photos.length) item.photos = photos;
  if (videos.length) item.videos = videos;
  productions.push(item);
});

// ---- write -----------------------------------------------------------------

const tiles = productions.map((p) =>
  `          <figure class="s-prod" data-production="${p.slug}"><img src="${esc(p.poster)}" alt="${esc(p.name)}"><figcaption class="s-prod__cap"><strong>${esc(p.name)}</strong></figcaption></figure>`
).join("\n");

const data =
  "/** Productions shown on the Performances page. One entry per poster; the pop-up is built from it.\n" +
  " *  Written from the Productions list by the site tools. Do not edit by hand.\n" +
  " */\n" +
  `window.ADC_PRODUCTIONS = ${JSON.stringify(productions, null, 2)};\n`;

let page = fs.readFileSync(PAGE, "utf8");
const a = page.indexOf(START);
const b = a < 0 ? -1 : page.indexOf(END, a);
if (a < 0 || b < 0) problems.push(`performances.html has lost its markers ${START} … ${END}.`);

if (problems.length) {
  console.error("Productions list: nothing was changed.\n" + problems.map((p) => "  ✗ " + p).join("\n"));
  process.exit(1);
}

const lineStart = page.lastIndexOf("\n", b) + 1;
const nextPage = page.slice(0, a + START.length) + "\n" + tiles + "\n" + page.slice(lineStart);
const oldData = fs.existsSync(DATA) ? fs.readFileSync(DATA, "utf8") : "";

if (CHECK) {
  if (nextPage !== page || data !== oldData) {
    console.error('Productions: the page is behind content/productions.csv. Run "npm run content:productions".');
    process.exit(1);
  }
  console.log(`Productions: ${productions.length} on the page, matching the list.`);
} else {
  if (nextPage !== page) fs.writeFileSync(PAGE, nextPage);
  if (data !== oldData) fs.writeFileSync(DATA, data);
  console.log(`Productions: ${productions.length} written` + (nextPage === page && data === oldData ? " (no change)." : "."));
  notes.forEach((n) => console.log("  · " + n));
}
