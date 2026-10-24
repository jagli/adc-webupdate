/**
 * Press photos picker (About → Press Kit → Photos & Logo).
 * The button lists the photos in data-photo-picker (name, preview, full-size files). A click
 * opens a window of previews; up to 5 can be ticked; "Download" fetches those full-size files
 * and saves them as one zip, made here in the browser (stored, not compressed: the photos are
 * already JPEG), so the site needs no server.
 */
(function () {
  "use strict";

  const MAX = 5;

  /* ── a minimal zip writer ── */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    files.forEach(({ name, data }) => {
      const n = enc.encode(name), crc = crc32(data), size = data.length;
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint32(14, crc, true); local.setUint32(18, size, true); local.setUint32(22, size, true);
      local.setUint16(26, n.length, true);
      const dir = new DataView(new ArrayBuffer(46));
      dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint16(8, 0x0800, true);
      dir.setUint32(16, crc, true); dir.setUint32(20, size, true); dir.setUint32(24, size, true);
      dir.setUint16(28, n.length, true); dir.setUint32(42, offset, true);
      parts.push(local, n, data);
      central.push(dir, n);
      offset += 30 + n.length + size;
    });
    const dirSize = central.reduce((a, p) => a + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, dirSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }

  function init(button) {
    let items = [];
    try { items = JSON.parse(button.getAttribute("data-photo-picker")); } catch (e) { return; }
    if (!items.length) return;

    const box = document.createElement("div");
    box.className = "photo-picker";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Choose press photos");
    box.innerHTML = `
      <div class="photo-picker__panel">
        <div class="photo-picker__head">
          <div><b>Choose up to ${MAX} photos</b><span class="photo-picker__count"></span></div>
          <button type="button" class="photo-picker__close" aria-label="Close">✕</button>
        </div>
        <ul class="photo-picker__grid"></ul>
        <div class="photo-picker__foot">
          <span class="photo-picker__note">Full-size files, for print and press use. Please credit Abhinava Dance Company.</span>
          <button type="button" class="btn btn--gold photo-picker__go" disabled>Download</button>
        </div>
      </div>`;
    document.body.appendChild(box);
    const grid = box.querySelector(".photo-picker__grid");
    const count = box.querySelector(".photo-picker__count");
    const go = box.querySelector(".photo-picker__go");

    items.forEach((it, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<label class="photo-picker__item"><input type="checkbox" value="${i}"><img loading="lazy" alt=""><span></span></label>`;
      li.querySelector("img").src = it.thumb;
      li.querySelector("img").alt = it.name;
      li.querySelector("span").textContent = it.name;
      grid.appendChild(li);
    });
    const boxes = [...grid.querySelectorAll("input")];

    function update() {
      const n = boxes.filter((b) => b.checked).length;
      count.textContent = ` — ${n} of ${MAX} chosen (${items.length} to choose from)`;
      boxes.forEach((b) => { b.disabled = !b.checked && n >= MAX; b.closest(".photo-picker__item").classList.toggle("is-off", b.disabled); });
      go.disabled = n === 0;
      go.textContent = n ? `Download ${n} as a zip` : "Download";
    }
    boxes.forEach((b) => b.addEventListener("change", update));

    go.addEventListener("click", async () => {
      const chosen = boxes.filter((b) => b.checked).map((b) => items[Number(b.value)]);
      go.disabled = true;
      go.textContent = "Preparing…";
      try {
        const files = [];
        for (const it of chosen) {
          for (const src of it.files) {
            const r = await fetch(src);
            if (!r.ok) throw new Error(src);
            files.push({ name: "abhinava-press-photos/" + src.split("/").pop(), data: new Uint8Array(await r.arrayBuffer()) });
          }
        }
        const url = URL.createObjectURL(zip(files));
        const a = document.createElement("a");
        a.href = url;
        a.download = "abhinava-press-photos.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        update();
      } catch (e) {
        go.textContent = "Could not download — try again";
        go.disabled = false;
      }
    });

    function open() {
      box.hidden = false;
      document.documentElement.style.overflow = "hidden";
      update();
      box.querySelector(".photo-picker__close").focus();
    }
    function close() {
      box.hidden = true;
      document.documentElement.style.overflow = "";
      button.focus();
    }
    button.addEventListener("click", open);
    box.querySelector(".photo-picker__close").addEventListener("click", close);
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    document.addEventListener("keydown", (e) => { if (!box.hidden && e.key === "Escape") close(); });
  }

  function start() { document.querySelectorAll("[data-photo-picker]").forEach(init); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
