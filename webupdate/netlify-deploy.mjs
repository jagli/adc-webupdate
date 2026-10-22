#!/usr/bin/env node
/**
 * Upload a finished site folder to Netlify as the live abhinava.dance (no build on Netlify).
 *   NETLIFY_AUTH_TOKEN=… NETLIFY_SITE_ID=… node webupdate/netlify-deploy.mjs out/site "message"
 * Prints the deploy id and waits until Netlify says it is live. Exit 2 = keys not set (skipped).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const [dir, message = "Website update"] = process.argv.slice(2);
const token = process.env.NETLIFY_AUTH_TOKEN, site = process.env.NETLIFY_SITE_ID;
if (!token || !site) { console.log("Netlify keys are not set yet — nothing was uploaded."); process.exit(2); }
const zip = path.join(os.tmpdir(), `site-${Date.now()}.zip`);
execFileSync("zip", ["-qr", "-X", zip, "."], { cwd: path.resolve(dir) });
const api = (p, opts = {}) => fetch(`https://api.netlify.com/api/v1${p}`, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
const res = await api(`/sites/${site}/deploys?title=${encodeURIComponent(message)}`, { method: "POST", headers: { "Content-Type": "application/zip" }, body: fs.readFileSync(zip) });
if (!res.ok) { console.error(`Netlify refused the upload: ${res.status} ${await res.text()}`); process.exit(1); }
const deploy = await res.json();
console.log(`deploy ${deploy.id} uploaded`);
for (let i = 0; i < 60; i++) {
  const d = await (await api(`/deploys/${deploy.id}`)).json();
  if (d.state === "ready") { console.log(`live: ${d.ssl_url || d.url}`); fs.writeFileSync(path.join(path.resolve(dir), "..", "netlify-deploy.json"), JSON.stringify({ id: d.id, url: d.ssl_url || d.url })); process.exit(0); }
  if (d.state === "error") { console.error(`Netlify error: ${d.error_message}`); process.exit(1); }
  await new Promise((r) => setTimeout(r, 5000));
}
console.error("Netlify took too long"); process.exit(1);
