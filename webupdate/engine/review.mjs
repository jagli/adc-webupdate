/**
 * The change page: only what changed, shown in place with the site's own design.
 *
 * One panel per changed section: the section as it will look, with the section above and below
 * faded for context; a Before / After switch; a Computer / Phone switch; changed words and photos
 * outlined; and a short list of what changed (added, edited, hidden, moved rows).
 */
import { parse, select, outer, inner, walk } from "./html.mjs";
import { extract, galleryRow } from "./model.mjs";
import { escapeHtml, escapeAttr, normalise, decode } from "./light.mjs";
import { PAGE_NAMES, PAGES, GLOBAL_FIELDS } from "./site.mjs";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Cells compared without empty ones and in a fixed order (the Sheet adds empty columns). */
const cellsKey = (c) => JSON.stringify(Object.entries(c || {}).filter(([, v]) => String(v ?? "").trim() !== "").sort());
const galleryKey = (g) => JSON.stringify((g?.rows || []).filter((x) => x.show !== false).map(galleryRow));
const short = (s, n = 70) => { const t = normalise(String(s ?? "").replace(/\*\*|\*|\[|\]\([^)]*\)/g, "")); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

/** What changed in one section, as plain sentences. */
function blockChanges(b0, b1) {
  const out = [];
  const s0 = new Map((b0?.slots || []).map((s) => [s.key, s]));
  for (const s of b1.slots) {
    const o = s0.get(s.key);
    if (!o) continue;
    if (normalise(o.value) !== normalise(s.value)) out.push(s.kind === "photo" ? `${s.what} replaced` : s.kind === "photos" ? "Photos changed" : s.kind === "video" ? `${s.what} changed` : `${s.what} changed: “${short(s.value)}”`);
    else if ((o.alt ?? "") !== (s.alt ?? "")) out.push(`${s.what} description changed`);
    else if ((o.href ?? "") !== (s.href ?? "")) out.push(`${s.what} link changed`);
  }
  const l0 = new Map((b0?.lists || []).map((l) => [l.key, l]));
  for (const l of b1.lists) {
    const o = l0.get(l.key);
    if (!o) continue;
    if (l.folder && l.folder !== o.folder) out.push(`${l.what}: replaced with the photos of a Drive folder`);
    const before = new Map(o.rows.map((r) => [r.key, r]));
    const shownBefore = o.rows.filter((r) => r.show !== false).map((r) => r.key);
    const shownNow = l.rows.filter((r) => r.show !== false && Object.values(r.cells || {}).some((v) => normalise(v))).map((r) => r.key);
    const first = (r) => short(Object.values(r.cells || {}).find((v) => normalise(v) && !/^(assets\/|https?:)/.test(v)) || Object.values(r.cells || {})[0], 50);
    for (const r of l.rows) {
      const filled = Object.values(r.cells || {}).some((v) => normalise(v));
      if (!filled) continue;
      const b = before.get(r.key);
      if (!b) { if (r.show !== false) out.push(`${l.what}: added “${first(r)}”`); continue; }
      if (r.show === false && b.show !== false) out.push(`${l.what}: hidden “${first(b)}”`);
      else if (r.show !== false && b.show === false) out.push(`${l.what}: shown again “${first(r)}”`);
      else if (r.show !== false && cellsKey(r.cells) !== cellsKey(b.cells)) out.push(`${l.what}: edited “${first(r)}”`);
    }
    const kept = shownNow.filter((k) => shownBefore.includes(k));
    const keptBefore = shownBefore.filter((k) => kept.includes(k));
    if (!same(kept, keptBefore) && !l.rule?.sort) out.push(`${l.what}: order changed`);
    for (const k of shownBefore) if (!l.rows.find((r) => r.key === k)) out.push(`${l.what}: removed “${first(before.get(k))}”`);
  }
  if (b1.gallery && galleryKey(b1.gallery) !== galleryKey(b0?.gallery)) {
    const n0 = (b0?.gallery?.rows || []).filter((g) => g.show !== false).length;
    const n1 = b1.gallery.rows.filter((g) => g.show !== false).length;
    out.push(`Gallery: ${n1 - n0 > 0 ? `${n1 - n0} added` : n1 - n0 < 0 ? `${n0 - n1} fewer` : "edited"} (${n1} shown)`);
  }
  return out;
}

