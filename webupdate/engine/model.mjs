/**
 * The content model: what an editor can change on each page, read straight from the page itself.
 *
 *   extract(page, src)  → blocks (one per section of the page) holding
 *                          slots  — single texts, photos and videos
 *                          lists  — repeating things (cards, list items, portraits, videos…) as rows
 *   apply(page, src, edited) → the page with the edited content, changing only what differs.
 *
 * Nothing is hand-listed per page: the reader recognises the site's own patterns, so a new section
 * added by the developer appears in the Sheet the next time the layout is refreshed.
 */
import { parse, walk, select, inner, classes, splice } from "./html.mjs";
import { toLight, toHtml, normalise, INLINE, escapeAttr, decode } from "./light.mjs";

/** Parts of a page that are not edited here (made by the site itself, or edited in their own tab). */
const SKIP = "nav, .v-chapter__nav, .alt-next, .instagram-section, .s-prod-grid, script, style, svg, [data-production], .v-hero__shade, [aria-hidden=true]";

/** Containers that are always lists, even with a single item, so editors can add more. */
const KNOWN_LISTS = ".s-cards, .client-portrait-grid, .s-video-grid, .s-video-wall, .s-timeline, .v-stats, .alt-pillars, .alt-partners__grid, .s-voices, .s-downloads, .s-quotes, .alt-hscroll, ul, ol";

/** Extra rules for particular lists (by list key). */
export const LIST_RULES = {
  "performances/upcoming-list/1": { sort: "date", pastHidden: true, note: "One event per row. Start with the date in bold, e.g. **8 Jan 2027** — what, where. The site puts them in date order and hides past dates by itself." },
};

const slug = (s) => normalise(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

function textOf(src, el) {
  return toLight(inner(src, el)).replace(/\*\*|\*|\[|\]\([^)]*\)/g, "");
}

function hasText(src, el) {
  return /\S/.test(inner(src, el).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, ""));
}

function isLeaf(src, el) {
  if (INLINE.has(el.tag) && el.tag !== "a") return false;
  if (!hasText(src, el)) return false;
  for (const d of walk(el)) if (!INLINE.has(d.tag)) return false;
  return true;
}

function isSkipped(el, skipSet) {
  return skipSet.has(el);
}

/** Name shown in the Sheet's "What" column. */
export function whatOf(el) {
  const c = classes(el).join(" ");
  const t = el.tag;
  if (/eyebrow|v-label|__label|s-feature__label/.test(c)) return "Small heading";
  if (/v-hero__title/.test(c)) return "Page title";
  if (/v-micro/.test(c)) return "Line under the title";
  if (/__num/.test(c)) return "Number";
  if (/__name/.test(c)) return "Name";
  if (/__role/.test(c)) return "Role";
  if (/__quote/.test(c)) return "Quote";
  if (/__bio/.test(c)) return "About";
  if (/__cap/.test(c)) return "Caption";
  if (/__note/.test(c)) return "Note";
  if (/__meta/.test(c)) return "Details";
  if (/__title|__display/.test(c) || /^h[1-6]$/.test(t)) return t === "h2" || /s-section__title|alt-section-head__title/.test(c) ? "Heading" : "Title";
  if (t === "a") return "Button";
  if (t === "li") return "Item";
  return "Text";
}

const isTrack = (el) => classes(el).includes("s-mini__track");
const PHOTOS_WHAT = "Photos (one per line)";
/** A carousel's slides as lines: a photo's address, or a YouTube link for a video slide. */
function trackValue(el) {
  return el.children.map((c) => (c.tag === "img" ? bare(c.attrs.src) : decode(c.attrs.href || ""))).filter(Boolean).join("\n");
}

const isVideo = (el) => el.tag === "a" && ("data-video" in el.attrs || classes(el).includes("s-video"));

