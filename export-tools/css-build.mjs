#!/usr/bin/env node
/**
 * Join the parts in css/sections/ into css/sections.css, the one stylesheet
 * the pages load. Edit the parts; never edit css/sections.css by hand.
 *
 * Dev-only. The parts are joined in file-name order, one blank line between
 * them, exactly as written: no rule is added, removed or reordered, so the joined file is plain CSS
 * that works with every tool deleted.
 *
 * Usage:
 *   node export-tools/css-build.mjs           write css/sections.css
 *   node export-tools/css-build.mjs --check   exit 1 if css/sections.css is not the join of its parts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Stylesheets made of parts: the joined file, and the folder of its parts. */
export const JOINED = [{ file: "css/sections.css", parts: "css/sections" }];

export function partsOf(entry) {
  const dir = path.join(ROOT, entry.parts);
  return fs.readdirSync(dir).filter((f) => f.endsWith(".css")).sort().map((f) => path.join(entry.parts, f));
}

export function join(entry) {
  return partsOf(entry).map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const entry of JOINED) {
    const joined = join(entry);
    const target = path.join(ROOT, entry.file);
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
    if (joined === current) {
      if (!check) console.log(`${entry.file} is up to date (${partsOf(entry).length} parts)`);
      continue;
    }
    if (check) {
      console.error(`${entry.file} is not the join of ${entry.parts}/ — edit the parts, then run npm run css:build`);
      stale += 1;
    } else {
      fs.writeFileSync(target, joined);
      console.log(`wrote ${entry.file} from ${partsOf(entry).length} parts in ${entry.parts}/`);
    }
  }
  process.exit(stale ? 1 : 0);
}
