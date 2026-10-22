/**
 * ADC chrome — header, logo, menu drawer, footer, and the header/hero scroll effects.
 *
 * LOCKED: header, menu and hero behaviour are approved. Regroup and comment only;
 * do not change logic or tuning values without approval.
 *
 * Load order: icons.js → adc-images.js → chrome.js → interactions.js → main.js.
 * main.js calls initChrome() on DOMContentLoaded.
 *
 * Contents
 *   1. Site content        name, contact details, menu items
 *   2. Tuning values       every number that drives the logo and hero effects
 *   3. Small helpers
 *   4. Markup              header, logo, drawer, footer, skip link
 *   5. Menu drawer         open/close state and its event listeners
 *   6. Header on scroll    ivory fade and logo scale
 *   7. Hero on scroll      image scale/blur and text blur
 *   8. Scroll loop
 *   9. Start-up
 */

/* ── 1. Site content ────────────────────────────────────────────────────── */

const SITE = {
  name: "Abhinava Dance Company",
  tagline: "Classical and all-time-new",
  email: "info@abhinavadancecompany.com",
  phone: "+91 93432 16765",
  schoolEmail: "Smruthi@abhinavadancecompany.com",
  schoolPhone: "+91 99023 55722",
  instagram: "https://www.instagram.com/nirupama_rajendra/",
  youtube: "https://www.youtube.com/abhinavadancecompany",
  /* School Instagram: shown in the footer once showSchoolInstagram is true */
  schoolInstagram: "https://www.instagram.com/abhinavadanceschool/",
  showSchoolInstagram: false,
};

/* Main nav — exact sitemap order (8 items) */
const NAV = [
  { href: "index.html", label: "Home", id: "home" },
  { href: "about.html", label: "About Us", id: "about" },
  { href: "performances.html", label: "Performances", id: "performances" },
  { href: "school.html", label: "School", id: "school" },
  { href: "activities.html", label: "Activities", id: "activities" },
  { href: "store.html", label: "Store", id: "store" },
  { href: "support.html", label: "Support Us", id: "support" },
  { href: "contact.html", label: "Contact", id: "contact" },
];

const ADDITIONAL_NAV = [
  { href: "research.html", label: "Research (DMA)", id: "research" },
  { href: "testimonials.html", label: "Testimonials", id: "testimonials" },
  { href: "credentials.html", label: "Credentials", id: "credentials" },
  { href: "gallery.html", label: "Gallery", id: "gallery" },
];

/* ── 2. Tuning values ───────────────────────────────────────────────────── */

/** Logo Menu Rewind — menu open returns logo to start keyframe; close restores scroll state */
const LOGO_MENU_REWIND_MS = 820;

const HEADER_IVORY_FADE_DISTANCE_PX = 180;
const LOGO_END_MULTIPLIER = 3;
const LOGO_TRANSFORM_END = 1;
const LOGO_TRANSFORM_START = (1 / LOGO_END_MULTIPLIER) * 0.9;
const LOGO_LIFT_END_PX = -8;
/* Start keyframe sits 47px higher; eases to 0 so the end position is untouched */
const LOGO_START_SHIFT_PX = -47;

const HERO_MEDIA_FX_START = 0.3;
const HERO_MEDIA_SCALE_MAX = 0.5;
const HERO_MEDIA_BLUR_MAX_PX = 14;
const HERO_MEDIA_BLUR_AT_END = 0.8; /* 80% of max blur when hero bottom reaches header */
const HERO_BODY_BLUR_MAX_PX = 12;

/* ── 3. Small helpers ───────────────────────────────────────────────────── */

function currentPageId() {
  const page = document.body.dataset.page || "home";
  return page;
}

function navLink(item, page) {
  const active = item.id === page ? "active" : "";
  return `<a href="${item.href}" class="${active}">${item.label}</a>`;
}

function iconSvg(name, fallbackText) {
  if (typeof ICONS !== "undefined" && ICONS && ICONS[name]) return ICONS[name];
  return fallbackText || "";
}

