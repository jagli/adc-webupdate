/**
 * Website ▸ Owner ▸ Set up the Sheet — lays out every tab from the live website's content
 * (content/live.json in the GitHub project). Run it once at the start, and again only after the
 * developer changes a page's layout (it rewrites the page tabs from what is live).
 */

function setupSheet() {
  if (!can_("own")) { SpreadsheetApp.getUi().alert("Only the owner can do this."); return; }
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert("Set up the Sheet", "This writes every tab from what is live on abhinava.dance now. Changes in the Sheet that were not published will be replaced. Continue?", ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  var raw = rawFile_("content/live.json", "main");
  if (!raw) { ui.alert("Could not read the live content from GitHub. Check Website ▸ Owner ▸ Check settings."); return; }
  var content = JSON.parse(raw);
  var ss = SpreadsheetApp.getActive();
  startTab_(ss);
  globalTab_(ss, content.global || {});
  PAGES.forEach(function (pg) { if (content.pages[pg[0]]) pageTab_(ss, pg, content.pages[pg[0]]); });
  productionsTab_(ss, content.productions || []);
  usersSheet_();
  log_("Sheet set up", "All tabs written from the live site");
  // tidy: order of tabs, remove the empty default tab
  var order = ["Start here", "Global"].concat(PAGES.map(function (p) { return p[1]; })).concat(["Productions", "Users", "Log"]);
  order.forEach(function (name, i) { var s = ss.getSheetByName(name); if (s) { ss.setActiveSheet(s); ss.moveActiveSheet(i + 1); } });
  var def = ss.getSheetByName("Sheet1"); if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  ss.setActiveSheet(ss.getSheetByName("Start here"));
  ui.alert("Done. Every tab is ready. Add editors and the moderator in Website ▸ Owner ▸ Users.");
}

function freshSheet_(ss, name) {
  var s = ss.getSheetByName(name);
  if (s) {
    s.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { p.remove(); });
    s.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
    s.clear(); s.clearFormats(); s.clearNotes();
    try { s.getRange(1, 1, s.getMaxRows(), s.getMaxColumns()).breakApart().clearDataValidations(); } catch (e) {}
  } else s = ss.insertSheet(name);
  s.setHiddenGridlines(true);
  return s;
}

function previewFormula_(cellA1) {
  // the first line of the cell: a Drive link, a web address, or a photo already on the site
  var x = 'TRIM(INDEX(SPLIT(' + cellA1 + ',CHAR(10)),1))';
  return '=IF(' + cellA1 + '="","",IFERROR(IMAGE(IF(REGEXMATCH(' + x + ',"drive.google|docs.google"),"https://drive.google.com/thumbnail?sz=w400&id="&REGEXEXTRACT(' + x + ',"[-\\w]{25,}"),IF(REGEXMATCH(' + x + ',"youtu"),"https://img.youtube.com/vi/"&REGEXEXTRACT(' + x + ',"(?:v=|youtu\\.be/|shorts/|embed/)([-\\w]{11})")&"/hqdefault.jpg",IF(REGEXMATCH(' + x + ',"^https?:"),' + x + ',"' + SITE + '"&' + x + '))),1),""))';
}

