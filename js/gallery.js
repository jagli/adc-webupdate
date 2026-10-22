/** Flexible gallery: images, YouTube videos, HTML snippets + lightbox */
function galleryIcon(name, fallback) {
  return typeof ICONS !== "undefined" && ICONS && ICONS[name] ? ICONS[name] : (fallback || "");
}

class AdcGallery {
  constructor(container, items) {
    this.container = typeof container === "string" ? document.querySelector(container) : container;
    this.items = items || [];
    this.index = 0;
    this.build();
    this.createLightbox();
  }

  build() {
    if (!this.container) return;
    this.container.innerHTML = `<div class="gallery-masonry" role="list"></div>`;
    this.grid = this.container.querySelector(".gallery-masonry");
    this.items.forEach((item, i) => {
      const el = document.createElement("article");
      // The frame takes the photo's own shape (wide, tall or square), so nothing is cropped
      const shape = item.type === "video" || item.shape === "wide" ? "gallery-item--wide" : item.shape === "tall" ? "gallery-item--tall" : "";
      el.className = `gallery-item ${shape}`.trim();
      el.setAttribute("role", "listitem");
      el.dataset.index = i;

      if (item.type === "video") {
        const grads = typeof GRADIENTS !== "undefined" ? GRADIENTS : [
          "assets/gradients/g01-dawn.svg",
          "assets/gradients/g08-orchid.svg",
          "assets/gradients/g05-ocean-soft.svg",
        ];
        const id = this.youtubeId(item.src);
        const thumb = item.thumbnail || (id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : grads[i % grads.length]);
        el.innerHTML = `
          <div class="gallery-item__video-thumb">
            <img src="${thumb}" alt="${item.caption || "Video"}" loading="lazy">
            <div class="gallery-item__play">${galleryIcon("play", "▶")}</div>
          </div>
          ${item.caption ? `<div class="gallery-item__caption">${item.caption}</div>` : ""}`;
      } else if (item.type === "html") {
        el.innerHTML = `
          <div class="gallery-item__html">${item.preview || item.html}</div>
          ${item.caption ? `<div class="gallery-item__caption">${item.caption}</div>` : ""}`;
      } else {
        el.innerHTML = `
          <img src="${item.src}" alt="${item.caption || "Gallery image"}" loading="lazy" decoding="async">
          ${item.caption ? `<div class="gallery-item__caption">${item.caption}</div>` : ""}`;
      }

      el.addEventListener("click", () => this.open(i));
      this.grid.appendChild(el);
    });
    this.tiles = [...this.grid.children];
    this.layout();
    window.addEventListener("resize", () => this.layout());
  }

  /** Pinterest-style wall: each photo goes, in order, into the column that is shortest so far,
   *  so the wall fills left to right and the columns end close together. */
  layout() {
    const count = matchMedia("(min-width: 1200px)").matches ? 4 : matchMedia("(min-width: 768px)").matches ? 3 : 2;
    if (count === this.columnCount) return;
    this.columnCount = count;
    const columns = Array.from({ length: count }, () => {
      const col = document.createElement("div");
      col.className = "gallery-masonry__col";
      return col;
    });
    const heights = new Array(count).fill(0);
    this.tiles.forEach((tile) => {
      const height = tile.classList.contains("gallery-item--tall") ? 1.5 : tile.classList.contains("gallery-item--wide") ? 2 / 3 : 1;
      const shortest = heights.indexOf(Math.min(...heights));
      columns[shortest].appendChild(tile);
      heights[shortest] += height;
    });
    this.grid.replaceChildren(...columns);
  }

  youtubeId(url) {
    const m = String(url).match(/(?:embed\/|v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : "";
  }

  createLightbox() {
    if (document.getElementById("adc-lightbox")) {
      this.lightbox = document.getElementById("adc-lightbox");
      this.lightboxContent = this.lightbox.querySelector(".lightbox__content");
      return;
    }
    const lb = document.createElement("div");
    lb.id = "adc-lightbox";
    lb.className = "lightbox";
    lb.innerHTML = `
      <div class="lightbox__content"></div>
      <button class="lightbox__close" aria-label="Close">${galleryIcon("close", "×")}</button>`;
    document.body.appendChild(lb);
    this.lightbox = lb;
    this.lightboxContent = lb.querySelector(".lightbox__content");
    lb.querySelector(".lightbox__close").addEventListener("click", () => this.close());
    lb.addEventListener("click", (e) => { if (e.target === lb) this.close(); });
    document.addEventListener("keydown", (e) => {
      if (!this.lightbox.classList.contains("open")) return;
      if (e.key === "Escape") this.close();
      if (e.key === "ArrowLeft") this.prev();
      if (e.key === "ArrowRight") this.next();
    });
  }

  open(i) {
    this.index = i;
    this.renderSlide();
    this.lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  close() {
    this.lightbox.classList.remove("open");
    this.lightboxContent.innerHTML = "";
    document.body.style.overflow = "";
  }

  prev() {
    this.index = (this.index - 1 + this.items.length) % this.items.length;
    this.renderSlide();
  }

  next() {
    this.index = (this.index + 1) % this.items.length;
    this.renderSlide();
  }

  renderSlide() {
    const item = this.items[this.index];
    if (!item) return;
    if (item.type === "video") {
      const id = this.youtubeId(item.src);
      this.lightboxContent.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1" allow="autoplay; encrypted-media" allowfullscreen title="${item.caption || "Video"}"></iframe>`;
    } else if (item.type === "html") {
      this.lightboxContent.innerHTML = `<div class="lightbox__html">${item.html}</div>`;
    } else {
      this.lightboxContent.innerHTML = `<img src="${item.src}" alt="${item.caption || ""}">`;
    }
    this.renderControls();
  }

  /** The carousel's controls, in its glass notch on the photo's bottom edge: two gold arrows
   *  either side of a hairline whose gold part marks the current photo (styles: s-mini, 14-mini-carousel.css). */
  renderControls() {
    if (this.items.length < 2) return;
    const chevron = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
    const dots = this.items.map((it, i) => `<button type="button" class="s-mini__dot" aria-label="Photo ${i + 1} of ${this.items.length}"${i === this.index ? ' aria-current="true"' : ""}></button>`).join("");
    this.lightboxContent.insertAdjacentHTML("beforeend", `
      <div class="s-mini__dots">${dots}</div>
      <button type="button" class="s-mini__arrow s-mini__arrow--prev" aria-label="Previous photo">${chevron("M15 5l-7 7 7 7")}</button>
      <button type="button" class="s-mini__arrow s-mini__arrow--next" aria-label="Next photo">${chevron("M9 5l7 7-7 7")}</button>`);
    this.lightboxContent.querySelector(".s-mini__arrow--prev").addEventListener("click", () => this.prev());
    this.lightboxContent.querySelector(".s-mini__arrow--next").addEventListener("click", () => this.next());
    this.lightboxContent.querySelectorAll(".s-mini__dot").forEach((dot, i) => dot.addEventListener("click", () => { this.index = i; this.renderSlide(); }));
  }
}

function initGalleries() {
  document.querySelectorAll("[data-gallery]").forEach((el) => {
    try {
      const items = JSON.parse(el.getAttribute("data-gallery"));
      new AdcGallery(el, items);
    } catch (e) {
      console.warn("Gallery init failed", e);
    }
  });
}

document.addEventListener("DOMContentLoaded", initGalleries);
