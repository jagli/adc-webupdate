#!/usr/bin/env node
/** Write content.json from the site as it is now: node webupdate/seed.mjs [out.json] */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSite } from "./engine/site.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] || path.join(ROOT, "webupdate/content/live.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(readSite(ROOT), null, 1) + "\n");
console.log(`wrote ${path.relative(process.cwd(), out)}`);
