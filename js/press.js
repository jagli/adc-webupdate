/**
 * Press reviews wall (About → Press Reviews).
 * Shows the first three articles; "See all" opens the rest. A click opens the reader:
 * one page at a time, Previous / Next (and the arrow keys, and a swipe) go through every page of every
 * article in order, Esc or ✕ closes. Each card lists its pages in data-pages.
 */
(function () {
  "use strict";

  const SHOWN = 3;

  function init(wall) {
    const cards = [...wall.querySelectorAll(".press-card")];
    if (!cards.length) return;

    // Every page of every shown article, in order, with what it belongs to
    const pages = [];
    cards.forEach((card, a) => {
      const list = (card.dataset.pages || "").split(",").map((s) => s.trim()).filter(Boolean);
      const cover = card.querySelector("img");
      if (!list.length && cover) list.push(cover.getAttribute("data-full-src") || cover.getAttribute("src"));
      card.dataset.first = pages.length;
      list.forEach((src, p) => pages.push({ src, article: a, page: p + 1, of: list.length, card }));
    });

    // Three at first, the rest behind "See all"
    const more = wall.parentElement.querySelector(".press-wall__more button");
    if (cards.length > SHOWN && more) {
      cards.slice(SHOWN).forEach((c) => (c.hidden = true));
      const label = more.textContent;
      more.addEventListener("click", () => {
        const open = more.getAttribute("aria-expanded") === "true";
        cards.slice(SHOWN).forEach((c) => (c.hidden = open));
        more.setAttribute("aria-expanded", String(!open));
        more.textContent = open ? label : "Show fewer";
        if (open) wall.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else if (more) {
      more.parentElement.hidden = true;
    }

    // The reader
    const reader = document.createElement("div");
    reader.className = "press-reader";
    reader.hidden = true;
    reader.setAttribute("role", "dialog");
    reader.setAttribute("aria-modal", "true");
    reader.setAttribute("aria-label", "Press review");
    reader.innerHTML = `
      <div class="press-reader__bar">
        <div class="press-reader__caption" aria-live="polite"></div>
        <button type="button" class="press-reader__close" aria-label="Close">✕</button>
      </div>
      <div class="press-reader__stage"></div>
      <div class="press-reader__nav">
        <button type="button" class="press-reader__prev" aria-label="Previous page">‹<span class="press-reader__word"> Previous</span></button>
        <span class="press-reader__count"></span>
        <button type="button" class="press-reader__next" aria-label="Next page"><span class="press-reader__word">Next </span>›</button>
      </div>`;
    document.body.appendChild(reader);
    const img = document.createElement("img"); // added on first open: an empty picture would count as broken
    const caption = reader.querySelector(".press-reader__caption");
    const count = reader.querySelector(".press-reader__count");
    const prev = reader.querySelector(".press-reader__prev");
    const next = reader.querySelector(".press-reader__next");
    let at = 0;
    let opener = null;

    function text(card, sel) {
      const el = card.querySelector(sel);
      return el ? el.textContent.trim() : "";
    }

    function show(i) {
      at = Math.max(0, Math.min(pages.length - 1, i));
      const p = pages[at];
      if (!img.parentNode) reader.querySelector(".press-reader__stage").appendChild(img);
      img.src = p.src;
      img.alt = `${text(p.card, ".press-card__title")} — page ${p.page} of ${p.of}`;
      caption.innerHTML = "<b></b><span></span>";
      caption.querySelector("b").textContent = text(p.card, ".press-card__title");
      caption.querySelector("span").textContent = `${text(p.card, ".press-card__paper")} · ${text(p.card, ".press-card__date")}`;
      count.textContent = `${p.of > 1 ? `Page ${p.page} of ${p.of} · ` : ""}Article ${p.article + 1} of ${cards.length}`;
      prev.disabled = at === 0;
      next.disabled = at === pages.length - 1;
      // the next page is fetched early, so turning feels instant
      if (pages[at + 1]) new Image().src = pages[at + 1].src;
    }

    function open(card) {
      opener = card.querySelector(".press-card__open");
      show(Number(card.dataset.first));
      reader.hidden = false;
      document.documentElement.style.overflow = "hidden";
      reader.querySelector(".press-reader__close").focus();
    }

    function close() {
      reader.hidden = true;
      document.documentElement.style.overflow = "";
      if (opener) opener.focus();
    }

    cards.forEach((card) => card.querySelector(".press-card__open").addEventListener("click", () => open(card)));
    prev.addEventListener("click", () => show(at - 1));
    next.addEventListener("click", () => show(at + 1));
    reader.querySelector(".press-reader__close").addEventListener("click", close);
    reader.addEventListener("click", (e) => { if (e.target === reader || e.target.classList.contains("press-reader__stage")) close(); });
    document.addEventListener("keydown", (e) => {
      if (reader.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(at - 1);
      if (e.key === "ArrowRight") show(at + 1);
    });
    let x0 = null;
    reader.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    reader.addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) show(at + (dx < 0 ? 1 : -1));
      x0 = null;
    });
  }

  function start() { document.querySelectorAll("[data-press-wall]").forEach(init); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
