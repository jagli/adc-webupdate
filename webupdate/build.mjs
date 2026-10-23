#!/usr/bin/env node
/**
 * The web-update robot: content from the Sheet → a finished website.
 *
 *   node webupdate/build.mjs --content content.json [--site .] [--out out] [--test] [--base live-content.json]
 *
 *   1. copies the site's own files to a work folder (the site's files are never changed)
 *   2. fetches photos and PDFs pasted as Drive links, resizes photos for the web
 *   3. writes the Sheet's texts, lists, photos and videos into the pages, the contact details into
 *      the footer, and the Productions list into the Performances page
 *   4. builds the site exactly as the developer's build does (export-tools/build-site.mjs)
 *   5. with --base: writes the change page (review/index.html) showing only what changed, in place
 *
 * Any problem stops it with a plain message (tab › section › row) in out/problems.txt; nothing is
 * published then. Exit code 0 = built, 1 = problems.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { apply } from "./engine/model.mjs";
import { PAGES, PAGE_NAMES, writeGlobal, toCsv, PRODUCTION_COLUMNS, readSite, mergeContent } from "./engine/site.mjs";
import { resolveMedia } from "./engine/media.mjs";
import { validate } from "./engine/validate.mjs";
import { reviewPage } from "./engine/review.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? def : process.argv[i + 1]; };
const has = (name) => process.argv.includes(`--${name}`);

const SITE = path.resolve(arg("site", path.join(HERE, "..")));
const OUT = path.resolve(arg("out", path.join(HERE, ".out")));
const STAGE = path.join(OUT, ".stage");
const content = JSON.parse(fs.readFileSync(arg("content"), "utf8"));
const base = arg("base") ? JSON.parse(fs.readFileSync(arg("base"), "utf8")) : null;
const TEST = has("test");
content.pageNames = PAGE_NAMES;

const log = (...a) => console.log(...a);
function stop(problems) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "problems.txt"), problems.join("\n") + "\n");
  log(`\nStopped — ${problems.length} thing(s) to fix in the Sheet:`);
  for (const p of problems) log(`  • ${p}`);
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 0. check the Sheet's content before doing anything
const early = validate(content);
if (early.length) stop(early);

const TEMPLATES = Object.fromEntries(PAGES.map((p) => [p, fs.readFileSync(path.join(SITE, `${p}.html`), "utf8")]));

// 1. work copy of the site
const SKIP = new Set(["node_modules", ".git", "dist", "tools", ".proof", "webupdate", ".claude", ".secrets", ".github", "docs", ".cursor"]);
fs.cpSync(SITE, STAGE, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) || path.dirname(src) !== SITE });
log(`work copy: ${STAGE}`);

// 2. media
const problems = await resolveMedia(content, STAGE, { cache: process.env.WEBUPDATE_CACHE || path.join(HERE, ".cache"), log });
if (problems.length) stop(problems);

// 3a. pages
const today = Date.parse(new Date().toISOString().slice(0, 10));
for (const p of PAGES) {
  const file = path.join(STAGE, `${p}.html`);
  const src = fs.readFileSync(file, "utf8");
  const data = content.pages[p];
  if (!data) continue;
  const out = apply(p, src, data, { today });
  problems.push(...out.problems.map((m) => `${PAGE_NAMES[p]} › ${m}`));
  fs.writeFileSync(file, out.src);
}
// 3b. footer details
if (content.global) {
  const f = path.join(STAGE, "js/chrome.js");
  fs.writeFileSync(f, writeGlobal(fs.readFileSync(f, "utf8"), content.global));
}
// 3c. productions
if (content.productions) {
  const rows = [PRODUCTION_COLUMNS, ...content.productions.map((r) => PRODUCTION_COLUMNS.map((c) => r[c] ?? ""))];
  fs.writeFileSync(path.join(STAGE, "content/productions.csv"), toCsv(rows));
  try {
    execFileSync(process.execPath, [path.join(STAGE, "export-tools/productions-from-sheet.mjs")], { cwd: STAGE, stdio: "pipe" });
  } catch (e) {
    const msg = String(e.stdout || "") + String(e.stderr || "");
    problems.push(...msg.split("\n").filter((l) => /^\s*[•-]|row|Production/.test(l)).map((l) => `Productions › ${l.trim()}`).slice(0, 10));
    if (!problems.length) problems.push(`Productions: ${msg.trim().split("\n").pop()}`);
  }
}
if (problems.length) stop(problems);

// 3d. latest Instagram posts (only when the feed links are given, as on GitHub)
if (process.env.INSTAGRAM_FEED_MAIN || process.env.INSTAGRAM_FEED_SCHOOL) {
  try { execFileSync(process.execPath, [path.join(STAGE, "export-tools/instagram-feeds.mjs")], { cwd: STAGE, stdio: "inherit" }); }
  catch { log("Instagram: kept the previous posts"); }
}

// 4. build exactly as the developer's build does
let sha = process.env.COMMIT_REF || process.env.GITHUB_SHA;
if (!sha) try { sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: SITE }).toString().trim(); } catch { sha = "0000000-webupdate"; }
execFileSync(process.execPath, [path.join(STAGE, "export-tools/build-site.mjs"), ...(TEST ? ["--test"] : [])], { cwd: STAGE, stdio: "inherit", env: { ...process.env, COMMIT_REF: sha } });
fs.renameSync(path.join(STAGE, "dist"), path.join(OUT, "site"));
// a preview is opened again and again: give its page links a build number so the browser never
// shows a remembered (older) copy of a page (GitHub Pages lets browsers keep pages for 10 minutes)
if (TEST) {
  const stamp = Date.now().toString(36);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(path.join(OUT, "site")).filter((f) => f.endsWith(".html"))) {
    const html = fs.readFileSync(f, "utf8");
    const out = html.replace(/href="((?:\.\.\/)?[a-z0-9-]+\.html)(#[^"]*)?"/gi, (m, page, hash = "") => `href="${page}?p=${stamp}${hash}"`);
    if (out !== html) fs.writeFileSync(f, out);
  }
}
// the record of what is live: the Sheet's content, plus anything the developer added to the pages
// that the Sheet does not have yet (so the next "Set up the Sheet" shows it)
fs.writeFileSync(path.join(OUT, "content.json"), JSON.stringify(mergeContent(content, readSite(SITE)), null, 1));

// 5. change page
if (base) {
  const before = {}, after = {};
  for (const p of PAGES) {
    after[p] = fs.readFileSync(path.join(OUT, "site", `${p}.html`), "utf8");
    before[p] = base.pages?.[p] ? apply(p, TEMPLATES[p], base.pages[p], { today }).src : TEMPLATES[p];
  }
  const html = reviewPage({ base, content, before, after });
  fs.mkdirSync(path.join(OUT, "site/review"), { recursive: true });
  fs.writeFileSync(path.join(OUT, "site/review/index.html"), html.page);
  fs.writeFileSync(path.join(OUT, "changes.json"), JSON.stringify(html.summary, null, 1));
  log(`change page: ${html.summary.length} change(s)`);
}
fs.rmSync(STAGE, { recursive: true, force: true });
log(`\nBuilt: ${path.join(OUT, "site")}`);