/** The <head> links of a built page, so the panels use the site's real styles. */
function headLinks(html) {
  const root = parse(html);
  return select(root, "link[rel=stylesheet]").map((l) => outer(html, l)).join("\n") +
    `\n<style>body{margin:0;background:var(--ivory,#fbfaf9)} main{display:block} .wu-faded{opacity:.35;pointer-events:none;position:relative;height:170px;overflow:hidden;-webkit-mask-image:linear-gradient(#000 30%,transparent)} .wu-faded--above{-webkit-mask-image:linear-gradient(transparent,#000 70%)} .wu-faded--above>*{position:absolute;left:0;right:0;bottom:0} .wu-mark{outline:3px solid #e9b44c;outline-offset:3px;background:rgba(233,180,76,.12)} img.wu-mark{outline-offset:-3px}</style>`;
}

function sectionSnippet(html, index) {
  const root = parse(html);
  const main = select(root, "main")[0];
  const kids = main.children;
  const el = kids[index];
  if (!el) return "";
  const pick = (k, cls) => (kids[k] && !/alt-next|v-chapter__nav|instagram-section/.test(kids[k].attrs.class || "") && kids[k].tag !== "nav" ? `<div class="wu-faded ${cls}">${outer(html, kids[k])}</div>` : "");
  const fix = (s) => s.replace(/<img([^>]*?)\sdata-full-src="([^"]+)"([^>]*?)>/g, (m, a, full, b) => `<img${a.replace(/\ssrc="[^"]*"/, "")} src="${full}"${b.replace(/\ssrc="[^"]*"/, "")}>`).replace(/\sloading="lazy"/g, "");
  return fix(pick(index - 1, "wu-faded--above") + outer(html, el) + pick(index + 1, ""));
}

const frameDoc = (head, body, base, marks) => `<!doctype html><html><head><meta charset="utf-8"><base href="${base}">${head}</head><body><main class="site-main">${body}</main>
<script>(function(){var m=${JSON.stringify(marks || null)};if(!m)return;var t=new Set(m.t),s=new Set(m.s);
document.querySelectorAll('main > :not(.wu-faded) *').forEach(function(e){if(e.tagName==='IMG'){var u=(e.getAttribute('src')||'').replace(/^.*?assets\\//,'assets/');if(!s.has(u))e.classList.add('wu-mark');return;}
if(e.children.length&&[].some.call(e.children,function(c){return !/^(STRONG|EM|B|I|A|BR)$/.test(c.tagName)}))return;var x=e.textContent.replace(/\\s+/g,' ').trim();if(x&&!t.has(x))e.classList.add('wu-mark');});
/* a change inside a box that scrolls (a long list): scroll that box to it */
var first=document.querySelector('.wu-mark');for(var p=first&&first.parentElement;p&&p!==document.body;p=p.parentElement){if(p.scrollHeight>p.clientHeight+4&&/(auto|scroll)/.test(getComputedStyle(p).overflowY)){p.scrollTop=first.offsetTop-p.offsetTop-p.clientHeight/3;break;}}})();
function size(){parent.postMessage({wuH:document.documentElement.scrollHeight,id:frameElement&&frameElement.id},'*')}addEventListener('load',size);setTimeout(size,800);</script></body></html>`;