function siteHostname() {
  return window.location.hostname.replace(/^www\./i, "").toLowerCase();
}

function isLiveAbhinavaSite() {
  return siteHostname() === "abhinava.dance";
}

function headerHeightPx() {
  return (
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 80
  );
}

/** Foundry scroll lab takes priority over other heroes on the same page. */
function getPageHero() {
  const lab = document.getElementById("foundry-scroll-lab");
  if (lab?.classList.contains("v-hero")) return lab;
  return document.querySelector("main .v-hero");
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

/* ── 4. Markup ──────────────────────────────────────────────────────────── */

function renderLogoImg() {
  const base = typeof ADC_LOGO_SRC !== "undefined" ? ADC_LOGO_SRC : "assets/adc-logo.svg";
  const v = typeof ADC_LOGO_ASSET_V !== "undefined" ? ADC_LOGO_ASSET_V : "93";
  return `<img class="site-logo__img" src="${base}?v=${v}" alt="" width="196" height="228" decoding="async" fetchpriority="high">`;
}

function renderHeader() {
  return `
    <header class="site-header" id="site-header">
      <div class="site-header__bar layout">
        <div class="site-header__logo-slot">
          <a href="index.html" class="site-logo" aria-label="${SITE.name} — Home">
            <span class="site-logo__halo" aria-hidden="true"></span>
            ${renderLogoImg()}
            <span class="site-logo__a" aria-hidden="true"></span>
          </a>
        </div>
        <div class="header-actions">
          <button class="nav-toggle" id="nav-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open menu">${iconSvg("menu", "Menu")}</button>
        </div>
      </div>
    </header>
  `;
}

/* Drawer + backdrop live directly on <body>, never inside the header,
   so no header transform/filter/z-index can ever trap or clip them. */
function renderMobileNav() {
  const page = currentPageId();
  const mobileMain = NAV.map((item) => navLink(item, page)).join("");
  const mobileExtra = ADDITIONAL_NAV.map((item) => navLink(item, page)).join("");

  return `
    <div class="mobile-nav__backdrop" id="mobile-nav-backdrop"></div>
    <nav class="mobile-nav" id="mobile-nav" aria-label="Mobile" aria-hidden="true">
      <div class="mobile-nav__section">
        <div class="mobile-nav__label">Menu</div>
        ${mobileMain}
      </div>
      <div class="mobile-nav__section">
        <div class="mobile-nav__label">Explore</div>
        ${mobileExtra}
      </div>
    </nav>
  `;
}

function renderJagliCredit() {
  const phrase = isLiveAbhinavaSite() ? "Re imagined by" : "Being re imagined by";
  return `<span class="footer-bottom__credit"><span class="footer-bottom__credit-label">${phrase}</span> <span class="footer-bottom__sep" aria-hidden="true">|</span> <a href="https://jagli.in" target="_blank" rel="noopener">Jagli</a></span>`;
}

function renderFooter() {
  const colLinks = (items) =>
    items.map((i) => `<li><a href="${i.href}">${i.label}</a></li>`).join("");

  /* Identical on every page. Inner .layout matches the header column; the navy band stays full-bleed. */
  return `
    <footer class="site-footer" data-foundry-module="footer">
      <div class="layout">
        <div class="footer-grid">
          <div class="footer-brand">
            <div class="footer-brand__name">${SITE.name}</div>
            <p class="footer-brand__tag">${SITE.tagline} — Rooted in tradition, creative in presentation. ICCR Recognized · SNA Award Winner.</p>
          </div>
          <div class="footer-col">
            <div class="footer-col__title">Explore</div>
            <ul>${colLinks(NAV.filter((n) => n.id !== "home"))}</ul>
          </div>
          <div class="footer-col">
            <div class="footer-col__title">Additional</div>
            <ul>${colLinks(ADDITIONAL_NAV)}</ul>
          </div>
          <div class="footer-col">
            <div class="footer-col__title">Connect</div>
            <ul>
              <li><a href="mailto:${SITE.email}">${SITE.email}</a></li>
              <li><a href="tel:${SITE.phone.replace(/\s/g, "")}">${SITE.phone}</a></li>
              <li><a href="${SITE.instagram}" target="_blank" rel="noopener">Instagram</a></li>
              ${SITE.showSchoolInstagram ? `<li><a href="${SITE.schoolInstagram}" target="_blank" rel="noopener">School Instagram</a></li>` : ""}
              <li><a href="${SITE.youtube}" target="_blank" rel="noopener">YouTube</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <span class="footer-bottom__copy">&copy; ${new Date().getFullYear()} Abhinava Arts Centre. All rights reserved.</span>
          ${renderJagliCredit()}
          <span class="footer-bottom__domain">abhinava.dance</span>
        </div>
      </div>
    </footer>
  `;
}

function initSkipLink() {
  if (document.getElementById("skip-link")) return;
  const main = document.getElementById("content");
  if (!main) return;
  const skip = document.createElement("a");
  skip.id = "skip-link";
  skip.className = "skip-link";
  skip.href = "#content";
  skip.textContent = "Skip to content";
  skip.addEventListener("click", (e) => {
    e.preventDefault();
    main.focus({ preventScroll: false });
  });
  document.body.insertBefore(skip, document.body.firstChild);
}

/* ── 5. Menu drawer ─────────────────────────────────────────────────────── */
/* The drawer and backdrop are mounted on <body> by initChrome(), never inside the header. */

let logoMenuRewindTimer = 0;
let logoMenuRewindToken = 0;

function isMobileNavOpen() {
  const nav = document.getElementById("mobile-nav");
  return !!(nav && nav.classList.contains("open"));
}

function setMobileNav(open, { animate = true } = {}) {
  const nav = document.getElementById("mobile-nav");
  const backdrop = document.getElementById("mobile-nav-backdrop");
  const toggle = document.getElementById("nav-toggle");
  if (!nav) return;

  const wasOpen = nav.classList.contains("open");
  const stateChanged = open !== wasOpen;

  nav.classList.toggle("open", open);
  nav.setAttribute("aria-hidden", open ? "false" : "true");
  if (backdrop) backdrop.classList.toggle("open", open);
  if (toggle) {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    toggle.innerHTML = open ? iconSvg("close", "Close") : iconSvg("menu", "Menu");
  }
  document.body.classList.toggle("nav-open", open);

  const applyLogoState = () => {
    const header = document.getElementById("site-header");
    if (!header) return;
    if (open) setHeaderLogoStartState(header);
    else refreshHeaderScrollState();
  };

  const reducedMotion = !animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const header = document.getElementById("site-header");

  if (stateChanged && header && !reducedMotion) {
    const token = ++logoMenuRewindToken;
    window.clearTimeout(logoMenuRewindTimer);
    header.classList.add("logo-menu-rewind");
    requestAnimationFrame(() => {
      if (token !== logoMenuRewindToken) return;
      requestAnimationFrame(() => {
        if (token !== logoMenuRewindToken) return;
        applyLogoState();
      });
    });
    logoMenuRewindTimer = window.setTimeout(() => {
      if (token !== logoMenuRewindToken) return;
      header.classList.remove("logo-menu-rewind");
    }, LOGO_MENU_REWIND_MS);
  } else if (stateChanged) {
    logoMenuRewindToken += 1;
    window.clearTimeout(logoMenuRewindTimer);
    header?.classList.remove("logo-menu-rewind");
    applyLogoState();
  }
}

/* Delegated events: bound once on document, so they keep working
   no matter when or how the header/drawer markup is (re)rendered. */
document.addEventListener("click", (e) => {
  if (!e.target || !e.target.closest) return;
  if (e.target.closest("#nav-toggle")) {
    e.preventDefault();
    setMobileNav(!isMobileNavOpen());
    return;
  }
  if (e.target.closest("#mobile-nav-backdrop")) {
    setMobileNav(false);
    return;
  }
  if (e.target.closest("#mobile-nav a")) {
    setMobileNav(false);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isMobileNavOpen()) setMobileNav(false);
});

/* Reset stuck state on back/forward cache restores */
window.addEventListener("pageshow", (e) => {
  if (e.persisted) setMobileNav(false, { animate: false });
});

/* ── 6. Header on scroll ────────────────────────────────────────────────── */

function setHeaderLogoVars(header, t) {
  const progress = Math.min(1, Math.max(0, t));
  const eased = easeInOutCubic(progress);
  const scale = LOGO_TRANSFORM_START + eased * (LOGO_TRANSFORM_END - LOGO_TRANSFORM_START);
  header.style.setProperty("--logo-scale", String(scale));
  header.style.setProperty("--logo-lift", `${LOGO_LIFT_END_PX * eased}px`);
  header.style.setProperty("--logo-start-shift", `${LOGO_START_SHIFT_PX * (1 - eased)}px`);
  header.style.setProperty("--logo-a-mix", String(eased));
}

function setHeaderLogoEndState(header) {
  setHeaderLogoVars(header, 1);
}

function setHeaderLogoStartState(header) {
  setHeaderLogoVars(header, 0);
}

function setHeaderSolidState(header) {
  header.classList.add("scrolled");
  header.classList.remove("is-ivorying");
  header.style.removeProperty("--header-ivory-alpha");
  header.style.removeProperty("--header-border-alpha");
  header.style.removeProperty("--header-shadow-alpha");
  setHeaderLogoEndState(header);
}

function refreshHeaderScrollState() {
  const header = document.getElementById("site-header");
  if (!header || isMobileNavOpen()) return;
  if (document.body.dataset.headerMode !== "hero") {
    setHeaderSolidState(header);
    return;
  }
  const hero = getPageHero();
  if (!hero) {
    setHeaderSolidState(header);
    return;
  }
  updateHeaderIvoryState(header, hero);
}

function heroTextHeaderProgress(hero) {
  const body = hero.querySelector(".v-hero__body");
  if (!body) return 0;
  const headerH = headerHeightPx();
  const bodyTop = body.getBoundingClientRect().top;
  const start = headerH + HEADER_IVORY_FADE_DISTANCE_PX;
  if (bodyTop >= start) return 0;
  if (bodyTop <= headerH + 1) return 1;
  return Math.min(1, Math.max(0, (start - bodyTop) / HEADER_IVORY_FADE_DISTANCE_PX));
}

function updateHeaderIvoryState(header, hero) {
  const t = heroTextHeaderProgress(hero);

  header.classList.toggle("scrolled", t >= 1);
  header.classList.toggle("is-ivorying", t > 0.55);
  header.style.setProperty("--header-ivory-alpha", String(t * 0.96));
  header.style.setProperty("--header-border-alpha", String(t));
  header.style.setProperty("--header-shadow-alpha", String(t * 0.12));
  setHeaderLogoVars(header, t);
}

/* ── 7. Hero on scroll ──────────────────────────────────────────────────── */

function heroScrollDepth(hero, rect = hero.getBoundingClientRect()) {
  return Math.max(0, -rect.top - headerHeightPx());
}

/** Image FX window: starts at 30% scroll depth; ends when hero bottom meets header base. */
function heroMediaFxProgress(hero) {
  const headerH = headerHeightPx();
  const rect = hero.getBoundingClientRect();
  const heroHeight = hero.offsetHeight;
  const depth = heroScrollDepth(hero, rect);
  const startAt = heroHeight * HERO_MEDIA_FX_START;
  if (depth <= startAt) return 0;

  const endBottom = headerH;
  const { bottom } = rect;
  if (bottom <= endBottom) return 1;

  const startBottom = heroHeight - headerH - startAt;
  const range = startBottom - endBottom;
  if (range <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - (bottom - endBottom) / range));
}