/** Fields inside one list item, in page order. */
function itemFields(src, item, skipSet) {
  const fields = [];
  const visit = (el) => {
    if (isSkipped(el, skipSet)) return;
    if (el !== item && isLeaf(src, el)) {
      fields.push({ kind: "text", what: whatOf(el), el, value: toLight(inner(src, el)), href: el.tag === "a" ? decode(el.attrs.href || "") : undefined });
      return;
    }
    if (el === item && isLeaf(src, el)) {
      fields.push({ kind: "text", what: whatOf(el), el, value: toLight(inner(src, el)), href: el.tag === "a" ? decode(el.attrs.href || "") : undefined });
      return;
    }
    if (isTrack(el)) {
      fields.push({ kind: "photos", what: PHOTOS_WHAT, el, value: trackValue(el) });
      return;
    }
    if (el !== item && (el.tag === "ul" || el.tag === "ol") && el.children.length && el.children.every((c) => c.tag === "li")) {
      fields.push({ kind: "lines", what: "List (one per line)", el, value: el.children.map((li) => toLight(inner(src, li))).join("\n") });
      return;
    }
    if (el.tag === "img") {
      fields.push({ kind: "photo", what: isVideo(el.parent) ? "Video picture" : "Photo", el, value: bare(el.attrs.src), alt: decode(el.attrs.alt || "") });
      return;
    }
    if (isVideo(el)) fields.push({ kind: "video", what: "Video link", el, value: decode(el.attrs.href || "") });
    for (const c of el.children) visit(c);
  };
  visit(item);
  // a whole item that is a link (a download tile, a card link) gets its address as a field
  if (item.tag === "a" && !isVideo(item) && !fields.some((f) => f.el === item)) fields.push({ kind: "href", what: "Link or file", el: item, value: decode(item.attrs.href || "") });
  // number repeated names: Text, Text 2, …
  const seen = {};
  for (const f of fields) {
    seen[f.what] = (seen[f.what] || 0) + 1;
    if (seen[f.what] > 1) f.what = `${f.what} ${seen[f.what]}`;
  }
  return fields;
}

function listContainer(src, el, knownSet) {
  const kids = el.children.filter((c) => c.tag !== "#text");
  if (!kids.length) return false;
  const sig = (c) => c.tag + "." + (classes(c)[0] || "");
  const same = kids.every((c) => sig(c) === sig(kids[0]));
  if (!same) return false;
  if (kids.length >= 2) return true;
  return knownSet.has(el);
}

/**
 * Read a page. Returns { page, blocks: [{ key, label, slots, lists }] } where slots/lists keep
 * references to the elements so apply() can write back.
 */
export function extract(page, src) {
  const root = parse(src);
  const main = select(root, "main")[0];
  if (!main) throw new Error(`${page}: no <main> found`);
  const skipSet = new Set();
  for (const el of select(main, SKIP)) { skipSet.add(el); for (const d of walk(el)) skipSet.add(d); }
  const knownSet = new Set(select(main, KNOWN_LISTS));
  const blocks = [];
  let n = 0;
  for (const top of main.children) {
    n++;
    if (isSkipped(top, skipSet)) continue;
    const heading = select(top, "h1, h2")[0];
    const eyebrow = select(top, ".s-section__eyebrow, .v-label, .alt-section-head__eyebrow")[0];
    const label = heading ? textOf(src, heading)
      : select(top, "[data-gallery]").length ? "Gallery"
      : eyebrow ? textOf(src, eyebrow)
      : top.attrs.id ? top.attrs.id.replace(/-/g, " ") : `Part ${n}`;
    let key = `${page}/${top.attrs.id || slug(label) || `part-${n}`}`;
    if (blocks.some((b) => b.key === key)) key = `${key}-${n}`; // two sections may share a name; keys must not
    const block = { key, label, el: top, slots: [], lists: [], gallery: null };
    let si = 0, li = 0;
    const visit = (el) => {
      if (isSkipped(el, skipSet)) return;
      if ("data-gallery" in el.attrs) {
        block.gallery = { key: `${key}/gallery`, el, rows: JSON.parse(decode(el.attrs["data-gallery"])) };
        return;
      }
      if (isTrack(el)) {
        block.slots.push({ key: `${key}/t${++si}`, kind: "photos", what: PHOTOS_WHAT, el, value: trackValue(el) });
        return;
      }
      if (el !== top && listContainer(src, el, knownSet)) {
        const items = el.children;
        const rows = items.map((item, i) => ({ key: `${key}/${li + 1}/${i + 1}`, el: item, fields: itemFields(src, item, skipSet) }));
        if (rows.some((r) => r.fields.length)) {
          li++;
          const lkey = `${key}/${li}`;
          for (const r of rows) r.key = `${lkey}/${rows.indexOf(r) + 1}`;
          block.lists.push({ key: lkey, el, rows, what: listName(el, rows[0]), rule: LIST_RULES[lkey] });
          return;
        }
      }
      if (isLeaf(src, el)) {
        block.slots.push({ key: `${key}/t${++si}`, kind: "text", what: whatOf(el), el, value: toLight(inner(src, el)), href: el.tag === "a" ? decode(el.attrs.href || "") : undefined });
        return;
      }
      if (el.tag === "img") {
        const what = isVideo(el.parent) ? "Video picture" : classes(el.parent).includes("v-hero__media") ? "Top photo" : "Photo";
        block.slots.push({ key: `${key}/t${++si}`, kind: "photo", what, el, value: bare(el.attrs.src), alt: decode(el.attrs.alt || "") });
        return;
      }
      if (isVideo(el)) block.slots.push({ key: `${key}/t${++si}`, kind: "video", what: "Video link", el, value: decode(el.attrs.href || "") });
      for (const c of el.children) visit(c);
    };
    visit(top);
    if (block.slots.length || block.lists.length || block.gallery) blocks.push(block);
  }
  return { page, blocks };
}