function colLetter_(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

/* ── Start here ── */
function startTab_(ss) {
  var s = freshSheet_(ss, "Start here");
  var lines = [
    ["ADC Website — how to update it", "title"],
    ["You change the website here, in this Sheet. Nothing goes live until the moderator approves it.", "lead"],
    ["", ""],
    ["1.  Change the words", "step"],
    ["Open the tab of the page (Home, About, …). Each coloured band is one part of the page. Type in the yellow cells only.", ""],
    ["Bold: put two stars around words  **like this**.   Italic: one star  *like this*.   Link: [words](https://address).   New line: Ctrl+Enter (Mac: ⌘+Enter).", "tip"],
    ["", ""],
    ["2.  Change a photo", "step"],
    ["Put the photo in Google Drive ▸ right-click ▸ Share ▸ General access: “Anyone with the link” ▸ Copy link. Paste the link into the photo cell. The picture appears next to it.", ""],
    ["Videos: paste the YouTube link.   Many photos at once (a carousel or the gallery): paste a Drive folder link in the “Drive folder” row; photos appear in file-name order (01, 02, …).", "tip"],
    ["", ""],
    ["3.  Lists (cards, events, people, videos…)", "step"],
    ["One row = one card / item.  Untick “Show” to hide it (nothing is deleted).  To change the order, drag the row by its number on the left.  To add one, type in an empty row at the bottom of the list.", ""],
    ["Upcoming shows: start each with the date in bold, e.g. **8 Jan 2027** — what, where. The site puts them in date order and hides past dates by itself.", "tip"],
    ["", ""],
    ["4.  See it, then send it", "step"],
    ["Website menu ▸ ① Update preview. In about 2 minutes the Website panel shows two links: the change page (only what you changed, with Before/After) and the full preview.", ""],
    ["If something is wrong, the panel says which tab and row, in plain words. Fix it and press Update preview again.", "tip"],
    ["When it looks right: Website ▸ ② Submit for review. The moderator gets an email.", ""],
    ["", ""],
    ["5.  Moderator", "step"],
    ["Website ▸ ③ Review: look at the change page, then Approve & publish (abhinava.dance updates in a few minutes) or Send back with a note.", ""],
    ["", ""],
    ["Do not change", "step"],
    ["The coloured bands, the grey header rows and the tab names. If you do by mistake: Edit ▸ Undo, or ask the owner.", ""]
  ];
  s.getRange(1, 2, lines.length, 1).setValues(lines.map(function (l) { return [l[0]]; })).setWrap(true).setVerticalAlignment("middle");
  s.setColumnWidth(1, 30); s.setColumnWidth(2, 900);
  lines.forEach(function (l, i) {
    var r = s.getRange(i + 1, 2);
    if (l[1] === "title") r.setFontSize(20).setFontWeight("bold").setFontColor(COLORS.title);
    if (l[1] === "lead") r.setFontSize(12).setFontColor(COLORS.note);
    if (l[1] === "step") r.setFontSize(13).setFontWeight("bold").setBackground(COLORS.head);
    if (l[1] === "tip") r.setFontColor(COLORS.note).setFontStyle("italic");
  });
  s.protect().setDescription("Start here — instructions").setWarningOnly(true);
}

/* ── Global ── */
function globalTab_(ss, g) {
  var s = freshSheet_(ss, "Global");
  s.getRange(1, 2).setValue("Global — contact details and links (shown in the footer of every page)").setFontSize(16).setFontWeight("bold").setFontColor(COLORS.title);
  s.getRange(2, 2).setValue("Type in the yellow cells only.").setFontColor(COLORS.note);
  var rows = GLOBAL_FIELDS.map(function (f) { return ["global|" + f[1], f[0], f[1] === "showSchoolInstagram" ? !!g[f[1]] : (g[f[1]] || "")]; });
  var start = 4;
  s.getRange(start, 3, rows.length, 1).setNumberFormat("@");
  s.getRange(start, 1, rows.length, 3).setValues(rows);
  s.getRange(start, 3, rows.length, 1).setBackground(COLORS.edit).setWrap(true);
  s.getRange(start, 2, rows.length, 1).setFontColor(COLORS.note);
  var cb = start + GLOBAL_FIELDS.length - 1;
  s.getRange(cb, 3).setNumberFormat("General").insertCheckboxes().setValue(!!g.showSchoolInstagram);
  s.setColumnWidth(1, 20); s.setColumnWidth(2, 240); s.setColumnWidth(3, 520);
  s.hideColumns(1);
  s.getRange(1, 1, s.getMaxRows(), 1).protect().setDescription("Keys").setWarningOnly(true);
}

/* ── one page tab ── */
function pageTab_(ss, pg, data) {
  var s = freshSheet_(ss, pg[1]);
  var laid = layoutPage_(pg, data), rows = laid.rows, fmt = laid.fmt;
  var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 5);
  var values = rows.map(function (r) { var x = r.slice(); while (x.length < width) x.push(""); return x; });
  // text format first, so dates and numbers stay exactly as typed
  s.getRange(1, 1, values.length, width).setNumberFormat("@");
  // checkboxes and booleans are written after
  var plain = values.map(function (r, i) { return r.map(function (v, c) { return typeof v === "boolean" ? "" : v; }); });
  s.getRange(1, 1, values.length, width).setValues(plain).setVerticalAlignment("top").setWrap(true);
  var bg = [], fc = [], fw = [];
  values.forEach(function (r, i) {
    var f = fmt[i];
    var rb = [], rc = [], rw = [];
    for (var c = 0; c < width; c++) {
      var b = null, color = "#1d2433", w = "normal";
      if (f.type === "band") { b = COLORS.band; color = COLORS.bandText; w = "bold"; }
      else if (f.type === "listnote") { b = COLORS.listNote; color = COLORS.note; }
      else if (f.type === "listhead" || f.type === "slothead") { b = COLORS.head; w = "bold"; color = "#3d3424"; }
      else if (f.type === "slot") { if (c === 1) color = COLORS.note; if (c === 2 || (c === 3 && (f.kind === "photo" || f.link))) b = COLORS.edit; }
      else if (f.type === "row") { if (c >= 2 && c < 2 + f.cols) b = COLORS.edit; }
      else if (f.type === "grow") { if (c >= 2 && c <= 5) b = COLORS.edit; }
      else if (f.type === "folder") { if (c === 1) color = COLORS.note; if (c === 2) b = COLORS.edit; if (c === 3) color = COLORS.note; }
      else if (f.type === "title") { color = COLORS.title; w = "bold"; }
      else if (f.type === "hint") { color = COLORS.note; }
      rb.push(b); rc.push(color); rw.push(w);
    }
    bg.push(rb); fc.push(rc); fw.push(rw);
  });
  s.getRange(1, 1, values.length, width).setBackgrounds(bg).setFontColors(fc).setFontWeights(fw);
  s.getRange(1, 2).setFontSize(18);
  // bands span the width; list notes too
  values.forEach(function (r, i) {
    var f = fmt[i];
    if (f.type === "band" || f.type === "listnote" || f.type === "hint" || f.type === "title") s.getRange(i + 1, 2, 1, width - 1).merge();
    if (f.type === "band") s.setRowHeight(i + 1, 30);
    if (f.type === "listnote") s.getRange(i + 1, 2).setFontStyle("italic");
  });
  // checkboxes (Show), previews and photo row heights — done in runs of neighbouring rows (fast)
  function runs(test) {
    var out = [], start = -1;
    for (var i = 0; i <= values.length; i++) {
      var hit = i < values.length && test(fmt[i], i);
      if (hit && start < 0) start = i;
      if (!hit && start >= 0) { out.push([start, i - 1]); start = -1; }
    }
    return out;
  }
  runs(function (f) { return f.type === "row" || f.type === "grow"; }).forEach(function (r) {
    var n = r[1] - r[0] + 1, range = s.getRange(r[0] + 1, 2, n, 1);
    range.setNumberFormat("General").insertCheckboxes().setHorizontalAlignment("center");
    range.setValues(values.slice(r[0], r[1] + 1).map(function (row) { return [row[1] === true]; }));
  });
  // list rows with a photo column: one preview formula per row, same column within a list
  runs(function (f) { return f.type === "row" && f.photoCol; }).forEach(function (r) {
    var f0 = fmt[r[0]], n = r[1] - r[0] + 1, formulas = [];
    for (var i = r[0]; i <= r[1]; i++) formulas.push([previewFormula_(colLetter_(fmt[i].photoCol) + (i + 1))]);
    s.getRange(r[0] + 1, f0.previewCol, n, 1).setFormulas(formulas);
    s.setRowHeights(r[0] + 1, n, 70);
  });
  runs(function (f) { return f.type === "grow"; }).forEach(function (r) {
    var n = r[1] - r[0] + 1, formulas = [];
    for (var i = r[0]; i <= r[1]; i++) formulas.push(['=IF(OR(D' + (i + 1) + '="",C' + (i + 1) + '="Video"),"",' + previewFormula_("D" + (i + 1)).slice(1) + ')']);
    s.getRange(r[0] + 1, 3, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["Photo", "Video"], true).build());
    s.getRange(r[0] + 1, 5, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["Wide", "Tall"], true).build());
    s.getRange(r[0] + 1, 7, n, 1).setFormulas(formulas);
    s.setRowHeights(r[0] + 1, n, 70);
  });
  values.forEach(function (row, i) {
    var f = fmt[i];
    if (f.type === "slot" && (f.kind === "photo" || f.kind === "photos" || f.kind === "video")) {
      s.getRange(i + 1, 5).setFormula(previewFormula_("C" + (i + 1)));
      s.setRowHeight(i + 1, 70);
    }
  });
  s.setColumnWidth(1, 20); s.setColumnWidth(2, 150); s.setColumnWidth(3, 460); s.setColumnWidth(4, 260); s.setColumnWidth(5, 170);
  for (var c = 6; c <= width; c++) s.setColumnWidth(c, 220);
  s.setFrozenRows(2);
  s.hideColumns(1);
  // the hidden keys warn before they are changed; the visible headers are only labels (the Sheet
  // reads the column names from the hidden keys), so typing over one breaks nothing
  s.getRange(1, 1, s.getMaxRows(), 1).protect().setDescription("Keys — do not change").setWarningOnly(true);
}

