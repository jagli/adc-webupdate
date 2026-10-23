/**
 * Layout of a page tab, and reading it back. Plain functions with no Google calls, so the same
 * code is tested on the developer's computer (webupdate/test/sheet-roundtrip.mjs).
 *
 * The rule editors see: ONE ITEM = ONE ROW. No cell ever holds several items:
 *   - a list inside a card (festivals, clients…) is a group of item rows under the card row
 *   - a photo carousel is a group of photo rows, one photo each, with its picture beside it
 *   - upcoming events are a small table: Date | Event | Details | Ticket link
 * Every row has a Show tick box; hiding is unticking, never deleting.
 *
 * Column A (hidden) holds a marker on every structural row:
 *   block|key              a section band          slot|key|kind[|link]   one text / photo / video
 *   photoset|slotKey|what  a carousel's header     pho|1 / pho|           one carousel photo (1 = existed)
 *   listnote|key           the line naming a list  list|key|columns       a list's header row
 *   row|rowKey             one card / list row     sub|field|1 / sub|field  one item of a card's list
 *   events|key|columns     the events header       ev|rowKey              one event
 *   gallery|key            the gallery header      grow|1 / grow|         one gallery row
 *   galleryfolder|key      optional Drive folder for the gallery
 * Rows added with the panel's “Add below” copy the marker of the row they were added from.
 * A row an editor inserts by hand (empty column A) belongs to the group above it.
 */

function parseKey_(a) {
  var s = String(a || "");
  var i = s.indexOf("|");
  if (i < 0) return { type: s, rest: "" };
  return { type: s.slice(0, i), rest: s.slice(i + 1) };
}

/** Columns that hold several items in one value (a card's list, a carousel inside a card). */
function isMulti_(kind) { return kind === "lines" || kind === "photos"; }

/** The visible columns of a list: a photo adds “… description”, a button adds “… link”. */
function expandColumns_(columns) {
  var cols = [];
  columns.forEach(function (c) {
    cols.push({ name: c.what, kind: c.kind });
    if (c.kind === "photo") cols.push({ name: c.what + " description", kind: "text" });
    if (c.link) cols.push({ name: c.what + " link", kind: "text" });
  });
  return cols;
}

function splitLines_(v) {
  return String(v === undefined || v === null ? "" : v).split(/\r?\n/).filter(function (x) { return String(x).trim() !== ""; });
}

/* ── upcoming events: one light-text line ⇄ Date | Event | Details | Ticket link ── */

var EVENTS_LIST = "performances/upcoming-list/1";
var EVENT_COLUMNS = ["Date", "Event", "Details", "Ticket link"];
var MONTHS_ = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function eventSplit_(light) {
  var s = String(light || "");
  var m = /^\*\*([^*]+)\*\*\s*—\s*([\s\S]*)$/.exec(s);
  if (!m) return { Date: "", Event: "", Details: s, "Ticket link": "" };
  var rest = m[2], ticket = "";
  var t = /\s*·\s*\[Tickets\]\(([^)\s]+)\)\s*$/.exec(rest);
  if (t) { ticket = t[1]; rest = rest.slice(0, t.index); }
  var n = /^\*([^*]+)\*:\s*([\s\S]*)$/.exec(rest);
  return { Date: m[1], Event: n ? n[1] : "", Details: n ? n[2] : rest, "Ticket link": ticket };
}

/** A date cell may come back from Google as a date: show it as 8 Jan 2027. */
function eventDate_(v) {
  if (v && typeof v === "object" && typeof v.getFullYear === "function") return v.getDate() + " " + MONTHS_[v.getMonth()] + " " + v.getFullYear();
  return String(v === undefined || v === null ? "" : v).trim();
}

function eventJoin_(e) {
  var date = eventDate_(e.Date), name = String(e.Event || "").trim(), details = String(e.Details || "").trim(), ticket = String(e["Ticket link"] || "").trim();
  if (!date && !name && !details && !ticket) return "";
  return (date ? "**" + date + "** — " : "") + (name ? "*" + name + "*" + (details ? ": " : "") : "") + details + (ticket ? " · [Tickets](" + ticket + ")" : "");
}

/* ── reading a page tab back into content ── */

