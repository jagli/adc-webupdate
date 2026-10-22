/**
 * Layout of a page tab, and reading it back. Plain functions with no Google calls, so the same
 * code is tested on the developer's computer (webupdate/test/sheet-roundtrip.mjs).
 *
 * Column A (hidden) holds a marker on every structural row:
 *   block|key            a section band            slot|key|kind[|link]   one text/photo/video
 *   listnote|key         the line naming a list    folder|key             optional Drive folder for a list
 *   list|key|columns     a list's header row       row|rowKey             one list row (blank key = new)
 *   gallery|key          the gallery header        grow|                  one gallery row
 * Rows editors insert have an empty column A and belong to the list above them.
 */

function parseKey_(a) {
  var s = String(a || "");
  var i = s.indexOf("|");
  if (i < 0) return { type: s, rest: "" };
  return { type: s.slice(0, i), rest: s.slice(i + 1) };
}

/** The visible columns of a list, from its column list: a photo adds “… description”, a button adds “… link”. */
function expandColumns_(columns) {
  var cols = [];
  columns.forEach(function (c) {
    cols.push({ name: c.what, kind: c.kind });
    if (c.kind === "photo") cols.push({ name: c.what + " description", kind: "text" });
    if (c.link) cols.push({ name: c.what + " link", kind: "text" });
  });
  return cols;
}

function readPageRows_(v, page) {
  var data = { page: page, blocks: [] };
  var block = null, list = null, gallery = null, listName = "", pendingFolder = "";
  for (var r = 0; r < v.length; r++) {
    var row = v[r];
    var k = parseKey_(row[0]);
    if (k.type === "block") {
      block = { key: k.rest, label: String(row[1]).replace(/^■\s*/, ""), slots: [], lists: [] };
      data.blocks.push(block); list = null; gallery = null; continue;
    }
    if (!block) continue;
    if (k.type === "slot") {
      var p = k.rest.split("|");
      var slot = { key: p[0], kind: p[1], what: String(row[1]), value: String(row[2]) };
      if (p[1] === "photo") slot.alt = String(row[3]);
      if (p[2] === "link") slot.href = String(row[3]);
      block.slots.push(slot); list = null; gallery = null; continue;
    }
    if (k.type === "listnote") { list = null; gallery = null; listName = String(row[1]).replace(/^▸\s*/, "").split(" — ")[0]; pendingFolder = ""; continue; }
    if (k.type === "folder") { pendingFolder = String(row[2]).trim(); continue; }
    if (k.type === "list") {
      var lp = k.rest.split("|");
      var columns = JSON.parse(lp.slice(1).join("|"));
      list = { key: lp[0], what: listName || "Items", columns: columns, rows: [], names: expandColumns_(columns).map(function (c) { return c.name; }) };
      if (pendingFolder) list.folder = pendingFolder;
      pendingFolder = ""; listName = "";
      block.lists.push(list); gallery = null; continue;
    }
    if (k.type === "gallery") { gallery = { key: k.rest, rows: [] }; block.gallery = gallery; list = null; continue; }
    if (k.type === "galleryfolder" && gallery) { if (String(row[2]).trim()) gallery.folder = String(row[2]).trim(); continue; }
    if ((k.type === "row" || k.type === "") && list) {
      var cells = {};
      for (var c = 0; c < list.names.length; c++) cells[list.names[c]] = row[c + 2] === "" || row[c + 2] === undefined ? "" : String(row[c + 2]);
      var filled = Object.keys(cells).some(function (x) { return String(cells[x]).trim(); });
      if (!filled) continue;
      list.rows.push({ key: k.rest || ("new-" + r), show: row[1] !== false, cells: cells, sheetRow: r + 1 });
      continue;
    }
    if ((k.type === "grow" || k.type === "") && gallery) {
      if (!String(row[3]).trim()) continue;
      gallery.rows.push({ show: row[1] !== false, type: /video/i.test(row[2]) ? "video" : "image", src: String(row[3]).trim(), shape: /tall/i.test(row[4]) ? "tall" : "wide", caption: String(row[5] || ""), sheetRow: r + 1 });
    }
  }
  data.blocks.forEach(function (b) { b.lists.forEach(function (l) { delete l.names; }); });
  return data;
}