function textsAndImages(html) {
  const t = new Set(), s = [];
  const root = parse(html);
  for (const el of walk(root)) {
    if (el.tag === "img") { s.push(String(el.attrs.src || "").replace(/^.*?assets\//, "assets/")); continue; }
    if (el.tag === "script" || el.tag === "style") continue;
    const v = decode(inner(html, el).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (v) t.add(v);
  }
  return { t: [...t], s };
}

/**
 * base/content: content.json before and after; before: page → html with the live content;
 * after: page → built html. Returns { page, summary }.
 */
export function reviewPage({ base, content, before, after, assetBase = "../" }) {
  const panels = [];
  const summary = [];
  // Global
  const gch = GLOBAL_FIELDS.filter(([, k]) => String(base.global?.[k] ?? "") !== String(content.global?.[k] ?? "")).map(([label, k]) => `${label}: “${base.global?.[k] ?? ""}” → “${content.global?.[k] ?? ""}”`);
  if (gch.length) { summary.push({ page: "Global", section: "Contact details and links", changes: gch }); panels.push({ title: "Global › Contact details and links (footer of every page)", changes: gch }); }
  // Productions
  const p0 = new Map((base.productions || []).map((p) => [p.Production, p]));
  const pch = [];
  for (const p of content.productions || []) {
    const o = p0.get(p.Production);
    if (!o) pch.push(`added “${p.Production}”`);
    else if (!same(o, p)) pch.push(`edited “${p.Production}”${o.Show !== p.Show ? ` (Show: ${o.Show || "—"} → ${p.Show || "—"})` : ""}`);
  }
  for (const [name] of p0) if (!(content.productions || []).find((p) => p.Production === name)) pch.push(`removed “${name}”`);
  const prodOrder = (x) => (x.productions || []).filter((p) => /^yes$/i.test(p.Show)).map((p) => p.Production);
  if (!same(prodOrder(base).filter((n) => prodOrder(content).includes(n)), prodOrder(content).filter((n) => prodOrder(base).includes(n)))) pch.push("order changed");
  // Pages
  for (const page of PAGES) {
    const b0 = base.pages?.[page], b1 = content.pages?.[page];
    if (!b1) continue;
    const map0 = new Map((b0?.blocks || []).map((b) => [b.key, b]));
    const htmlBefore = before[page], htmlAfter = after[page];
    const model = htmlAfter ? extract(page, htmlBefore || htmlAfter) : null;
    for (const blk of b1.blocks) {
      let changes = blockChanges(map0.get(blk.key), blk);
      if (page === "performances" && /\/productions$/.test(blk.key) && pch.length) changes = [...changes, ...pch.map((c) => `Productions: ${c}`)];
      if (!changes.length) continue;
      summary.push({ page: PAGE_NAMES[page], section: blk.label, changes });
      const mb = model?.blocks.find((x) => x.key === blk.key);
      const idx = mb ? topIndex(htmlBefore || htmlAfter, mb.el.start) : -1;
      panels.push({ title: `${PAGE_NAMES[page]} › ${blk.label}`, changes, page, anchor: blk.key.split("/")[1], idx, htmlBefore, htmlAfter });
    }
  }
  const head = headLinks(Object.values(after)[0] || "");
  const body = panels.map((p, n) => {
    const list = `<ul class="wu-changes">${p.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`;
    if (p.idx === undefined || p.idx < 0) return `<section class="wu-panel"><h2>${escapeHtml(p.title)}</h2>${list}</section>`;
    const snipA = sectionSnippet(p.htmlAfter, p.idx), snipB = sectionSnippet(p.htmlBefore || p.htmlAfter, p.idx);
    const marks = textsAndImages(snipB);
    const docA = frameDoc(head, snipA, assetBase, marks), docB = frameDoc(head, snipB, assetBase, null);
    return `<section class="wu-panel" data-n="${n}">
  <h2>${escapeHtml(p.title)}</h2>${list}
  <div class="wu-tools"><span class="wu-seg"><button class="on" data-v="after">After</button><button data-v="before">Before (live now)</button></span>
  <span class="wu-seg"><button class="on" data-w="computer">Computer</button><button data-w="phone">Phone</button></span>
  <a class="wu-open" href="${assetBase}${p.page === "index" ? "index" : p.page}.html#${escapeHtml(p.anchor)}" target="_blank" rel="noopener">Open full page ↗</a></div>
  <div class="wu-stage"><iframe id="a${n}" class="wu-frame" srcdoc="${escapeAttr(docA)}"></iframe><iframe id="b${n}" class="wu-frame" hidden srcdoc="${escapeAttr(docB)}"></iframe></div>
</section>`;
  }).join("\n");
  const total = summary.reduce((n, s) => n + s.changes.length, 0);
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Changes for review — Abhinava Dance Company</title>
<style>
:root{--ink:#1d2433;--muted:#5b6170;--gold:#9d7949;--line:#e3d6bf;--bg:#f6f3ed}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
header{position:sticky;top:0;z-index:5;background:#0a2a45;color:#fff;padding:14px 20px;display:flex;flex-wrap:wrap;gap:8px 20px;align-items:baseline}
header h1{font-size:18px;margin:0;font-weight:600}header p{margin:0;opacity:.85;font-size:14px}
.wrap{max-width:1240px;margin:0 auto;padding:20px 16px 60px}
.wu-panel{background:#fff;border:1px solid var(--line);border-radius:10px;margin:0 0 28px;padding:18px 18px 12px;box-shadow:0 2px 10px rgba(0,0,0,.04)}
.wu-panel h2{margin:0 0 6px;font-size:18px}.wu-changes{margin:0 0 12px;padding-left:20px;color:var(--muted);font-size:14px}
.wu-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px}
.wu-seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden}.wu-seg button{border:0;background:#fff;padding:7px 14px;font:inherit;font-size:14px;cursor:pointer;color:var(--muted)}
.wu-seg button.on{background:var(--ink);color:#fff}.wu-open{margin-left:auto;font-size:14px;color:var(--gold)}
.wu-stage{background:#e9e4da;border-radius:8px;padding:10px;overflow:auto}
.wu-frame{display:block;width:100%;height:600px;border:0;background:#fff;margin:0 auto;transition:width .2s}
.wu-stage.phone .wu-frame{width:390px;max-width:100%}
.wu-frame[hidden]{display:none}
.legend{font-size:13px;color:var(--muted);margin:0 0 18px}.legend b{outline:3px solid #e9b44c;padding:0 4px}
.empty{background:#fff;border:1px solid var(--line);border-radius:10px;padding:30px;text-align:center;color:var(--muted)}
</style></head><body>
<header><h1>Changes waiting for review</h1><p>${total ? `${total} change${total > 1 ? "s" : ""} in ${summary.length} place${summary.length > 1 ? "s" : ""}` : "No changes"} · To approve or send back, use <b>Website ▸ Review</b> in the Google Sheet.</p></header>
<div class="wrap"><p class="legend">Changed words and photos are outlined like <b>this</b>. Faded parts above and below are only there to show where the change sits.</p>
${body || `<div class="empty">Nothing has changed since the last publish.</div>`}</div>
<script>
/* a picture's height is measured when it is shown (a hidden one measures as zero) */
function fit(f){setTimeout(function(){try{f.style.height=Math.min(f.contentDocument.documentElement.scrollHeight,2400)+'px'}catch(e){}},60)}
document.querySelectorAll('.wu-panel').forEach(function(p){
  p.querySelectorAll('[data-v]').forEach(function(b){b.onclick=function(){p.querySelectorAll('[data-v]').forEach(function(x){x.classList.toggle('on',x===b)});var a=p.querySelector('[id^=a]'),bf=p.querySelector('[id^=b]');a.hidden=b.dataset.v!=='after';bf.hidden=b.dataset.v!=='before';fit(b.dataset.v==='after'?a:bf);}});
  p.querySelectorAll('[data-w]').forEach(function(b){b.onclick=function(){p.querySelectorAll('[data-w]').forEach(function(x){x.classList.toggle('on',x===b)});p.querySelector('.wu-stage').classList.toggle('phone',b.dataset.w==='phone');p.querySelectorAll('iframe').forEach(function(f){if(!f.hidden)fit(f)})}});
});
addEventListener('message',function(e){if(e.data&&e.data.wuH&&e.data.id){var f=document.getElementById(e.data.id);if(f)f.style.height=Math.min(e.data.wuH,2400)+'px'}});
document.querySelectorAll('iframe').forEach(function(f){f.addEventListener('load',function(){try{f.style.height=Math.min(f.contentDocument.documentElement.scrollHeight,2400)+'px'}catch(e){}})});
</script></body></html>`;
  return { page, summary };
}

function topIndex(html, start) {
  const main = select(parse(html), "main")[0];
  return main.children.findIndex((c) => c.start === start);
}