function heroBodyBlurProgress(body) {
  const headerH = headerHeightPx();
  const bodyTop = body.getBoundingClientRect().top;
  if (bodyTop > headerH + 1) return 0;
  const ramp = Math.max(body.offsetHeight, 120);
  return Math.min(1, (headerH - bodyTop) / ramp);
}

function updateHeroScrollFx(hero) {
  const mediaT = heroMediaFxProgress(hero);
  const blurT = mediaT > 0 ? mediaT * HERO_MEDIA_BLUR_AT_END : 0;
  const body = hero.querySelector(".v-hero__body");
  const bodyT = body ? heroBodyBlurProgress(body) : 0;
  const hasFx = mediaT > 0 || bodyT > 0;

  hero.classList.toggle("v-hero--scroll-fx", hasFx);
  hero.classList.toggle("v-hero--media-fx", mediaT > 0);
  hero.classList.toggle("v-hero--body-fx", bodyT > 0);

  if (mediaT > 0) {
    hero.style.setProperty("--hero-media-scale", String(1 + mediaT * HERO_MEDIA_SCALE_MAX));
    hero.style.setProperty("--hero-media-blur", `${blurT * HERO_MEDIA_BLUR_MAX_PX}px`);
  } else {
    hero.style.removeProperty("--hero-media-scale");
    hero.style.removeProperty("--hero-media-blur");
  }

  if (bodyT > 0) {
    hero.style.setProperty("--hero-body-blur", `${bodyT * HERO_BODY_BLUR_MAX_PX}px`);
  } else {
    hero.style.removeProperty("--hero-body-blur");
  }
}

