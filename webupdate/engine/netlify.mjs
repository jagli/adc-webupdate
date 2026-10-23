/**
 * Small helpers for the Netlify deploy API (file-fingerprint deploys).
 * Used by webupdate/netlify-deploy.mjs (every publish) and webupdate/netlify-add.mjs (big downloads).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const NETLIFY_ONLY = "content/netlify-files.json";

export function netlifyApi(token) {
  return (p, opts = {}) => {
    const { json, headers = {}, ...rest } = opts;
    return fetch(`https://api.netlify.com/api/v1${p}`, {
      ...rest,
      headers: { Authorization: `Bearer ${token}`, ...(json ? { "Content-Type": "application/json" } : {}), ...headers },
      ...(json ? { body: JSON.stringify(json) } : {}),
    });
  };
}

export function sha1File(file) {
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
}

/** Every file under root, as paths relative to it with forward slashes. */
export function listFiles(root, rel = "") {
  const out = [];
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (e.name === ".DS_Store") continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(root, r));
    else out.push(r);
  }
  return out;
}

/** The files kept on Netlify only: { "/assets/web/press/x.zip": { sha1, bytes, added } }. */
export function netlifyOnlyFiles(repo) {
  const f = path.join(repo, NETLIFY_ONLY);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
}

export async function waitReady(api, id) {
  for (let i = 0; i < 120; i++) {
    const d = await (await api(`/deploys/${id}`)).json();
    if (d.state === "ready") return d;
    if (d.state === "error") { console.error(`Netlify error: ${d.error_message}`); process.exit(1); }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.error("Netlify took too long"); process.exit(1);
}
