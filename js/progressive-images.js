/**
 * Progressive images — tiny thumb first, web display size after page load.
 * Thumbs: assets/web/thumbs/{client|images}/… (from optimize-web-media.mjs)
 */
(function () {
  "use strict";

  const WEB_PREFIX = "assets/web/";
  const THUMB_PREFIX = "assets/web/thumbs/";
  const enhanced = new WeakSet();

  function thumbSrc(fullSrc) {
    if (!fullSrc || fullSrc.includes("/thumbs/")) return null;
    if (!fullSrc.startsWith(WEB_PREFIX)) return null;
    return THUMB_PREFIX + fullSrc.slice(WEB_PREFIX.length);
  }

  function upgrade(img, fullSrc) {
    const hi = new Image();
    hi.onload = function () {
      img.src = fullSrc;
      img.classList.add("img-progressive--loaded");
    };
    hi.onerror = function () {
      img.classList.add("img-progressive--loaded");
    };
    hi.src = fullSrc;
  }

  /* Full size only for photos that come near the screen: a long page (the gallery) must not
     fetch every full-size photo at once. */
  const near = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          near.unobserve(e.target);
          upgrade(e.target, e.target.dataset.fullSrc);
        });
      }, { rootMargin: "400px 0px" })
    : null;

  function scheduleUpgrade(img, fullSrc) {
    const run = function () {
      if (near) { near.observe(img); return; }
      if ("requestIdleCallback" in window) {
        requestIdleCallback(function () { upgrade(img, fullSrc); }, { timeout: 2500 });
      } else {
        setTimeout(function () { upgrade(img, fullSrc); }, 150);
      }
    };
    if (document.readyState === "complete") run();
    else window.addEventListener("load", run, { once: true });
  }

  function enhanceProgressiveImage(img) {
    if (!img || enhanced.has(img)) return;

    const fullSrc =
      img.dataset.fullSrc ||
      img.getAttribute("data-full-src") ||
      img.getAttribute("src");
    if (
      !fullSrc ||
      !fullSrc.startsWith(WEB_PREFIX) ||
      fullSrc.includes("/thumbs/") ||
      fullSrc.endsWith("manifest.json")
    ) {
      return;
    }

    const thumb = thumbSrc(fullSrc);
    if (!thumb) return;

    enhanced.add(img);
    img.dataset.fullSrc = fullSrc;
    img.classList.add("img-progressive");

    const alreadyThumb = (img.getAttribute("src") || "").includes("/thumbs/");
    if (alreadyThumb) {
      scheduleUpgrade(img, fullSrc);
      return;
    }

    const probe = new Image();
    probe.onload = function () {
      img.src = thumb;
      scheduleUpgrade(img, fullSrc);
    };
    probe.onerror = function () {
      scheduleUpgrade(img, fullSrc);
    };
    probe.src = thumb;
  }

  function initProgressiveImages() {
    document.querySelectorAll('img[src*="assets/web/"]').forEach(enhanceProgressiveImage);

    if ("MutationObserver" in window) {
      const obs = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          m.addedNodes.forEach(function (node) {
            if (node.nodeName === "IMG") enhanceProgressiveImage(node);
            else if (node.querySelectorAll) {
              node.querySelectorAll('img[src*="assets/web/"]').forEach(enhanceProgressiveImage);
            }
          });
        });
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.enhanceProgressiveImage = enhanceProgressiveImage;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProgressiveImages);
  } else {
    initProgressiveImages();
  }
})();
