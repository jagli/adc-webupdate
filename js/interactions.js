/** ADC interactions — carousels + chapter menu + videos
 *  Phase D1 extract from main.js — logic unchanged.
 *  Load after chrome.js, before main.js.
 */
function throttle(fn, wait) {
  let last = 0;
  let frame = 0;
  return function throttled(...args) {
    const now = Date.now();
    if (now - last < wait) return;
    last = now;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => fn.apply(this, args));
  };
}

function initCarousels() {
  document.querySelectorAll("[data-carousel]").forEach((root) => {
    if (root.dataset.carouselBound === "1") return;
    const viewport = root.querySelector(".alt-carousel__viewport");
    const track = root.querySelector(".alt-carousel__track");
    const prev = root.querySelector(".alt-carousel__btn--prev");
    const next = root.querySelector(".alt-carousel__btn--next");
    if (!viewport || !track || !prev || !next) return;
    root.dataset.carouselBound = "1";

    const scrollStep = () => {
      const item = track.querySelector(".alt-hscroll__item");
      if (!item) return viewport.clientWidth;
      const gap = parseFloat(getComputedStyle(track).gap) || 16;
      return item.offsetWidth + gap;
    };

    const updateButtons = () => {
      const maxScroll = viewport.scrollWidth - viewport.clientWidth;
      prev.disabled = viewport.scrollLeft <= 2;
      next.disabled = viewport.scrollLeft >= maxScroll - 2;
    };

    prev.addEventListener("click", () => {
      viewport.scrollBy({ left: -scrollStep(), behavior: "smooth" });
    });
    next.addEventListener("click", () => {
      viewport.scrollBy({ left: scrollStep(), behavior: "smooth" });
    });

    viewport.addEventListener("scroll", throttle(updateButtons, 50), { passive: true });
    if ("onscrollend" in viewport) {
      viewport.addEventListener("scrollend", updateButtons, { passive: true });
    }
    window.addEventListener("resize", throttle(updateButtons, 100), { passive: true });
    updateButtons();
  });
}

/** Mini carousels — a strip of photos shown one at a time ([data-mini-carousel]).
 *  Adds two plain arrows and one dot per photo. Without scripts the strip still scrolls sideways.
 */
function initMiniCarousels() {
  const chevron = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  document.querySelectorAll("[data-mini-carousel]").forEach((root) => {
    if (root.dataset.miniBound === "1") return;
    const track = root.querySelector(".s-mini__track");
    const slides = track ? [...track.children] : [];
    if (slides.length < 2) return;
    root.dataset.miniBound = "1";

    /* The exact (fractional) width, so a step never stops a sliver short and shows the edge of the photo before */
    const width = () => track.getBoundingClientRect().width || 1;
    const go = (i) => track.scrollTo({ left: width() * i, behavior: "smooth" });
    const current = () => Math.round(track.scrollLeft / width());

    const button = (cls, label, html) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = cls;
      b.setAttribute("aria-label", label);
      b.innerHTML = html;
      return b;
    };
    const prev = button("s-mini__arrow s-mini__arrow--prev", "Previous photo", chevron("M15 5l-7 7 7 7"));
    const next = button("s-mini__arrow s-mini__arrow--next", "Next photo", chevron("M9 5l7 7-7 7"));
    prev.addEventListener("click", () => go(current() - 1));
    next.addEventListener("click", () => go(current() + 1));

    const dots = document.createElement("div");
    dots.className = "s-mini__dots";
    const dotButtons = slides.map((_, i) => {
      const d = button("s-mini__dot", `Photo ${i + 1} of ${slides.length}`, "");
      d.addEventListener("click", () => go(i));
      dots.append(d);
      return d;
    });
    root.append(prev, next, dots);

    const update = () => {
      const i = current();
      prev.disabled = i <= 0;
      next.disabled = i >= slides.length - 1;
      dotButtons.forEach((d, n) => d.setAttribute("aria-current", n === i ? "true" : "false"));
    };
    track.addEventListener("scroll", throttle(update, 50), { passive: true });
    if ("onscrollend" in track) track.addEventListener("scrollend", update, { passive: true });
    window.addEventListener("resize", throttle(update, 100), { passive: true });
    update();
  });
}

