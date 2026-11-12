/**
 * Past Shows (Performances): the Upcoming Shows rows whose date has passed, newest first, as cards
 * between <!--past-shows--> and <!--/past-shows--> in the section [data-past-shows].
 * Switched off in the Sheet (Global ▸ Show Past Shows), or with no past shows, the section is hidden.
 * A show counts as past from the day after its date, exactly when Upcoming Shows drops it.
 */
import { eventDate } from "./model.mjs";
import { toHtml, escapeHtml, normalise } from "./light.mjs";

export const EVENTS_LIST = "performances/upcoming-list/1";

/** "**4 Nov 2026** — *Soorya Festival*: duets… · [Tickets](…)" → { date, name, details } */
export function splitEvent(light) {
  const s = normalise(light);
  const m = /^\*\*([^*]+)\*\*\s*[—–-]\s*([\s\S]*)$/.exec(s);
  if (!m) return { date: "", name: "", details: s };
  const rest = m[2].replace(/\s*·\s*\[Tickets\]\([^)\s]+\)\s*$/, "");
  const n = /^\*([^*]+)\*:?\s*([\s\S]*)$/.exec(rest);
  if (n) return { date: m[1].trim(), name: n[1].trim(), details: n[2].trim() };
  // no name in italics: the words before the first colon are the name
  const c = /^([^:]{1,80}):\s*([\s\S]*)$/.exec(rest);
  return c ? { date: m[1].trim(), name: c[1].trim(), details: c[2].trim() } : { date: m[1].trim(), name: rest.trim(), details: "" };
}

export function pastShows(content, today) {
  const blocks = content?.pages?.performances?.blocks || [];
  const list = blocks.flatMap((b) => b.lists || []).find((l) => l.key === EVENTS_LIST);
  if (!list) return [];
  return list.rows
    .filter((r) => r.show !== false)
    .map((r) => { const item = String(Object.values(r.cells || {})[0] || ""); return { item, d: eventDate(item) }; })
    .filter((x) => x.d !== null && x.d < today - 86400000)
    .sort((a, b) => b.d - a.d)
    .map((x) => splitEvent(x.item));
}

export function writePastShows(src, content, { today, on = true }) {
  const open = src.indexOf("<!--past-shows-->"), close = src.indexOf("<!--/past-shows-->");
  if (open < 0 || close < open) return src;
  const shows = on ? pastShows(content, today) : [];
  const line = src.lastIndexOf("\n", open);
  const indent = src.slice(line + 1, open);
  const cards = shows.map((s) =>
    `${indent}<li class="s-past__card"><span class="s-past__date">${escapeHtml(s.date)}</span><h3 class="s-past__title">${toHtml(s.name)}</h3>${s.details ? `<p class="s-past__text">${toHtml(s.details)}</p>` : ""}</li>`);
  let out = src.slice(0, open) + "<!--past-shows-->\n" + cards.join("\n") + (cards.length ? "\n" : "") + indent + src.slice(close);
  out = out.replace(/<span class="s-past__count">[^<]*<\/span>/, `<span class="s-past__count">${shows.length} ${shows.length === 1 ? "show" : "shows"}</span>`);
  out = out.replace(/<section([^>]*?)( hidden)?( data-past-shows)>/, (m, a, h, d) => `<section${a}${shows.length ? "" : " hidden"}${d}>`);
  return out;
}