function listName(el, first) {
  const c = classes(el).join(" ");
  if (el.tag === "ul" || el.tag === "ol") return "List";
  if (/s-cards/.test(c)) return "Cards";
  if (/portrait/.test(c)) return "People";
  if (/video/.test(c)) return "Videos";
  if (/timeline/.test(c)) return "Timeline";
  if (/stats/.test(c)) return "Numbers";
  if (/pillars/.test(c)) return "Pillars";
  if (/partners/.test(c)) return "Partners";
  if (/voices|quotes/.test(c)) return "Quotes";
  if (/downloads/.test(c)) return "Downloads";
  if (/mini__track|hscroll/.test(c)) return "Photos";
  if (first && first.el.tag === "p") return "Paragraphs";
  return "Items";
}

/** Columns of a list: the union of field names, in first-seen order. */
export function columnsOf(list) {
  const cols = [];
  for (const r of list.rows) for (const f of r.fields) {
    if (!cols.find((c) => c.what === f.what)) cols.push({ what: f.what, kind: f.kind, link: f.href !== undefined });
  }
  return cols;
}

/** Plain data for the Sheet (no element references). */
export function toData(model) {
  return {
    page: model.page,
    blocks: model.blocks.map((b) => ({
      key: b.key,
      label: b.label,
      slots: b.slots.map((s) => ({ key: s.key, kind: s.kind, what: s.what, value: s.value, ...(s.alt !== undefined && { alt: s.alt }), ...(s.href !== undefined && { href: s.href }) })),
      lists: b.lists.map((l) => ({
        key: l.key,
        what: l.what,
        ...(l.rule?.note && { note: l.rule.note }),
        columns: columnsOf(l),
        rows: l.rows.map((r) => ({ key: r.key, show: true, cells: Object.fromEntries(r.fields.flatMap((f) => [[f.what, f.value], ...(f.alt !== undefined ? [[`${f.what} description`, f.alt]] : []), ...(f.href !== undefined ? [[`${f.what} link`, f.href]] : [])])) })),
      })),
      ...(b.gallery && { gallery: { key: b.gallery.key, rows: b.gallery.rows.map((g) => ({ show: true, ...g })) } }),
    })),
  };
}

/* ── writing back ───────────────────────────────────────────────────────── */

/** A picture's address without the site's cache number ("…jpg?v=285"): the page keeps its own. */
export const bare = (u) => String(u || "").replace(/\?v=\d+$/, "");

function setAttr(openTag, name, value) {
  const re = new RegExp(`(\\s${name}\\s*=\\s*)("[^"]*"|'[^']*'|[^\\s>]+)`, "i");
  const v = `"${escapeAttr(value)}"`;
  if (re.test(openTag)) return openTag.replace(re, `$1${v}`);
  return openTag.replace(/\s*\/?>$/, (m) => ` ${name}=${v}${m}`);
}

const youtubeId = (u) => (String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/) || [])[1];