function readPageRows_(v, page) {
  var data = { page: page, blocks: [], problems: [] };
  var block = null, list = null, card = null, gallery = null, photoset = null, events = null, listName = "";
  function endGroups() { list = null; card = null; gallery = null; photoset = null; events = null; }
  function warnEmpty(r, what) { data.problems.push("row " + (r + 1) + " (" + what + ") is empty — to remove something, untick Show instead of clearing it (or use Edit ▸ Undo)"); }
  for (var r = 0; r < v.length; r++) {
    var row = v[r];
    var k = parseKey_(row[0]);
    if (k.type === "block") {
      block = { key: k.rest, label: String(row[1]).replace(/^■\s*/, ""), slots: [], lists: [] };
      data.blocks.push(block); endGroups(); continue;
    }
    if (!block) continue;
    if (k.type === "slot") {
      endGroups();
      var p = k.rest.split("|");
      var slot = { key: p[0], kind: p[1], what: String(row[1]), value: String(row[2]) };
      if (p[1] === "photo") slot.alt = String(row[3]);
      if (p[2] === "link") slot.href = String(row[3]);
      block.slots.push(slot); continue;
    }
    if (k.type === "photoset") {
      endGroups();
      var ps = k.rest.split("|");
      photoset = { key: ps[0], kind: "photos", what: ps.slice(1).join("|") || "Photos (one per line)", value: "", items: [] };
      block.slots.push(photoset); continue;
    }
    if ((k.type === "pho" || k.type === "") && photoset) {
      var pv = String(row[2] === undefined ? "" : row[2]).trim();
      if (!pv) { if (k.rest) warnEmpty(r, "a photo"); continue; }
      if (row[1] !== false) photoset.items.push(pv);
      continue;
    }
    if (k.type === "listnote") { endGroups(); listName = String(row[1]).replace(/^▸\s*/, "").split(" — ")[0]; continue; }
    if (k.type === "list") {
      endGroups();
      var lp = k.rest.split("|");
      var columns = JSON.parse(lp.slice(1).join("|"));
      list = { key: lp[0], what: listName || "Items", columns: columns, rows: [], names: expandColumns_(columns).map(function (c) { return c.name; }) };
      listName = "";
      block.lists.push(list); continue;
    }
    if (k.type === "events") {
      endGroups();
      var ep = k.rest.split("|");
      events = { key: ep[0], what: listName || "Upcoming shows", columns: JSON.parse(ep.slice(1).join("|")), rows: [] };
      listName = "";
      block.lists.push(events); continue;
    }
    if ((k.type === "ev" || k.type === "") && events) {
      var e = {}; for (var ec = 0; ec < EVENT_COLUMNS.length; ec++) e[EVENT_COLUMNS[ec]] = row[ec + 2];
      var item = eventJoin_(e);
      if (!item) { if (k.rest) warnEmpty(r, "an event"); continue; }
      events.rows.push({ key: k.rest || ("new-" + r), show: row[1] !== false, cells: { Item: item }, sheetRow: r + 1 });
      continue;
    }
    if (k.type === "sub" && list) {
      var sp = k.rest.split("|"), field = sp[0];
      var col = list.names.indexOf(field);
      var sv = col < 0 ? "" : String(row[col + 2] === undefined ? "" : row[col + 2]).trim();
      if (!card) continue;
      if (!sv) { if (sp[1]) warnEmpty(r, "an item of " + (card.title || "a card")); continue; }
      if (row[1] !== false) (card.multi[field] = card.multi[field] || []).push(sv);
      card.multiSeen[field] = true;
      continue;
    }
    if ((k.type === "row" || k.type === "") && list) {
      var cells = {};
      for (var c = 0; c < list.names.length; c++) cells[list.names[c]] = row[c + 2] === "" || row[c + 2] === undefined ? "" : String(row[c + 2]);
      var filled = Object.keys(cells).some(function (x) { return String(cells[x]).trim(); });
      if (!filled && !k.rest) { card = null; continue; }
      card = { key: k.rest || ("new-" + r), show: row[1] !== false, cells: cells, sheetRow: r + 1, multi: {}, multiSeen: {}, title: String(row[2] || "").replace(/\*/g, "").slice(0, 40) };
      if (!filled) warnEmpty(r, "a row of " + list.what);
      list.rows.push(card);
      continue;
    }
    if (k.type === "gallery") { endGroups(); gallery = { key: k.rest, rows: [] }; block.gallery = gallery; continue; }
    if (k.type === "galleryfolder") { if (String(row[2]).trim()) (block.galleryFolder = String(row[2]).trim()); continue; }
    if ((k.type === "grow" || k.type === "") && gallery) {
      if (!String(row[3]).trim()) { if (k.rest) warnEmpty(r, "a gallery photo or video"); continue; }
      gallery.rows.push({ show: row[1] !== false, type: /video/i.test(row[2]) ? "video" : "image", src: String(row[3]).trim(), shape: /tall/i.test(row[4]) ? "tall" : "wide", caption: String(row[5] || ""), sheetRow: r + 1 });
    }
  }
  // put the item rows back into their cards and carousels
  data.blocks.forEach(function (b) {
    if (b.gallery && b.galleryFolder) { b.gallery.folder = b.galleryFolder; }
    delete b.galleryFolder;
    b.slots.forEach(function (s) { if (s.items) { s.value = s.items.join("\n"); delete s.items; } });
    b.lists.forEach(function (l) {
      var multi = (l.columns || []).filter(function (c) { return isMulti_(c.kind); }).map(function (c) { return c.what; });
      l.rows.forEach(function (row) {
        multi.forEach(function (f) {
          var typed = splitLines_(row.cells[f]); // something typed straight into the card row is kept as items
          var items = (row.multi && row.multi[f]) || [];
          if (typed.length || items.length || (row.multiSeen && row.multiSeen[f])) row.cells[f] = typed.concat(items).join("\n");
        });
        delete row.multi; delete row.multiSeen; delete row.title;
      });
      delete l.names;
    });
  });
  return data;
}

