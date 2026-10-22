/** Productions — pressing a poster ([data-production]) opens that production in a pop-up.
 *  One template for every production, filled from js/productions-data.js; no page is stored per production.
 *  The picture space is a mini carousel of the production's photos and videos.
 *  The address gains #production=<name>, so a production can be linked to and the Back button closes it.
 *  Without scripts the posters are plain pictures.
 */
function initProductions() {
  const list = window.ADC_PRODUCTIONS;
  const tiles = document.querySelectorAll(".s-prod[data-production]");
  if (!Array.isArray(list) || !tiles.length || document.documentElement.dataset.productionsBound === "1") return;
  document.documentElement.dataset.productionsBound = "1";

  const bySlug = new Map(list.map((p) => [p.slug, p]));
  const HASH = "#production=";
  let popup = null;
  let opener = null;

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };

  /** A line of "Label: value" pairs, separated by middle dots. */
  function facts(pairs) {
    const shown = pairs.filter(([, value]) => value);
    if (!shown.length) return null;
    const frag = document.createDocumentFragment();
    shown.forEach(([label, value], i) => {
      if (i) frag.append(" · ");
      frag.append(el("strong", "", `${label}:`), ` ${value}`);
    });
    return frag;
  }

  function videoSlide(id, name) {
    const link = el("a", "s-mini__slide s-pop__video");
    link.href = `https://www.youtube.com/watch?v=${id}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("aria-label", `Play video: ${name}`);
    const img = el("img");
    img.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    img.alt = "";
    img.loading = "lazy";
    const play = el("span", "s-video__play");
    play.setAttribute("aria-hidden", "true");
    play.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    link.append(img, play);
    link.addEventListener("click", (e) => {
      if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const frame = el("iframe", "s-mini__slide s-pop__video");
      frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
      frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      frame.allowFullscreen = true;
      frame.title = `${name} — video`;
      link.replaceWith(frame);
    });
    return link;
  }

  function build(p) {
    const box = el("div", "s-pop");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", p.name);

    const panel = el("div", "s-pop__panel s-section");

    const visual = el("div", "s-section__visual s-section__visual--whole");
    const mini = el("div", "s-mini");
    mini.setAttribute("data-mini-carousel", "");
    mini.setAttribute("role", "group");
    mini.setAttribute("aria-roledescription", "carousel");
    mini.setAttribute("aria-label", `${p.name} — photos and videos`);
    const track = el("div", "s-mini__track");
    track.tabIndex = 0;
    const photos = p.photos && p.photos.length ? p.photos : [p.poster];
    photos.forEach((src, i) => {
      const img = el("img", "s-mini__slide");
      img.src = src;
      img.alt = i ? `${p.name} — photo ${i + 1}` : p.name;
      if (i) img.loading = "lazy";
      track.append(img);
    });
    (p.videos || []).forEach((id) => track.append(videoSlide(id, p.name)));
    mini.append(track);
    visual.append(mini);

    const content = el("div", "s-section__content");
    const eyebrow = [p.label, p.length].filter(Boolean).join(" · ");
    if (eyebrow) content.append(el("span", "s-section__eyebrow", eyebrow));
    content.append(el("h2", "s-section__title", p.name));
    const prose = el("div", "content-prose");
    (p.about || []).forEach((html) => {
      const para = el("p");
      para.innerHTML = html; // made safe by the tool that writes productions-data.js
      prose.append(para);
    });
    const lines = [
      facts([["Artists", p.artists], ["Style", p.style]]),
      facts([["Performers", p.performers]]),
      facts([["Director", p.director], ["Music", p.music], ["Lighting", p.lighting]]),
      facts([["Availability", p.availability]]),
    ].filter(Boolean);
    if (lines.length) {
      const para = el("p");
      lines.forEach((line, i) => {
        if (i) para.append(el("br"));
        para.append(line);
      });
      prose.append(para);
    }
    if (prose.children.length) content.append(prose);

    const close = el("button", "s-pop__close");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.innerHTML = typeof ICONS !== "undefined" && ICONS.close ? ICONS.close : "×";
    close.addEventListener("click", () => shut(true));

    panel.append(visual, content, close);
    box.append(panel);
    box.addEventListener("click", (e) => {
      if (e.target === box) shut(true);
    });
    return { box, close };
  }

  function shut(clearHash) {
    if (!popup) return;
    popup.remove();
    popup = null;
    document.body.style.overflow = "";
    if (clearHash && location.hash.startsWith(HASH)) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    if (opener) opener.focus({ preventScroll: true });
    opener = null;
  }

  function open(slug, from) {
    const p = bySlug.get(slug);
    if (!p) return;
    shut(false);
    opener = from || document.querySelector(`.s-prod[data-production="${slug}"]`);
    const made = build(p);
    popup = made.box;
    document.body.append(popup);
    document.body.style.overflow = "hidden";
    if (typeof initMiniCarousels === "function") initMiniCarousels();
    made.close.focus();
    if (location.hash !== HASH + slug) history.replaceState(null, "", HASH + slug);
  }

  tiles.forEach((tile) => {
    if (!bySlug.has(tile.dataset.production)) return;
    tile.tabIndex = 0;
    tile.setAttribute("role", "button");
    tile.setAttribute("aria-haspopup", "dialog");
    tile.addEventListener("click", () => open(tile.dataset.production, tile));
    tile.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      open(tile.dataset.production, tile);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") shut(true);
  });

  const fromHash = () => {
    if (location.hash.startsWith(HASH)) open(decodeURIComponent(location.hash.slice(HASH.length)));
    else shut(false);
  };
  window.addEventListener("hashchange", fromHash);
  fromHash();
}