/** Edits (relative to `base`) that put one field's new value into the source. */
function fieldEdits(src, f, cell, base = 0) {
  const edits = [];
  const el = f.el;
  if (f.kind === "text") {
    const now = inner(src, el);
    const html = toHtml(cell.value, now);
    if (html !== now) edits.push([el.openEnd - base, el.closeStart - base, html]);
    if (cell.href !== undefined && cell.href !== decode(el.attrs.href || "")) {
      const open = src.slice(el.start, el.openEnd);
      edits.push([el.start - base, el.openEnd - base, setAttr(open, "href", cell.href)]);
    }
  } else if (f.kind === "photos") {
    const now = trackValue(el);
    if (!normalise(cell.value)) return edits; // an emptied carousel keeps its photos (the checks report it)
    if (normalise(cell.value) !== normalise(now)) {
      const slides = el.children;
      const imgTpl = slides.find((c) => c.tag === "img");
      const vidTpl = slides.find((c) => c.tag === "a");
      const sep = slides.length > 1 ? src.slice(slides[0].end, slides[1].start) : "\n";
      const byValue = new Map(slides.map((c) => [c.tag === "img" ? bare(c.attrs.src) : decode(c.attrs.href || ""), c]));
      const lines = normalise(cell.value).split("\n").map((x) => x.trim()).filter(Boolean);
      const out = lines.map((line) => {
        const same = byValue.get(bare(line));
        if (same) return src.slice(same.start, same.end);
        const yt = (line.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/) || [])[1];
        if (yt) {
          if (vidTpl) {
            let html = src.slice(vidTpl.start, vidTpl.end);
            html = html.replace(/(<a\b[^>]*?\shref=")[^"]*(")/, `$1${escapeAttr(line)}$2`).replace(/(<img\b[^>]*?\ssrc=")[^"]*(")/, `$1https://img.youtube.com/vi/${yt}/hqdefault.jpg$2`);
            return html;
          }
          return `<a class="s-mini__slide s-pop__video" href="${escapeAttr(line)}" target="_blank" rel="noopener" data-video data-video-title="Video"><img src="https://img.youtube.com/vi/${yt}/hqdefault.jpg" alt="Play video" loading="lazy"><span class="s-video__play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></a>`;
        }
        const tpl = imgTpl ? src.slice(imgTpl.start, imgTpl.end) : '<img class="s-mini__slide" src="" alt="" loading="lazy">';
        const alt = line.split("/").pop().replace(/\.[a-z0-9]+$/i, "").replace(/^\d+[\s._-]*/, "").replace(/[-_]+/g, " ");
        return setAttr(setAttr(tpl, "src", line), "alt", imgTpl ? decode(imgTpl.attrs.alt || alt) : alt);
      });
      edits.push([slides[0].start - base, slides[slides.length - 1].end - base, out.join(sep)]);
    }
  } else if (f.kind === "href") {
    if (cell.value && cell.value !== decode(el.attrs.href || "")) {
      const open = src.slice(el.start, el.openEnd);
      edits.push([el.start - base, el.openEnd - base, setAttr(open, "href", cell.value)]);
    }
  } else if (f.kind === "lines") {
    const lis = el.children;
    const now = lis.map((li) => toLight(inner(src, li))).join("\n");
    if (normalise(cell.value) !== normalise(now)) {
      const sep = lis.length > 1 ? src.slice(lis[0].end, lis[1].start) : "";
      const tpl = src.slice(lis[0].start, lis[0].openEnd);
      const html = normalise(cell.value).split("\n").filter(Boolean).map((line, i) => (lis[i] ? src.slice(lis[i].start, lis[i].openEnd) : tpl) + toHtml(line, lis[i] ? inner(src, lis[i]) : undefined) + "</li>").join(sep);
      edits.push([lis[0].start - base, lis[lis.length - 1].end - base, html]);
    }
  } else if (f.kind === "photo") {
    let open = src.slice(el.start, el.openEnd);
    const before = open;
    if (cell.value && bare(cell.value) !== bare(el.attrs.src)) open = setAttr(open, "src", cell.value);
    if (cell.alt !== undefined && cell.alt !== decode(el.attrs.alt || "")) open = setAttr(open, "alt", cell.alt);
    if (open !== before) edits.push([el.start - base, el.openEnd - base, open]);
  } else if (f.kind === "video") {
    if (cell.value && cell.value !== decode(el.attrs.href || "")) {
      const open = src.slice(el.start, el.openEnd);
      edits.push([el.start - base, el.openEnd - base, setAttr(open, "href", cell.value)]);
      // a new video gets its own picture unless a photo was chosen for it
      const img = el.children.find((c) => c.tag === "img");
      const id = youtubeId(cell.value);
      if (img && id && !cell.keepPhoto) {
        const iopen = src.slice(img.start, img.openEnd);
        edits.push([img.start - base, img.openEnd - base, setAttr(iopen, "src", `https://img.youtube.com/vi/${id}/hqdefault.jpg`)]);
      }
    }
  }
  return edits;
}

/** One gallery entry in its standard form (videos have no shape). */
export function galleryRow(g) {
  const caption = g.caption ?? "";
  return g.type === "video" ? { type: "video", src: g.src, caption } : { type: "image", src: g.src, shape: g.shape === "tall" || g.shape === "slim" ? g.shape : "wide", caption };
}

/** Turn a Sheet row (cells by column name) into per-field values for one item's fields. */
function cellsFor(fields, cells) {
  return fields.map((f) => ({
    value: cells[f.what] ?? f.value,
    alt: f.kind === "photo" ? cells[`${f.what} description`] ?? f.alt : undefined,
    href: f.href !== undefined ? cells[`${f.what} link`] ?? f.href : undefined,
  }));
}