/* ── 8. Scroll loop ─────────────────────────────────────────────────────── */

let scrollFxBound = false;
let scrollFxRaf = 0;

function tickScrollFx() {
  scrollFxRaf = 0;
  const header = document.getElementById("site-header");
  const hero = getPageHero();
  const mode = document.body.dataset.headerMode || "solid";

  if (header && mode === "hero" && hero && !isMobileNavOpen()) {
    updateHeaderIvoryState(header, hero);
  }

  if (hero && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    updateHeroScrollFx(hero);
  }

  /* A page opened part-way down is measured the first time it is back at the top */
  if (!logoAMeasured && window.scrollY <= 4) setLogoAStartColour();
}

let logoAMeasured = false;
let logoAResizeTimer = 0;

/** The A of the logo starts in a colour that reads on the hero picture behind it: almost white over a dark
 *  area, the logo's own grey over a light one. Measured once from the picture under the A (and again on resize). */
function setLogoAStartColour() {
  const header = document.getElementById("site-header");
  const hero = getPageHero();
  const a = header?.querySelector(".site-logo__a");
  const img = hero?.querySelector(".v-hero__media img");
  if (!header || !a || !img || window.scrollY > 4) return;
  logoAMeasured = true;
  const measure = () => {
    if (!img.naturalWidth) return;
    const r = img.getBoundingClientRect();
    const logo = a.getBoundingClientRect();
    if (!r.width || !logo.width) return;
    /* The A's own area inside the logo (from the logo drawing: x 100–131, y 41–78 of 196 × 227.5) */
    const box = {
      left: logo.left + logo.width * (100 / 196.1),
      top: logo.top + logo.height * (41 / 227.5),
      width: logo.width * (31 / 196.1),
      height: logo.height * (37 / 227.5),
    };
    const cs = getComputedStyle(img);
    const [px, py] = (cs.objectPosition || "50% 50%").split(" ").map((v) => (parseFloat(v) || 50) / 100);
    const scale = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const offX = (r.width - img.naturalWidth * scale) * px;
    const offY = (r.height - img.naturalHeight * scale) * py;
    const sx = Math.max(0, (box.left - r.left - offX) / scale);
    const sy = Math.max(0, (box.top - r.top - offY) / scale);
    const sw = Math.min(img.naturalWidth - sx, box.width / scale);
    const sh = Math.min(img.naturalHeight - sy, box.height / scale);
    if (sw <= 0 || sh <= 0) return;
    try {
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 16, 16);
      const d = ctx.getImageData(0, 0, 16, 16).data;
      let lum = 0;
      for (let i = 0; i < d.length; i += 4) lum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      lum /= d.length / 4;
      /* The soft white glow behind the logo lightens what the eye sees under the A */
      const halo = header.querySelector(".site-logo__halo");
      if (halo) {
        const h = halo.getBoundingClientRect();
        const hs = getComputedStyle(halo);
        const alphaOf = (v) => parseFloat((v.match(/rgba?\([^)]*,\s*([\d.]+)\)/) || [])[1] || "0");
        const stops = [
          [0, alphaOf(hs.getPropertyValue("--logo-glow-a"))],
          [0.32, alphaOf(hs.getPropertyValue("--logo-glow-b"))],
          [0.5, alphaOf(hs.getPropertyValue("--logo-glow-c"))],
          [0.68, 0],
        ];
        const radius = h.width * 0.52;
        const dist = Math.hypot(box.left + box.width / 2 - (h.left + h.width / 2), box.top + box.height / 2 - (h.top + h.height / 2));
        const t = dist / radius;
        let glow = 0;
        for (let k = 1; k < stops.length; k++) {
          if (t <= stops[k][0]) {
            const [t0, a0] = stops[k - 1];
            const [t1, a1] = stops[k];
            glow = a0 + ((a1 - a0) * (t - t0)) / (t1 - t0);
            break;
          }
        }
        lum = lum * (1 - glow) + 0.98 * glow;
      }
      /* Whichever reads better: the near-white or the logo's grey (#6b6b6b ≈ 0.42) */
      /* Light A, subdued: a soft pale grey, quieter still over the darkest backgrounds */
      const light = Math.round(255 * Math.min(0.78, 0.64 + 0.25 * lum));
      const lightHex = `rgb(${light}, ${light}, ${Math.round(light * 0.985)})`;
      header.style.setProperty("--logo-a-start", 0.86 - lum > lum - 0.42 ? lightHex : "#6b6b6b");
    } catch {
      /* picture not readable: keep the default */
    }
  };
  if (img.complete) measure();
  else img.addEventListener("load", measure, { once: true });
}

