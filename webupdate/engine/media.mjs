/**
 * Photos, PDFs and videos pasted into the Sheet as links.
 *
 *   Google Drive file link   → downloaded, turned upright, resized for the web (1600 px + a small
 *                              preview), saved in assets/web/content/ and the cell points there.
 *                              A PDF is copied as it is into assets/web/content/files/.
 *   Google Drive folder link → (photo lists and the gallery) every photo in it, in file-name order.
 *                              The folder's file list comes with the content from the Sheet
 *                              (the Sheet's script reads it), so no Google key is needed here.
 *   YouTube link             → checked; the site already plays YouTube videos on click.
 *
 * Files must be shared "Anyone with the link". A link that cannot be read stops the build with the
 * tab and row, and the live site stays as it is.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const driveId = (s) => {
  const v = String(s || "");
  if (!/drive\.google\.com|docs\.google\.com/.test(v)) return null;
  return (v.match(/\/d\/([\w-]{20,})/) || v.match(/[?&]id=([\w-]{20,})/) || v.match(/folders\/([\w-]{20,})/) || [])[1] || null;
};
export const isDriveFolder = (s) => /drive\.google\.com\/drive\/(u\/\d+\/)?folders\//.test(String(s || ""));
export const youtubeId = (u) => (String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/) || [])[1] || null;

const slug = (s) => String(s).toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "file";
export const captionFromName = (name) => String(name).replace(/\.[a-z0-9]+$/i, "").replace(/^\d+[\s._-]*/, "").replace(/[_-]+/g, " ").trim();

async function download(id) {
  const url = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  const res = await fetch(url, { redirect: "follow" });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || type.includes("text/html")) throw new Error("could not be opened — share it as “Anyone with the link”");
  return { buf: Buffer.from(await res.arrayBuffer()), type };
}

/**
 * Resolve every Drive link in content.json inside `stage` (the copied site).
 * `where(ref)` gives a plain description (tab › section › row) for messages.
 */
