/** ADC site bootstrap — Phase D
 *  Load order: icons.js → adc-images.js → chrome.js → interactions.js → main.js
 */
function initLayout() {
  // A hidden feature lives in its own folder and is loaded only by its link (#ram); no page links to it
  if (location.hash === "#ram" && !window.adcRamLoaded) {
    window.adcRamLoaded = true;
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "ram/ram.css";
    document.head.append(style);
    const script = document.createElement("script");
    script.src = "ram/ram.js";
    script.onload = script.onerror = initLayout;
    document.head.append(script);
    return;
  }
  if (typeof initChrome === "function") initChrome();
  if (typeof initSubnav === "function") initSubnav();
  if (typeof initCarousels === "function") initCarousels();
  if (typeof initMiniCarousels === "function") initMiniCarousels();
  if (typeof initVideos === "function") initVideos();
  if (typeof initProductions === "function") initProductions();
  if (typeof initAutoMotion === "function") initAutoMotion();
  document.documentElement.classList.add("is-ready");
}

document.addEventListener("DOMContentLoaded", initLayout);
window.addEventListener("hashchange", (e) => {
  if (e.newURL.endsWith("#ram") || e.oldURL.endsWith("#ram")) location.reload();
});