function initSubnav() {
  const subnav = document.querySelector(".v-chapter__nav");
  if (!subnav || subnav.dataset.subnavBound === "1") return;
  subnav.dataset.subnavBound = "1";

  const headerH = () =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 80;

  /* The menu sticks under the header by itself (position: sticky in luxury.css); this only marks
     when it is stuck, for its shadow. Nothing here moves it, so it can never snap or jump. */
  let stuckFrame = 0;
  const markStuck = () => {
    stuckFrame = 0;
    subnav.classList.toggle("is-floating", subnav.getBoundingClientRect().top <= headerH());
  };
  const scheduleStuck = () => {
    if (!stuckFrame) stuckFrame = requestAnimationFrame(markStuck);
  };
  /* The menu's height, so a section reached from it lands right under it (scroll-margin-top in luxury.css) */
  const setMenuHeight = () =>
    document.documentElement.style.setProperty("--chapter-nav-h", `${subnav.offsetHeight}px`);
  window.addEventListener("scroll", scheduleStuck, { passive: true });
  window.addEventListener("resize", () => { scheduleStuck(); setMenuHeight(); }, { passive: true });
  setMenuHeight();
  markStuck();

  const links = [...subnav.querySelectorAll("a[href^='#']")];
  const pairs = links
    .map((link) => ({ link, section: document.querySelector(link.getAttribute("href")) }))
    .filter((pair) => pair.section);

  function setActive(href) {
    links.forEach((link) => {
      const isActive = link.getAttribute("href") === href;
      link.classList.toggle("active", isActive);
      if (isActive) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  function updateActive() {
    /* Just below the stuck menu, where a section reached from it lands (scroll-margin-top in luxury.css) */
    const marker = window.scrollY + headerH() + subnav.offsetHeight + 2;
    let current = pairs[0]?.link.getAttribute("href") || "";

    pairs.forEach(({ link, section }) => {
      const top = section.getBoundingClientRect().top + window.scrollY;
      if (top <= marker) current = link.getAttribute("href");
    });

    setActive(current);
  }

  window.addEventListener("scroll", updateActive, { passive: true });
  window.addEventListener("resize", updateActive, { passive: true });
  updateActive();
}

/** Videos — a thumbnail link marked data-video plays in a pop-up player over the page.
 *  Close with the button, the Escape key or a press outside the video.
 *  Without scripts the link still opens YouTube.
 */
function youtubeId(url) {
  const m = String(url).match(/(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : "";
}

function initVideos() {
  if (document.documentElement.dataset.videosBound === "1") return;
  document.documentElement.dataset.videosBound = "1";
  let popup = null;
  let opener = null;

  function closePopup() {
    if (!popup) return;
    popup.remove();
    popup = null;
    document.body.style.overflow = "";
    if (opener) opener.focus({ preventScroll: true });
  }

  function openPopup(id, title, link, start) {
    closePopup();
    opener = link;
    popup = document.createElement("div");
    popup.className = "lightbox open";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-label", title);
    const content = document.createElement("div");
    content.className = "lightbox__content";
    const frame = document.createElement("iframe");
    frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1${start ? `&start=${start}` : ""}`;
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    frame.title = title;
    const close = document.createElement("button");
    close.className = "lightbox__close";
    close.setAttribute("aria-label", "Close video");
    close.innerHTML = typeof ICONS !== "undefined" && ICONS.close ? ICONS.close : "×";
    close.addEventListener("click", closePopup);
    content.append(frame, close);
    popup.append(content);
    popup.addEventListener("click", (e) => {
      if (e.target === popup) closePopup();
    });
    document.body.append(popup);
    document.body.style.overflow = "hidden";
    close.focus();
  }

  document.addEventListener("click", (e) => {
    const link = e.target.closest ? e.target.closest("a[data-video]") : null;
    if (!link || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const id = youtubeId(link.href);
    if (!id) return;
    e.preventDefault();
    const t = link.href.match(/[?&]t=(\d+)/);
    openPopup(id, link.dataset.videoTitle || "Video", link, t ? t[1] : "");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopup();
  });
}

/** Auto motion — carousels and scrolling lists move by themselves once the visitor has paused near them.
 *  Starts when one is at least half on screen and the page has not been scrolled for 3 seconds.
 *  Carousels glide to the next picture every 4 seconds (eased start and end), looping to the first;
 *  scrolling lists drift slowly down, easing in and out, then ease back to the top and begin again.
 *  The visitor always wins: hovering, touching, clicking, the wheel or the keyboard on one stops it at
 *  once, and it picks up again by itself after 3 quiet seconds. Nothing moves for reduced-motion visitors.
 */
function initAutoMotion() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (document.documentElement.dataset.autoMotion === "1") return;
  document.documentElement.dataset.autoMotion = "1";

  const DWELL = 3000; /* quiet time before anything moves, and after the visitor lets go */
  const STEP_EVERY = 4000; /* a carousel's pause on each picture */
  const GLIDE = 900; /* one carousel step */
  const DRIFT = 22; /* list speed, px per second */
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  let pageScrolledAt = Date.now();
  window.addEventListener("scroll", () => { pageScrolledAt = Date.now(); }, { passive: true });

  const items = [];
  const add = (el, kind, opts = {}) => {
    if (!el || el.dataset.autoBound === "1") return;
    el.dataset.autoBound = "1";
    const it = { el, kind, ...opts, visible: 0, hovered: false, touchedAt: 0, running: false, nextAt: 0, anim: 0, v: 0, pos: 0, hold: 0 };
    const zone = opts.zone || el;
    const stop = () => { it.touchedAt = Date.now(); halt(it); };
    zone.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { it.hovered = true; halt(it); } });
    zone.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { it.hovered = false; it.touchedAt = Date.now(); } });
    ["pointerdown", "wheel", "touchstart", "keydown", "focusin"].forEach((t) => zone.addEventListener(t, stop, { passive: true }));
    io.observe(el);
    items.push(it);
  };

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const it = items.find((x) => x.el === e.target);
      if (!it) return;
      it.visible = e.intersectionRatio;
      if (it.visible < 0.3) halt(it);
    });
  }, { threshold: [0, 0.3, 0.5, 1] });

  function halt(it) {
    it.running = false;
    it.v = 0;
    cancelAnimationFrame(it.anim);
    it.anim = 0;
    if (it.kind === "step") it.el.style.scrollSnapType = "";
  }

  /* Eased glide of a scroll position (snap is lifted while it moves, so it cannot fight the glide) */
  function glide(it, axis, to, ms, done) {
    const el = it.el;
    const prop = axis === "x" ? "scrollLeft" : "scrollTop";
    const from = el[prop];
    const start = performance.now();
    el.style.scrollSnapType = "none";
    const frame = (now) => {
      if (!it.running) return;
      const t = Math.min(1, (now - start) / ms);
      el[prop] = from + (to - from) * ease(t);
      if (t < 1) it.anim = requestAnimationFrame(frame);
      else { it.anim = 0; el.style.scrollSnapType = ""; if (done) done(); }
    };
    it.anim = requestAnimationFrame(frame);
  }

  function stepCarousel(it) {
    const el = it.el;
    const max = el.scrollWidth - el.getBoundingClientRect().width;
    if (max < 4) return;
    const step = it.step();
    const at = el.scrollLeft;
    const to = at >= max - 4 ? 0 : Math.min(max, Math.round((at + step) / step) * step);
    glide(it, "x", to, to === 0 ? GLIDE * 1.6 : GLIDE);
  }

  function driftList(it) {
    const el = it.el;
    let last = performance.now();
    it.pos = el.scrollTop;
    const frame = (now) => {
      if (!it.running) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const max = el.scrollHeight - el.clientHeight;
      if (it.hold > now) { it.anim = requestAnimationFrame(frame); return; }
      const left = max - it.pos;
      if (left <= 0.5) {
        /* At the foot: rest, ease back to the top, rest, then drift again */
        it.v = 0;
        it.hold = now + 2000;
        setTimeout(() => {
          if (!it.running) return;
          glide(it, "y", 0, 1600, () => { it.pos = 0; it.hold = performance.now() + 1500; it.anim = requestAnimationFrame(frame); });
        }, 2000);
        return;
      }
      it.v = Math.min(DRIFT, it.v + DRIFT * dt / 1.2); /* eases in over about a second */
      const speed = left < 40 ? it.v * Math.max(0.15, left / 40) : it.v; /* and out near the foot */
      it.pos = Math.min(max, it.pos + speed * dt);
      el.scrollTop = it.pos;
      it.anim = requestAnimationFrame(frame);
    };
    it.anim = requestAnimationFrame(frame);
  }

  setInterval(() => {
    if (document.hidden) return;
    const now = Date.now();
    items.forEach((it) => {
      const quiet = now - pageScrolledAt >= DWELL && now - it.touchedAt >= DWELL && !it.hovered;
      if (it.running) {
        if (it.kind === "step" && now >= it.nextAt && !it.anim) { stepCarousel(it); it.nextAt = now + STEP_EVERY; }
        return;
      }
      if (!quiet || it.visible < 0.5) return;
      const el = it.el;
      if (it.kind === "drift" && el.scrollHeight - el.clientHeight < 8) return;
      it.running = true;
      if (it.kind === "step") { stepCarousel(it); it.nextAt = now + STEP_EVERY; }
      else driftList(it);
    });
  }, 250);

  document.querySelectorAll("[data-mini-carousel]").forEach((root) => {
    const track = root.querySelector(".s-mini__track");
    if (track && track.children.length > 1) add(track, "step", { zone: root, step: () => track.getBoundingClientRect().width });
  });
  document.querySelectorAll("[data-carousel]").forEach((root) => {
    const viewport = root.querySelector(".alt-carousel__viewport");
    const track = root.querySelector(".alt-carousel__track");
    if (!viewport || !track) return;
    add(viewport, "step", {
      zone: root,
      step: () => {
        const item = track.querySelector(".alt-hscroll__item");
        const gap = parseFloat(getComputedStyle(track).gap) || 16;
        return item ? item.offsetWidth + gap : viewport.clientWidth;
      },
    });
  });
  document.querySelectorAll(".s-timeline, .s-section--scroll-text > .s-section__content > .content-prose").forEach((el) => add(el, "drift"));
}
