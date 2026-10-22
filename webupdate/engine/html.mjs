/**
 * A small HTML reader for the site's own pages: it finds elements and remembers where each one
 * starts and ends in the source text, so content can be replaced by splicing the original text.
 * Anything not replaced stays byte for byte as it was.
 *
 * Supports the selectors the content model uses: tag, .class, #id, [attr], [attr=value],
 * [attr*=value], descendant (space) and child (>) combinators, and comma groups.
 */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style"]);

function parseAttrs(text) {
  const attrs = {};
  const re = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(text))) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return attrs;
}

/** Parse source into a tree. Each element: { tag, attrs, start, openEnd, closeStart, end, children, parent }. */
export function parse(src) {
  const root = { tag: "#root", attrs: {}, start: 0, openEnd: 0, closeStart: src.length, end: src.length, children: [], parent: null };
  let cur = root;
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) break;
    if (src.startsWith("<!--", lt)) {
      const e = src.indexOf("-->", lt + 4);
      i = e === -1 ? src.length : e + 3;
      continue;
    }
    if (src[lt + 1] === "!" || src[lt + 1] === "?") {
      const e = src.indexOf(">", lt);
      i = e === -1 ? src.length : e + 1;
      continue;
    }
    if (src[lt + 1] === "/") {
      const e = src.indexOf(">", lt);
      const name = src.slice(lt + 2, e).trim().toLowerCase();
      // close the nearest open element with this name
      let n = cur;
      while (n && n !== root && n.tag !== name) n = n.parent;
      if (n && n !== root) {
        let c = cur;
        while (c !== n) { c.closeStart = c.closeStart ?? lt; c.end = c.end ?? lt; c = c.parent; }
        n.closeStart = lt;
        n.end = e + 1;
        cur = n.parent;
      }
      i = e + 1;
      continue;
    }
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(src.slice(lt, lt + 64));
    if (!m) { i = lt + 1; continue; }
    // find the end of the start tag, respecting quotes
    let j = lt + m[0].length, q = null;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (q) { if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") q = ch;
      else if (ch === ">") break;
    }
    const tag = m[1].toLowerCase();
    const attrText = src.slice(lt + m[0].length, j).replace(/\/$/, "");
    const el = { tag, attrs: parseAttrs(attrText), start: lt, openEnd: j + 1, closeStart: undefined, end: undefined, children: [], parent: cur };
    cur.children.push(el);
    if (VOID.has(tag) || src[j - 1] === "/") {
      el.closeStart = el.openEnd;
      el.end = el.openEnd;
      i = j + 1;
      continue;
    }
    if (RAW.has(tag)) {
      const close = src.toLowerCase().indexOf(`</${tag}`, j + 1);
      el.closeStart = close;
      el.end = src.indexOf(">", close) + 1;
      i = el.end;
      continue;
    }
    cur = el;
    i = j + 1;
  }
  return root;
}

export const inner = (src, el) => src.slice(el.openEnd, el.closeStart);
export const outer = (src, el) => src.slice(el.start, el.end);
export const classes = (el) => (el.attrs.class || "").split(/\s+/).filter(Boolean);

export function* walk(el) {
  for (const c of el.children) { yield c; yield* walk(c); }
}

function parseCompound(s) {
  const out = { tag: null, id: null, cls: [], attrs: [] };
  const re = /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:([*^$]?=)"?([^"\]]*)"?)?\]/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) out.tag = m[1].toLowerCase();
    else if (m[2]) out.id = m[2];
    else if (m[3]) out.cls.push(m[3]);
    else out.attrs.push({ name: m[4].toLowerCase(), op: m[5], value: m[6] });
  }
  return out;
}

function matchCompound(el, c) {
  if (c.tag && el.tag !== c.tag) return false;
  if (c.id && el.attrs.id !== c.id) return false;
  const cl = classes(el);
  if (c.cls.some((x) => !cl.includes(x))) return false;
  for (const a of c.attrs) {
    if (!(a.name in el.attrs)) return false;
    const v = el.attrs[a.name];
    if (a.op === "=" && v !== a.value) return false;
    if (a.op === "*=" && !v.includes(a.value)) return false;
    if (a.op === "^=" && !v.startsWith(a.value)) return false;
    if (a.op === "$=" && !v.endsWith(a.value)) return false;
  }
  return true;
}

function compile(selector) {
  return selector.split(",").map((part) => {
    const tokens = part.trim().replace(/\s*>\s*/g, " > ").split(/\s+/);
    const steps = [];
    let comb = " ";
    for (const t of tokens) {
      if (t === ">") { comb = ">"; continue; }
      steps.push({ comb, c: parseCompound(t) });
      comb = " ";
    }
    return steps;
  });
}

function matches(el, steps, k = steps.length - 1) {
  if (!matchCompound(el, steps[k].c)) return false;
  if (k === 0) return true;
  if (steps[k].comb === ">") return el.parent ? matches(el.parent, steps, k - 1) : false;
  for (let p = el.parent; p; p = p.parent) if (matches(p, steps, k - 1)) return true;
  return false;
}

/** All elements under `scope` (not including it) matching the selector, in document order. */
export function select(scope, selector) {
  const groups = compile(selector);
  const out = [];
  for (const el of walk(scope)) if (groups.some((g) => matches(el, g))) out.push(el);
  return out;
}

export const selectOne = (scope, selector) => select(scope, selector)[0] || null;

/** Apply [start, end, text] replacements (non-overlapping) to src. */
export function splice(src, edits) {
  const sorted = [...edits].sort((a, b) => b[0] - a[0]);
  let out = src;
  let last = Infinity;
  for (const [s, e, t] of sorted) {
    if (e > last) throw new Error(`overlapping edits at ${s}`);
    out = out.slice(0, s) + t + out.slice(e);
    last = s;
  }
  return out;
}