/* ── laying a page tab out from content ── */

function layoutPage_(pg, data) {
  var rows = [];   // [colA, B, C, …]
  var fmt = [];    // per row: { type, … } for Setup's formatting
  function push(cells, f) { rows.push(cells); fmt.push(f || {}); }
  push(["", pg[1] + " page", "", ""], { type: "title" });
  push(["", "Type in the yellow cells only. One item = one row. Use the Website panel to add, move or hide rows.  Page: " + SITE + (pg[0] === "index" ? "" : pg[0] + ".html"), "", ""], { type: "hint" });
  data.blocks.forEach(function (b) {
    push(["block|" + b.key, "■ " + b.label], { type: "band" });
    var plain = b.slots.filter(function (s) { return s.kind !== "photos"; });
    if (plain.length) push(["", "What", "Words / photo / video", "Photo description or link address", "Picture"], { type: "slothead" });
    b.slots.forEach(function (sl) {
      if (sl.kind === "photos") {
        push(["", "▸ Photos — one row per photo. Paste a Drive link to add one; untick Show to hide one."], { type: "listnote" });
        push(["photoset|" + sl.key + "|" + sl.what, "Show", "Photo (Drive link)", "", "Picture"], { type: "listhead", cols: 1 });
        splitLines_(sl.value).forEach(function (line) { push(["pho|1", true, line, "", ""], { type: "pho", photoCol: 3, previewCol: 5 }); });
        return;
      }
      var extra = sl.kind === "photo" ? (sl.alt || "") : sl.href !== undefined ? sl.href : "";
      push(["slot|" + sl.key + "|" + sl.kind + (sl.href !== undefined ? "|link" : ""), sl.what + (sl.href !== undefined ? " (words, then link)" : ""), sl.value, extra, ""], { type: "slot", kind: sl.kind, link: sl.href !== undefined });
    });
    b.lists.forEach(function (l) {
      if (l.key === EVENTS_LIST) {
        push(["listnote|" + l.key, "▸ Upcoming shows — one row per event. Date like 8 Jan 2027. The website sorts them by date and hides past ones by itself."], { type: "listnote" });
        push(["events|" + l.key + "|" + JSON.stringify(l.columns), "Show"].concat(EVENT_COLUMNS), { type: "listhead", cols: 4 });
        l.rows.forEach(function (r) {
          var e = eventSplit_(r.cells.Item);
          push(["ev|" + r.key, r.show !== false].concat(EVENT_COLUMNS.map(function (c) { return e[c]; })), { type: "ev", cols: 4 });
        });
        return;
      }
      var cols = expandColumns_(l.columns);
      var photoIdx = -1;
      cols.forEach(function (c, i) { if (photoIdx < 0 && (c.kind === "photo" || c.kind === "photos")) photoIdx = i; });
      var multiCols = cols.filter(function (c) { return isMulti_(c.kind); });
      var note = l.note || (l.what === "Paragraphs" ? "One row per paragraph." : "One row each. Untick Show to hide.") + (multiCols.length ? " The lighter rows under a row are its own list, one item per row." : "");
      push(["listnote|" + l.key, "▸ " + l.what + " — " + note], { type: "listnote" });
      var head = ["list|" + l.key + "|" + JSON.stringify(l.columns), "Show"].concat(cols.map(function (c) { return c.name; }));
      if (photoIdx >= 0) head.push("Picture");
      push(head, { type: "listhead", cols: cols.length });
      l.rows.forEach(function (r) {
        push(["row|" + r.key, r.show !== false].concat(cols.map(function (c) { return isMulti_(c.kind) || r.cells[c.name] === undefined ? "" : r.cells[c.name]; })).concat(photoIdx >= 0 ? [""] : []),
          { type: "row", cols: cols.length, photoCol: photoIdx >= 0 && !isMulti_(cols[photoIdx].kind) ? 3 + photoIdx : 0, previewCol: photoIdx >= 0 ? 3 + cols.length : 0, multiCols: multiCols.map(function (c) { return 3 + cols.indexOf(c); }) });
        multiCols.forEach(function (mc) {
          var ci = cols.indexOf(mc);
          splitLines_(r.cells[mc.name]).forEach(function (item) {
            var cells = ["sub|" + mc.name + "|1", true];
            for (var i = 0; i < cols.length; i++) cells.push(i === ci ? item : "");
            if (photoIdx >= 0) cells.push("");
            push(cells, { type: "sub", cols: cols.length, itemCol: 3 + ci, photoCol: mc.kind === "photos" ? 3 + ci : 0, previewCol: mc.kind === "photos" && photoIdx >= 0 ? 3 + cols.length : 0 });
          });
        });
      });
    });
    if (b.gallery) {
      push(["galleryfolder|" + b.gallery.key, "Drive folder (optional)", "", "Paste a Drive folder link to add all its photos at the end of the gallery."], { type: "folder" });
      push(["gallery|" + b.gallery.key, "Show", "Type", "Photo or YouTube link", "Shape", "Caption", "Picture"], { type: "listhead", cols: 5 });
      b.gallery.rows.forEach(function (g) {
        push(["grow|1", g.show !== false, g.type === "video" ? "Video" : "Photo", g.src, g.shape === "tall" ? "Tall" : "Wide", g.caption || "", ""], { type: "grow" });
      });
    }
    push([""], { type: "gap" });
  });
  return { rows: rows, fmt: fmt };
}