function eventDate(light) {
  const m = /\*\*([^*]+)\*\*/.exec(light) || [null, light];
  if (!/\b(19|20)\d\d\b/.test(m[1])) return null; // a date without a year would be read as long past
  const d = Date.parse(m[1].replace(/(\d+)(st|nd|rd|th)/, "$1"));
  return Number.isNaN(d) ? null : d;
}

/**
 * Write edited content into a page. `data` is the page's data as the Sheet holds it (toData shape).
 * Returns { src, problems } — problems are plain-English messages; when any exist the caller stops.
 */
export function apply(page, src, data, { today = Date.now() } = {}) {
  const model = extract(page, src);
  const problems = [];
  const edits = [];
  const byKey = new Map(data.blocks.map((b) => [b.key, b]));
  for (const block of model.blocks) {
    const d = byKey.get(block.key);
    if (!d) continue;
    const slotData = new Map(d.slots.map((s) => [s.key, s]));
    for (const s of block.slots) {
      const v = slotData.get(s.key);
      if (!v) continue;
      edits.push(...fieldEdits(src, s, { value: v.value, alt: v.alt, href: v.href }));
    }
    const listData = new Map(d.lists.map((l) => [l.key, l]));
    for (const l of block.lists) {
      const v = listData.get(l.key);
      if (!v) continue;
      let rows = v.rows.filter((r) => r.show !== false && Object.values(r.cells || {}).some((x) => normalise(x)));
      if (l.rule?.sort === "date") {
        rows = rows.map((r) => ({ r, d: eventDate(String(Object.values(r.cells)[0] || "")) }));
        for (const x of rows) if (x.d === null) problems.push(`${d.label} › ${v.what}: "${String(Object.values(x.r.cells)[0]).slice(0, 40)}" does not start with a date and year in bold, e.g. **8 Jan 2027**`);
        rows = rows.filter((x) => x.d !== null && (!l.rule.pastHidden || x.d >= today - 86400000)).sort((a, b) => a.d - b.d).map((x) => x.r);
      }
      const original = l.rows;
      const unchanged = rows.length === original.length && rows.every((r, i) => r.key === original[i].key) &&
        rows.every((r, i) => original[i].fields.every((f, j) => { const c = cellsFor(original[i].fields, r.cells)[j]; return normalise(c.value) === normalise(f.value) && (c.alt === undefined || c.alt === f.alt) && (c.href === undefined || c.href === f.href); }));
      if (unchanged) continue;
      const template = original[0];
      const first = original[0].el, last = original[original.length - 1].el;
      const sep = original.length > 1 ? src.slice(original[0].el.end, original[1].el.start) : "\n" + " ".repeat(Math.max(0, first.start - src.lastIndexOf("\n", first.start) - 1));
      const parts = rows.map((r, ri) => {
        const known = original.find((o) => o.key === r.key);
        const orig = known || template;
        if (!known) {
          for (const f of orig.fields) {
            const need = { photo: "photo (a Drive link)", photos: "photos (Drive links, one per line)", video: "YouTube link", href: "link or file" }[f.kind];
            if (need && !normalise(r.cells?.[f.what])) problems.push(`${d.label} › ${v.what}, new row ${ri + 1}: add the ${need} in “${f.what}”`);
          }
        }
        const piece = src.slice(orig.el.start, orig.el.end);
        const vals = cellsFor(orig.fields, r.cells);
        const e = orig.fields.flatMap((f, j) => fieldEdits(src, f, vals[j], orig.el.start));
        return splice(piece, e);
      });
      edits.push([first.start, last.end, parts.join(sep)]);
    }
    if (block.gallery && d.gallery) {
      const rows = d.gallery.rows.filter((g) => g.show !== false).map(galleryRow);
      const same = JSON.stringify(rows) === JSON.stringify(block.gallery.rows.map(galleryRow));
      if (!same) {
        const el = block.gallery.el;
        const json = "[\n" + rows.map((g) => "        " + JSON.stringify(g)).join(",\n") + "\n      ]";
        edits.push([el.start, el.openEnd, setAttr(src.slice(el.start, el.openEnd), "data-gallery", json).replace(/data-gallery="([^"]*)"/, (m, v) => `data-gallery='${decode(v).replace(/'/g, "&#39;")}'`)]);
      }
    }
  }
  // list rebuilds replace whole ranges; drop single-field edits that fall inside them
  const clean = [];
  for (const e of edits.sort((a, b) => a[0] - b[0])) {
    if (clean.length && e[0] < clean[clean.length - 1][1]) {
      const prev = clean[clean.length - 1];
      if (e[1] - e[0] > prev[1] - prev[0]) clean[clean.length - 1] = e;
      continue;
    }
    clean.push(e);
  }
  return { src: splice(src, clean), problems };
}
