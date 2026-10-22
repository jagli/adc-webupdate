/**
 * "Light text": how page text appears in the Sheet. Plain words, with three easy marks:
 *   **bold**   *italic*   [link words](https://address)
 * and a new line in the cell for a line break.
 *
 * toLight(html) turns a page fragment into light text; toHtml(light, originalHtml) turns it back.
 * When the light text is unchanged, the original HTML is kept byte for byte.
 */

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", middot: "·", rarr: "→", larr: "←", times: "×", deg: "°", eacute: "é" };

export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escapeAttr = (s) => escapeHtml(s).replace(/"/g, "&quot;");

/** Tags allowed inside a text slot. Anything else makes the element a container, not a slot. */
export const INLINE = new Set(["strong", "b", "em", "i", "a", "br"]);

export function toLight(html) {
  let s = html;
  s = s.replace(/<br\s*\/?>\s*/gi, "\n");
  s = s.replace(/<a\b[^>]*?href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, text) => `[${text}](${decode(href)})`);
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
  s = s.replace(/<[^>]+>/g, "");
  s = decode(s);
  return s.replace(/[ \t\r]*\n[ \t\r]*/g, "\n").replace(/[ \t\r]+/g, " ").trim();
}

function inlineToHtml(s) {
  // links first (their words may hold bold/italic marks)
  const parts = [];
  let rest = s;
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/;
  let m;
  while ((m = linkRe.exec(rest))) {
    parts.push(marks(escapeHtml(rest.slice(0, m.index))));
    const href = m[2];
    const ext = /^https?:\/\//i.test(href);
    parts.push(`<a href="${escapeAttr(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${marks(escapeHtml(m[1]))}</a>`);
    rest = rest.slice(m.index + m[0].length);
  }
  parts.push(marks(escapeHtml(rest)));
  return parts.join("");
}

function marks(s) {
  return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "$1<em>$2</em>");
}

export function toHtml(light, originalHtml) {
  if (originalHtml !== undefined && toLight(originalHtml) === normalise(light)) return originalHtml;
  return normalise(light).split("\n").map(inlineToHtml).join("<br>");
}

export const normalise = (s) => String(s ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]*\n[ \t]*/g, "\n").replace(/[ \t]+/g, " ").trim();
