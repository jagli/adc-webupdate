/** Instagram galleries — latest posts saved at build time (js/instagram-data.js) */

function igIcon() {
  return typeof ICONS !== "undefined" && ICONS && ICONS.instagram ? ICONS.instagram : "";
}

function renderInstagramGallery(container) {
  if (!container || typeof INSTAGRAM_FEEDS === "undefined") return;
  const feed = INSTAGRAM_FEEDS[container.dataset.instagramGallery || "main"];
  if (!feed || !feed.active || !feed.posts.length) return;
  const icon = igIcon();
  const cards = feed.posts.map(
    (post) => `
    <a class="insta-card" href="${post.url}" target="_blank" rel="noopener noreferrer" aria-label="${post.caption} on Instagram">
      <img src="${post.image}" alt="${post.caption}" loading="lazy">
      <div class="insta-card__overlay">${icon}</div>
    </a>`
  ).join("");

  container.innerHTML = `
    <div class="instagram-header">
      <div>
        <div class="section-head__num" style="color:var(--gold)">Follow Us</div>
        <h2 class="section-head__title" style="color:#fff;text-align:left">@${feed.handle}</h2>
      </div>
      <a href="${feed.url}" target="_blank" rel="noopener" class="btn btn--gold">${icon} View on Instagram</a>
    </div>
    <div class="instagram-grid">${cards}</div>`;
  const section = container.closest(".instagram-section");
  if (section) section.hidden = false;
}

function initInstagram() {
  document.querySelectorAll("[data-instagram-gallery]").forEach(renderInstagramGallery);
}

document.addEventListener("DOMContentLoaded", initInstagram);