/* ── the panel's row tools: which rows move together ── */

/**
 * For row r (0-based) in a tab's column-A markers, the unit that moves together and its neighbours.
 * A card moves with its item rows; an item, a photo, an event or a gallery row moves alone, and only
 * among rows of its own group. Returns null for rows that are not part of a list.
 */
function rowUnit_(marks, r) {
  var t = function (i) { return i >= 0 && i < marks.length ? parseKey_(marks[i]) : { type: "#", rest: "" }; };
  var k = t(r);
  if (k.type === "pf" || k.type === "pgap") { while (r > 0 && (t(r).type === "pf" || t(r).type === "pgap")) r--; k = t(r); if (k.type !== "prod") return null; }
  if (k.type === "prod") {
    var cardEnd = function (s) { var e = s; while (t(e + 1).type === "pf" || t(e + 1).type === "pgap") e++; return e; };
    var e0 = cardEnd(r), pv = null, j = r - 1;
    while (t(j).type === "pf" || t(j).type === "pgap") j--;
    if (t(j).type === "prod") pv = { start: j, end: cardEnd(j) };
    return { start: r, end: e0, kind: "prod", prev: pv, next: t(e0 + 1).type === "prod" ? { start: e0 + 1, end: cardEnd(e0 + 1) } : null };
  }
  var lone = { pho: 1, ev: 1, grow: 1 };
  if (k.type === "sub") {
    var field = k.rest.split("|")[0];
    var same = function (i) { var x = t(i); return x.type === "sub" && x.rest.split("|")[0] === field; };
    return { start: r, end: r, kind: "sub", field: field, prev: same(r - 1) ? { start: r - 1, end: r - 1 } : null, next: same(r + 1) ? { start: r + 1, end: r + 1 } : null };
  }
  if (lone[k.type]) {
    var sameType = function (i) { return t(i).type === k.type; };
    return { start: r, end: r, kind: k.type, prev: sameType(r - 1) ? { start: r - 1, end: r - 1 } : null, next: sameType(r + 1) ? { start: r + 1, end: r + 1 } : null };
  }
  if (k.type === "row") {
    var unitEnd = function (s) { var e = s; while (t(e + 1).type === "sub") e++; return e; };
    var end = unitEnd(r);
    var prev = null, i = r - 1;
    while (t(i).type === "sub") i--;
    if (t(i).type === "row") prev = { start: i, end: unitEnd(i) };
    var next = t(end + 1).type === "row" ? { start: end + 1, end: unitEnd(end + 1) } : null;
    return { start: r, end: end, kind: "row", prev: prev, next: next };
  }
  return null;
}