function layoutPage_(pg, data) {
  var rows = [];   // [colA, B, C, …]
  var fmt = [];    // per row: { type, cols, photoCol, checkbox, merge }
  function push(cells, f) { rows.push(cells); fmt.push(f || {}); }
  push(["", pg[1] + " page", "", ""], { type: "title" });
  push(["", "Type in the yellow cells. Each dark band is one part of the page, top to bottom.  Open the page: " + SITE + (pg[0] === "index" ? "" : pg[0] + ".html"), "", ""], { type: "hint" });
  data.blocks.forEach(function (b) {
    push(["block|" + b.key, "■ " + b.label], { type: "band" });
    if (b.slots.length) push(["", "What", "Words / photo / video", "Photo description or link address", "Picture"], { type: "slothead" });
    b.slots.forEach(function (sl) {
      var extra = sl.kind === "photo" ? (sl.alt || "") : sl.href !== undefined ? sl.href : "";
      push(["slot|" + sl.key + "|" + sl.kind + (sl.href !== undefined ? "|link" : ""), sl.kind === "photos" ? "Photos — one per line (Drive links), or one Drive folder link" : sl.what + (sl.href !== undefined ? " (words, then link)" : ""), sl.value, extra, ""], { type: "slot", kind: sl.kind, link: sl.href !== undefined });
    });
    b.lists.forEach(function (l) {
      var cols = expandColumns_(l.columns);
      var photoIdx = -1;
      cols.forEach(function (c, i) { if (photoIdx < 0 && (c.kind === "photo" || c.kind === "photos")) photoIdx = i; });
      var note = l.note || (l.what === "Paragraphs" ? "One row per paragraph." : "One row each. Untick Show to hide. Drag a row by its number to move it. Type in an empty row at the bottom to add one.");
      push(["listnote|" + l.key, "▸ " + l.what + " — " + note], { type: "listnote" });
      if (false) push(["folder|" + l.key, "Drive folder (optional)", "", "Paste a Drive folder link here to use all its photos instead of the rows below (file-name order: 01, 02, …)."], { type: "folder" });
      var head = ["list|" + l.key + "|" + JSON.stringify(l.columns), "Show"].concat(cols.map(function (c) { return c.name; }));
      if (photoIdx >= 0) head.push("Preview");
      push(head, { type: "listhead", cols: cols.length });
      l.rows.forEach(function (r) {
        push(["row|" + r.key, r.show !== false].concat(cols.map(function (c) { return r.cells[c.name] === undefined ? "" : r.cells[c.name]; })).concat(photoIdx >= 0 ? [""] : []), { type: "row", cols: cols.length, photoCol: photoIdx >= 0 ? 3 + photoIdx : 0, previewCol: photoIdx >= 0 ? 3 + cols.length : 0 });
      });
      for (var k = 0; k < 2; k++) push(["row|", true].concat(cols.map(function () { return ""; })).concat(photoIdx >= 0 ? [""] : []), { type: "row", spare: true, cols: cols.length, photoCol: photoIdx >= 0 ? 3 + photoIdx : 0, previewCol: photoIdx >= 0 ? 3 + cols.length : 0 });
    });
    if (b.gallery) {
      push(["galleryfolder|" + b.gallery.key, "Drive folder (optional)", "", "Paste a Drive folder link to add all its photos at the end of the gallery."], { type: "folder" });
      push(["gallery|" + b.gallery.key, "Show", "Type", "Photo or YouTube link", "Shape", "Caption", "Preview"], { type: "listhead", cols: 5 });
      b.gallery.rows.forEach(function (g) {
        push(["grow|", g.show !== false, g.type === "video" ? "Video" : "Photo", g.src, g.shape === "tall" ? "Tall" : "Wide", g.caption || "", ""], { type: "grow" });
      });
      for (var j = 0; j < 3; j++) push(["grow|", true, "Photo", "", "Wide", "", ""], { type: "grow", spare: true });
    }
    push([""], { type: "gap" });
  });
  return { rows: rows, fmt: fmt };
}