/* ── Productions ── */
function productionsTab_(ss, list) {
  var s = freshSheet_(ss, "Productions");
  s.getRange(1, 1).setValue("Productions — the poster wall on the Performances page").setFontSize(16).setFontWeight("bold").setFontColor(COLORS.title);
  s.getRange(2, 1).setValue("One row per production, in the order they appear. Show: Yes or No. Poster: paste a Drive link (portrait 4:5 works best). Drag a row by its number to move it.").setFontColor(COLORS.note);
  var head = PRODUCTION_COLUMNS.concat(["Preview"]);
  s.getRange(3, 1, 1, head.length).setValues([head]).setFontWeight("bold").setBackground(COLORS.head);
  var n = list.length + 5;
  s.getRange(4, 1, n, PRODUCTION_COLUMNS.length).setNumberFormat("@");
  if (list.length) s.getRange(4, 1, list.length, PRODUCTION_COLUMNS.length).setValues(list.map(function (p) { return PRODUCTION_COLUMNS.map(function (c) { return p[c] || ""; }); }));
  s.getRange(4, 1, n, PRODUCTION_COLUMNS.length).setBackground(COLORS.edit).setWrap(true).setVerticalAlignment("top");
  var showCol = PRODUCTION_COLUMNS.indexOf("Show") + 1, posterCol = PRODUCTION_COLUMNS.indexOf("Poster") + 1;
  s.getRange(4, showCol, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["Yes", "No"], true).build());
  var formulas = [];
  for (var i = 0; i < n; i++) formulas.push([previewFormula_(colLetter_(posterCol) + (4 + i))]);
  s.getRange(4, head.length, n, 1).setFormulas(formulas);
  s.setRowHeights(4, n, 70);
  s.setFrozenRows(3); s.setFrozenColumns(1);
  s.setColumnWidth(1, 200);
  for (var c = 2; c <= head.length; c++) s.setColumnWidth(c, c === posterCol ? 260 : 140);
  s.getRange(3, 1, 1, head.length).protect().setDescription("Column names — do not change").setWarningOnly(true);
}