/* ── Productions: one card per production, going down the page ──
 *   prod|1   [Show ☑]  Production   <name>
 *   pf|Label           Label        <value>      (one row per detail)
 *   pgap                                          (space between cards)
 */
var PRODUCTION_FIELDS = ["Label", "Length", "Artists", "Style", "About", "Performers", "Director", "Music", "Lighting", "Availability", "Poster", "Media folder", "Videos"];

function layoutProductions_(list) {
  var rows = [], fmt = [];
  var push = function (r, f) { rows.push(r); fmt.push(f); };
  push(["", "Productions — the poster wall on the Performances page", "", "", ""], { type: "title" });
  push(["", "One card per production, in the order they appear on the site. Type in the yellow cells. Click a card, then use the Website panel to move, add or hide it.", "", "", ""], { type: "hint" });
  list.forEach(function (p) {
    push(["prod|1", !/^no$/i.test(String(p.Show || "Yes")), "Production", p.Production || "", ""], { type: "prod" });
    PRODUCTION_FIELDS.forEach(function (f) { push(["pf|" + f, "", f, p[f] || "", ""], { type: "pf", poster: f === "Poster" }); });
    push(["pgap", "", "", "", ""], { type: "gap" });
  });
  return { rows: rows, fmt: fmt };
}

function readProductions_(v) {
  var out = [], problems = [], cur = null;
  for (var r = 0; r < v.length; r++) {
    var k = parseKey_(v[r][0]);
    if (k.type === "prod") {
      var name = String(v[r][3] === undefined ? "" : v[r][3]).trim();
      cur = { Production: name, Show: v[r][1] === false || /^no$/i.test(String(v[r][1])) ? "No" : "Yes" };
      PRODUCTION_FIELDS.forEach(function (f) { cur[f] = ""; });
      cur._row = r + 1; cur._old = k.rest === "1";
      out.push(cur);
    } else if (k.type === "pf" && cur) {
      var f = k.rest;
      if (PRODUCTION_FIELDS.indexOf(f) >= 0) cur[f] = String(v[r][3] === undefined ? "" : v[r][3]);
    }
  }
  var keep = [];
  out.forEach(function (p) {
    var filled = PRODUCTION_FIELDS.some(function (f) { return String(p[f]).trim(); });
    if (!p.Production) {
      if (p._old) problems.push("row " + p._row + ": the production name is empty — to remove a production, press Hide (or untick Show) instead of clearing it (or use Edit ▸ Undo)");
      else if (filled) problems.push("row " + p._row + ": this new production has no name — type its name next to “Production”");
      return;
    }
    delete p._row; delete p._old;
    keep.push(p);
  });
  return { productions: keep, problems: problems };
}
