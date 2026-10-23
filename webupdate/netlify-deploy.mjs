#!/usr/bin/env node
/**
 * Upload a finished site folder to Netlify as the live abhinava.dance (no build on Netlify).
 *   NETLIFY_AUTH_TOKEN=… NETLIFY_SITE_ID=… node webupdate/netlify-deploy.mjs out/site "message"
 *
 * Sends Netlify the fingerprint (sha1) of every file and uploads only the ones it does not have.
 * Downloads from Drive (PDFs, zips: assets/web/content/files/) are not kept in git. Git keeps only
 * their fingerprints, in content/netlify-files.json (webupdate/netlify-record.mjs, after a publish).
 * A rebuild that refers to one it does not have (Undo) includes it by fingerprint; Netlify still has it.
 *
 * Prints the deploy id and waits until Netlify says it is live. Exit 2 = keys not set (skipped).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { netlifyApi, sha1File, listFiles, waitReady, netlifyOnlyFiles } from "./engine/netlify.mjs";

const [dir, message = "Website update"] = process.argv.slice(2);
const token = process.env.NETLIFY_AUTH_TOKEN, site = process.env.NETLIFY_SITE_ID;
if (!token || !site) { console.log("Netlify keys are not set yet — nothing was uploaded."); process.exit(2); }
const api = netlifyApi(token);
const root = path.resolve(dir);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const files = {}; // "/path" → sha1
const local = {}; // sha1 → file on disk
for (const rel of listFiles(root)) {
  const sha = sha1File(path.join(root, rel));
  files[`/${rel}`] = sha;
  local[sha] = path.join(root, rel);
}
const text = Object.keys(files).filter((p) => /\.(html|js|css)$/.test(p)).map((p) => fs.readFileSync(path.join(root, p))).join("\n");
for (const [p, f] of Object.entries(netlifyOnlyFiles(repo))) if (!files[p] && text.includes(p.slice(1))) files[p] = f.sha1;

const res = await api(`/sites/${site}/deploys`, { method: "POST", json: { files, title: message } });
if (!res.ok) { console.error(`Netlify refused the deploy: ${res.status} ${await res.text()}`); process.exit(1); }
const deploy = await res.json();
console.log(`deploy ${deploy.id}: ${Object.keys(files).length} files, ${(deploy.required || []).length} to upload`);

const byPath = Object.fromEntries(Object.entries(files).map(([p, s]) => [s, p]));
for (const sha of deploy.required || []) {
  if (!local[sha]) {
    console.error(`Netlify no longer has ${byPath[sha]} (kept on Netlify only). Put the file back on Drive and paste its link in the Sheet again.`);
    process.exit(1);
  }
  const up = await api(`/deploys/${deploy.id}/files${encodeURI(byPath[sha])}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: fs.readFileSync(local[sha]) });
  if (!up.ok) { console.error(`Upload of ${byPath[sha]} failed: ${up.status} ${await up.text()}`); process.exit(1); }
}

const d = await waitReady(api, deploy.id);
console.log(`live: ${d.ssl_url || d.url}`);
fs.writeFileSync(path.join(root, "..", "netlify-deploy.json"), JSON.stringify({ id: d.id, url: d.ssl_url || d.url }));
