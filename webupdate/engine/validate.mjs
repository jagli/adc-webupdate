/**
 * Checks on the Sheet's content before anything is built. Every message names the tab, the section
 * and the row, in plain words, and says what to do.
 */
import { youtubeId, driveId } from "./media.mjs";
import { normalise } from "./light.mjs";

const PAGE_NAMES = {
  index: "Home", about: "About", performances: "Performances", school: "School", activities: "Activities", store: "Store",
  support: "Support", contact: "Contact", research: "Research", testimonials: "Testimonials", credentials: "Credentials", gallery: "Gallery",
};

function markProblems(text) {
  const p = [];
  const t = String(text ?? "");
  if ((t.match(/\*\*/g) || []).length % 2) p.push("a ** is not closed (bold needs ** before and after the words)");
  if (/\[[^\]]*\]\s+\(/.test(t)) p.push("there is a space between ] and ( in a link — write [words](address)");
  for (const m of t.matchAll(/\[([^\]]+)\]\(([^)]*)\)/g)) {
    const href = m[2].trim();
    if (!href) p.push(`the link "${m[1]}" has no address`);
    else if (!/^(https?:\/\/|mailto:|tel:|#|[a-z0-9-]+\.html)/i.test(href)) p.push(`the link "${m[1]}" has an address that is not a web address: "${href}"`);
  }
  if (/<[a-z/][^>]*>/i.test(t)) p.push("it contains <…> code — write plain words; use **bold**, *italic* and [link](address) only");
  return p;
}

function photoLines(v) {
  const lines = String(v ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return ["is empty — keep at least one photo (one per line), or a Drive folder link"];
  return lines.filter((l) => !(/^assets\//.test(l) || driveId(l) || youtubeId(l) || /^https:\/\/img\.youtube\.com\//.test(l))).map((l) => `"${l.slice(0, 50)}" is not a Drive link, a YouTube link or a photo already on the site`);
}

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export function validate(content) {
  const out = [];
  if (!content || !content.pages) return ["The content from the Sheet is empty — press Update preview again."];
  // Global
  const g = content.global || {};
  if (g.email && !isEmail(g.email)) out.push(`Global › Email: "${g.email}" is not an email address`);
  if (g.schoolEmail && !isEmail(g.schoolEmail)) out.push(`Global › School email: "${g.schoolEmail}" is not an email address`);
  for (const k of ["instagram", "youtube", "schoolInstagram"]) if (g[k] && !/^https?:\/\//.test(g[k])) out.push(`Global › ${k}: "${g[k]}" must start with https://`);
  // Pages
  for (const [page, pd] of Object.entries(content.pages)) {
    const tab = PAGE_NAMES[page] || page;
    for (const b of pd.blocks || []) {
      for (const s of b.slots || []) {
        const at = `${tab} › ${b.label} › ${s.what}`;
        if (s.kind === "text") {
          if (!normalise(s.value)) out.push(`${at}: is empty — write the words, or ask the owner to remove this part`);
          for (const m of markProblems(s.value)) out.push(`${at}: ${m}`);
        }
        if (s.kind === "video" && s.value && !youtubeId(s.value)) out.push(`${at}: "${s.value}" is not a YouTube link`);
        if (s.kind === "photos") for (const m of photoLines(s.value)) out.push(`${at}: ${m}`);
        if (s.kind === "photo" && !s.value) out.push(`${at}: the photo cell is empty — paste a Drive link to a photo`);
        if (s.kind === "photo" && /^https?:/.test(s.value) && !driveId(s.value) && !/img\.youtube\.com/.test(s.value)) out.push(`${at}: photos must be Google Drive links ("${s.value.slice(0, 50)}")`);
      }
      for (const l of b.lists || []) {
        const shown = (l.rows || []).filter((r) => r.show !== false);
        if (!shown.length && !l.folder) out.push(`${tab} › ${b.label} › ${l.what}: every row is hidden — show at least one`);
        for (const [i, r] of (l.rows || []).entries()) {
          if (r.show === false) continue;
          const at = `${tab} › ${b.label} › ${l.what}, row ${i + 1}`;
          const filled = Object.values(r.cells || {}).some((v) => normalise(v));
          if (!filled) continue; // an empty row is simply ignored
          for (const c of l.columns || []) {
            const v = r.cells?.[c.what];
            if (c.kind === "text" || c.kind === "lines") for (const m of markProblems(v)) out.push(`${at} › ${c.what}: ${m}`);
            if (c.kind === "photos" && String(v ?? "").trim()) for (const m of photoLines(v)) out.push(`${at} › ${c.what}: ${m}`);
            if (c.kind === "video" && v && !youtubeId(v)) out.push(`${at} › ${c.what}: "${v}" is not a YouTube link`);
            if (c.kind === "photo" && v && /^https?:/.test(v) && !driveId(v) && !/img\.youtube\.com/.test(v)) out.push(`${at} › ${c.what}: photos must be Google Drive links`);
          }
        }
      }
      if (b.gallery) {
        for (const [i, r] of b.gallery.rows.entries()) {
          if (r.show === false) continue;
          const at = `${tab} › Gallery, row ${i + 1}`;
          if (!["image", "video"].includes(r.type)) out.push(`${at}: Type must be Photo or Video`);
          if (!r.src) out.push(`${at}: the link is empty`);
          if (r.type === "video" && r.src && !youtubeId(r.src)) out.push(`${at}: "${r.src}" is not a YouTube link`);
        }
      }
    }
  }
  // Productions
  const names = new Set();
  for (const [i, p] of (content.productions || []).entries()) {
    const at = `Productions › row ${i + 2}`;
    if (!p.Production) { if (Object.values(p).some((v) => normalise(v))) out.push(`${at}: the Production name is empty`); continue; }
    const k = p.Production.trim().toLowerCase();
    if (names.has(k)) out.push(`${at}: "${p.Production}" is listed twice`);
    names.add(k);
    if (p.Show && !/^(yes|no)$/i.test(p.Show)) out.push(`${at} (${p.Production}): Show must be Yes or No`);
    if (/^yes$/i.test(p.Show || "") && !p.Poster) out.push(`${at} (${p.Production}): shown productions need a Poster — paste a Drive link to the poster`);
  }
  return out;
}