function scheduleScrollFx() {
  if (scrollFxRaf) return;
  scrollFxRaf = requestAnimationFrame(tickScrollFx);
}

function initScrollFx() {
  const header = document.getElementById("site-header");
  if (!header) return;

  const mode = document.body.dataset.headerMode || "solid";
  const hero = getPageHero();
  if (mode !== "hero" || !hero) setHeaderSolidState(header);

  if (!scrollFxBound) {
    scrollFxBound = true;
    window.addEventListener("scroll", scheduleScrollFx, { passive: true });
    window.addEventListener("resize", scheduleScrollFx, { passive: true });
    /* The A is measured again once resizing settles, not on every resize event */
    window.addEventListener(
      "resize",
      () => {
        window.clearTimeout(logoAResizeTimer);
        logoAResizeTimer = window.setTimeout(() => {
          logoAMeasured = false;
          setLogoAStartColour();
        }, 150);
      },
      { passive: true },
    );
  }

  scheduleScrollFx();
  setLogoAStartColour();
}

/* ── 9. Start-up ────────────────────────────────────────────────────────── */

function initChrome() {
  const headerSlot = document.getElementById("site-header");
  const footerSlot = document.getElementById("site-footer");
  if (headerSlot) headerSlot.outerHTML = renderHeader();
  if (footerSlot) footerSlot.outerHTML = renderFooter();

  /* Remove any stale drawer (double init, cached markup), then mount fresh on body */
  ["mobile-nav", "mobile-nav-backdrop"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.parentNode.removeChild(el);
  });
  document.body.insertAdjacentHTML("beforeend", renderMobileNav());
  document.body.classList.remove("nav-open");

  initSkipLink();

  const hero = getPageHero();
  document.body.dataset.headerMode = hero ? "hero" : "solid";
  initScrollFx();
}

/* Shared global for optional page scripts */
if (typeof window !== "undefined") {
  window.SITE = SITE;
}
