#!/usr/bin/env node
/**
 * After a publish: note the fingerprint of every download from Drive (assets/web/content/files/) in
 * content/netlify-files.json, so git keeps only this information and never the files themselves.
 *   node webupdate/netlify-record.mjs out/site
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha1File, listFiles, netlifyOnlyFiles, NETLIFY_ONLY } from "./engine/netlify.mjs";

const root = path.resolve(process.argv[2] || "");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = "assets/web/content/files";
const kept = netlifyOnlyFiles(repo);
let added = 0;
if (fs.existsSync(path.join(root, dir))) {
  for (const rel of listFiles(path.join(root, dir))) {
    const file = path.join(root, dir, rel), key = `/${dir}/${rel}`, sha1 = sha1File(file);
    if (kept[key]?.sha1 === sha1) continue;
    kept[key] = { sha1, bytes: fs.statSync(file).size, added: new Date().toISOString().slice(0, 10) };
    added++;
  }
}
fs.writeFileSync(path.join(repo, NETLIFY_ONLY), JSON.stringify(kept, null, 1) + "\n");
console.log(`${added} download(s) noted in ${NETLIFY_ONLY}; the files themselves stay on Netlify only.`);
