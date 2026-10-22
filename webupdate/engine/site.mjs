/**
 * The whole website's editable content as one file (content.json), read from the site's own files:
 *   global       — contact details and social links (js/chrome.js, the SITE block)
 *   productions  — the Productions list (content/productions.csv)
 *   pages        — every page's sections, texts, photos, videos and lists (engine/model.mjs)
 */
import fs from "node:fs";
import path from "node:path";
import { extract, toData } from "./model.mjs";

export const PAGES = ["index", "about", "performances", "school", "activities", "store", "support", "contact", "research", "testimonials", "credentials", "gallery"];

export const PAGE_NAMES = {
  index: "Home", about: "About", performances: "Performances", school: "School", activities: "Activities", store: "Store",
  support: "Support", contact: "Contact", research: "Research", testimonials: "Testimonials", credentials: "Credentials", gallery: "Gallery",
};

/** Global fields: Sheet label → SITE key in js/chrome.js. */
export const GLOBAL_FIELDS = [
  ["Company name", "name"], ["Tagline", "tagline"], ["Email", "email"], ["Phone", "phone"],
  ["School email", "schoolEmail"], ["School phone", "schoolPhone"], ["Instagram link", "instagram"],
  ["YouTube link", "youtube"], ["School Instagram link", "schoolInstagram"], ["Show School Instagram (Yes/No)", "showSchoolInstagram"],
];

export const PRODUCTION_COLUMNS = ["Production", "Label", "Length", "Artists", "Style", "About", "Performers", "Director", "Music", "Lighting", "Availability", "Poster", "Media folder", "Videos", "Show"];

/* ── CSV ── */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ""));
}

export const toCsv = (rows) => rows.map((r) => r.map((v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(",")).join("\n") + "\n";

/* ── global block in chrome.js ── */
export function readGlobal(chromeJs) {
  const block = chromeJs.slice(chromeJs.indexOf("const SITE = {"), chromeJs.indexOf("};", chromeJs.indexOf("const SITE = {")));
  const out = {};
  for (const [, key] of GLOBAL_FIELDS) {
    const m = new RegExp(`\\n\\s*${key}:\\s*("(?:[^"\\\\]|\\\\.)*"|true|false)`).exec(block);
    if (m) out[key] = m[1].startsWith('"') ? JSON.parse(m[1]) : m[1] === "true";
  }
  return out;
}

export function writeGlobal(chromeJs, global) {
  const start = chromeJs.indexOf("const SITE = {");
  const end = chromeJs.indexOf("};", start);
  let block = chromeJs.slice(start, end);
  for (const [, key] of GLOBAL_FIELDS) {
    if (!(key in global)) continue;
    const v = global[key];
    const lit = typeof v === "boolean" ? String(v) : JSON.stringify(String(v));
    block = block.replace(new RegExp(`(\\n\\s*${key}:\\s*)("(?:[^"\\\\]|\\\\.)*"|true|false)`), `$1${lit}`);
  }
  return chromeJs.slice(0, start) + block + chromeJs.slice(end);
}

/** content.json for a site folder. */
export function readSite(root) {
  const pages = {};
  for (const p of PAGES) pages[p] = toData(extract(p, fs.readFileSync(path.join(root, `${p}.html`), "utf8")));
  const csv = parseCsv(fs.readFileSync(path.join(root, "content", "productions.csv"), "utf8"));
  const head = csv[0];
  const productions = csv.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
  const global = readGlobal(fs.readFileSync(path.join(root, "js", "chrome.js"), "utf8"));
  return { version: 1, global, productions, pages };
}