export async function resolveMedia(content, stage, { cache, log = () => {} } = {}) {
  const sharp = (await import("sharp")).default;
  const problems = [];
  const drive = content.drive || {};
  const outDir = path.join(stage, "assets/web/content");
  const thumbDir = path.join(stage, "assets/web/thumbs/content");
  const fileDir = path.join(outDir, "files");
  for (const d of [outDir, thumbDir, fileDir, cache].filter(Boolean)) fs.mkdirSync(d, { recursive: true });
  const done = new Map();

  async function fetchFile(id, name, kind, where) {
    const key = `${id}:${drive[id]?.modified || ""}:${kind}`;
    if (done.has(key)) return done.get(key);
    const hash = crypto.createHash("sha1").update(key).digest("hex").slice(0, 8);
    const label = slug(name || drive[id]?.name || id);
    let rel;
    try {
      const cached = cache && path.join(cache, hash);
      let buf, type;
      if (cached && fs.existsSync(cached)) { buf = fs.readFileSync(cached); type = fs.readFileSync(cached + ".type", "utf8"); }
      else {
        ({ buf, type } = await download(id));
        if (cached) { fs.writeFileSync(cached, buf); fs.writeFileSync(cached + ".type", type); }
      }
      if (kind !== "file" && /^video\//.test(type)) throw new Error("is a video — put videos on YouTube and paste the YouTube link");
      if (type.includes("pdf") || kind === "file") {
        const ext = type.includes("pdf") ? "pdf" : type.includes("zip") ? "zip" : (drive[id]?.name || "").split(".").pop() || "bin";
        rel = `assets/web/content/files/${label}-${hash}.${ext}`;
        fs.writeFileSync(path.join(stage, rel), buf);
      } else {
        rel = `assets/web/content/${label}-${hash}.jpg`;
        const img = sharp(buf, { failOn: "none" }).rotate();
        await img.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(stage, rel));
        await img.clone().resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 70, mozjpeg: true }).toFile(path.join(thumbDir, path.basename(rel)));
      }
      log(`  media: ${where} → ${rel}`);
    } catch (e) {
      const m = String(e.message);
      const why = m.includes("share") || m.includes("YouTube") ? m
        : /unsupported image format|heif|heic/i.test(m) ? "is a photo type the website cannot use (iPhone HEIC?) — save it as JPG and share that"
        : `could not be used (${m})`;
      problems.push(`${where}: the Drive link ${why}`);
      rel = null;
    }
    done.set(key, rel);
    return rel;
  }

  async function fix(value, where, kind = "photo") {
    const id = driveId(value);
    if (!id) return value;
    if (isDriveFolder(value)) { problems.push(`${where}: a folder link was pasted where one file is expected — open the folder and copy the link of one file`); return value; }
    return (await fetchFile(id, drive[id]?.name, kind, where)) ?? value;
  }

  function folderFiles(link, where) {
    const id = driveId(link);
    const f = drive[id];
    if (!f || !f.files) { problems.push(`${where}: the folder could not be read — share it as “Anyone with the link”, then press Update preview again`); return []; }
    const photos = f.files.filter((x) => /^image\//.test(x.mimeType)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!photos.length) problems.push(`${where}: the folder has no photos`);
    return photos;
  }

  /** A photos cell: one photo/video per line; a Drive folder link becomes all its photos. */
  async function fixLines(value, where) {
    const out = [];
    for (const line of String(value || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
      if (isDriveFolder(line)) {
        for (const f of folderFiles(line, where)) { const rel = await fetchFile(f.id, f.name, "photo", `${where} › ${f.name}`); if (rel) out.push(rel); }
      } else if (youtubeId(line)) out.push(line);
      else out.push(await fix(line, where));
    }
    return out.join("\n");
  }

  for (const [page, pd] of Object.entries(content.pages || {})) {
    for (const b of pd.blocks) {
      const at = (x) => `${content.pageNames?.[page] || page} › ${b.label}${x ? ` › ${x}` : ""}`;
      for (const s of b.slots) {
        if (s.kind === "photo") s.value = await fix(s.value, at(s.what));
        if (s.kind === "photos") s.value = await fixLines(s.value, at(s.what));
        if (s.kind === "video" && s.value && !youtubeId(s.value)) problems.push(`${at(s.what)}: "${s.value}" is not a YouTube link`);
        if (s.href) s.href = await fix(s.href, at(`${s.what} link`), "file");
      }
      for (const l of b.lists) {
        if (l.folder) {
          const files = folderFiles(l.folder, at(`${l.what} (folder link)`));
          const photoCol = l.columns.find((c) => c.kind === "photo")?.what || "Photo";
          const tpl = l.rows[0]?.cells || {};
          l.rows = [];
          for (const f of files) {
            const rel = await fetchFile(f.id, f.name, "photo", at(f.name));
            if (rel) l.rows.push({ key: `folder-${f.id}`, show: true, cells: { ...Object.fromEntries(Object.keys(tpl).map((k) => [k, ""])), [photoCol]: rel, [`${photoCol} description`]: captionFromName(f.name) } });
          }
        }
        for (const [i, r] of l.rows.entries()) {
          for (const c of l.columns) {
            const v = r.cells?.[c.what];
            const where = at(`${l.what}, row ${i + 1}, ${c.what}`);
            if (c.kind === "photo" && v) r.cells[c.what] = await fix(v, where);
            if (c.kind === "photos" && v) r.cells[c.what] = await fixLines(v, where);
            if (c.kind === "href" && v) r.cells[c.what] = await fix(v, where, "file");
            if (c.kind === "video" && v && !youtubeId(v)) problems.push(`${where}: "${v}" is not a YouTube link`);
            if (c.link && r.cells[`${c.what} link`]) r.cells[`${c.what} link`] = await fix(r.cells[`${c.what} link`], where, "file");
          }
        }
      }
      if (b.gallery) {
        if (b.gallery.folder) {
          for (const f of folderFiles(b.gallery.folder, at("Gallery folder link"))) {
            const rel = await fetchFile(f.id, f.name, "photo", at(f.name));
            if (rel) b.gallery.rows.push({ show: true, type: "image", src: rel, shape: "wide", caption: captionFromName(f.name) });
          }
        }
        for (const [i, g] of b.gallery.rows.entries()) {
          if (g.type === "video") { if (!youtubeId(g.src)) problems.push(at(`row ${i + 1}: "${g.src}" is not a YouTube link`)); else g.src = `https://www.youtube.com/embed/${youtubeId(g.src)}`; }
          else g.src = await fix(g.src, at(`row ${i + 1}`));
        }
      }
    }
  }
  for (const [i, p] of (content.productions || []).entries()) {
    if (p.Poster) p.Poster = await fix(p.Poster, `Productions › row ${i + 1} (${p.Production}) › Poster`);
  }
  return problems;
}
