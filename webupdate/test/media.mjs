// Proof 6: Drive links are fetched, turned upright, resized and pointed at; folders expand in
// file-name order; unshared links, videos and HEIC photos give plain messages. (Drive simulated.)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMedia } from "../engine/media.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const photo = fs.readFileSync(path.join(HERE, "../../assets/web/hero/performances.jpg"));
const files = { A1111111111111111111111111: ["image/jpeg", photo], B2222222222222222222222222: ["image/jpeg", photo], C3333333333333333333333333: ["image/jpeg", photo], V4444444444444444444444444: ["video/mp4", Buffer.from("x")], H5555555555555555555555555: ["image/heic", Buffer.from("not an image")] };
globalThis.fetch = async (url) => {
  const id = new URL(url).searchParams.get("id");
  if (!files[id]) return { ok: true, headers: { get: () => "text/html" }, arrayBuffer: async () => new ArrayBuffer(0) }; // Drive's sign-in page
  return { ok: true, headers: { get: () => files[id][0] }, arrayBuffer: async () => files[id][1] };
};
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "wu-media-"));
const link = (id) => `https://drive.google.com/file/d/${id}/view?usp=sharing`;
const content = {
  drive: { F6666666666666666666666666: { name: "Folder", files: [{ id: "B2222222222222222222222222", name: "10-second.jpg", mimeType: "image/jpeg" }, { id: "A1111111111111111111111111", name: "02-first.jpg", mimeType: "image/jpeg" }, { id: "C3333333333333333333333333", name: "notes.txt", mimeType: "text/plain" }] } },
  pages: { x: { blocks: [{ label: "Test", slots: [
    { kind: "photo", what: "Photo", value: link("A1111111111111111111111111") },
    { kind: "photos", what: "Photos", value: "https://drive.google.com/drive/folders/F6666666666666666666666666" },
    { kind: "photo", what: "Not shared", value: link("Z9999999999999999999999999") },
    { kind: "photo", what: "A video", value: link("V4444444444444444444444444") },
    { kind: "photo", what: "HEIC", value: link("H5555555555555555555555555") },
  ], lists: [] }] } },
};
const problems = await resolveMedia(content, stage, { cache: path.join(stage, ".cache") });
const s = content.pages.x.blocks[0].slots;
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) fails++; };
ok(/^assets\/web\/content\/.+\.jpg$/.test(s[0].value) && fs.existsSync(path.join(stage, s[0].value)), `photo fetched → ${s[0].value}`);
ok(fs.existsSync(path.join(stage, "assets/web/thumbs/content", path.basename(s[0].value))), "small preview made");
const lines = s[1].value.split("\n");
ok(lines.length === 2 && lines[0] === s[0].value && /second/.test(lines[1]), `folder → 2 photos in file-name order, text file skipped (${lines.map((l) => path.basename(l)).join(", ")})`);
ok(problems.some((p) => /Not shared.*Anyone with the link/.test(p)), "unshared link: plain message");
ok(problems.some((p) => /A video.*YouTube/.test(p)), "video in a photo cell: plain message");
ok(problems.some((p) => /HEIC.*JPG/.test(p)), "HEIC photo: plain message");
const meta = await (await import("sharp")).default(path.join(stage, s[0].value)).metadata();
ok(meta.width <= 1600 && meta.height <= 1600, `resized for the web (${meta.width}×${meta.height})`);
for (const p of problems) console.log("   message:", p);
process.exit(fails ? 1 : 0);
