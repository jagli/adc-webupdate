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
    ["3.  Lists — one item = one row", "step"],
    ["Every card, event, person, photo or line of a list has its own row. Click the row, then use the “Selected row” box in the Website panel:  ▲ Move up · ▼ Move down · ＋ Add below · Hide / Show.", ""],
    ["To remove something, press Hide (or untick “Show”). Nothing is ever deleted, so you can always Show it again.  Never clear a row to remove it — the preview will stop and tell you.", "tip"],
    ["Events: one row per show. Date (click the cell for a calendar) · Event · Details · Ticket link. Past dates hide themselves.", "tip"],
    ["Made a mistake?  Edit ▸ Undo (Ctrl+Z / ⌘+Z).  Older mistakes: File ▸ Version history shows every earlier version of this Sheet.", "tip"],
    ["", ""],
    ["4.  Send it", "step"],
    ["When you are done, press “Send my changes” in the Website panel. In about 2 minutes a preview is ready and the moderator gets an email. Nothing goes live yet.", ""],
    ["If something is wrong, the panel says which tab and row, in plain words. Fix it and press Send my changes again.", "tip"],
    ["", ""],
    ["5.  Moderator", "step"],
    ["Open the Website panel ▸ “See what changed”. Then press Publish (click twice) — abhinava.dance updates in a few minutes — or write a note and press Send back.", ""],
    ["", ""],
    ["Do not change", "step"],
    ["The coloured bands, the grey header rows, column A and the tab names. If you do by mistake: Edit ▸ Undo, or ask the owner.", ""]
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
      else if (f.type === "row") { if (c >= 2 && c < 2 + f.cols) b = (f.multiCols || []).indexOf(c + 1) >= 0 ? COLORS.key : COLORS.edit; }
      else if (f.type === "sub") { if (c === f.itemCol - 1) b = COLORS.item; else if (c >= 1) b = COLORS.itemRow; }
      else if (f.type === "pho") { if (c === 2) b = COLORS.edit; }
      else if (f.type === "ev") { if (c >= 2 && c <= 5) b = COLORS.edit; }
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
  runs(function (f) { return f.type === "row" || f.type === "grow" || f.type === "sub" || f.type === "pho" || f.type === "ev"; }).forEach(function (r) {
    var n = r[1] - r[0] + 1, range = s.getRange(r[0] + 1, 2, n, 1);
    range.setNumberFormat("General").insertCheckboxes().setHorizontalAlignment("center");
    range.setValues(values.slice(r[0], r[1] + 1).map(function (row) { return [row[1] === true]; }));
  });
  // list rows with a photo column: one preview formula per row, same column within a list
  // event dates: real dates, so Google shows a calendar to pick from
  runs(function (f) { return f.type === "ev"; }).forEach(function (r) {
    var n = r[1] - r[0] + 1, range = s.getRange(r[0] + 1, 3, n, 1);
    var dates = values.slice(r[0], r[1] + 1).map(function (row) { var d = new Date(Date.parse(String(row[2]).replace(/(\d+)(st|nd|rd|th)/, "$1"))); return [isNaN(d.getTime()) ? row[2] : d]; });
    range.setNumberFormat("d mmm yyyy").setValues(dates)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).setHelpText("Double-click to pick a date from the calendar, e.g. 8 Jan 2027").build());
  });
  // photo previews for list rows, item rows and carousel rows
  runs(function (f) { return (f.type === "row" || f.type === "sub" || f.type === "pho") && f.photoCol && f.previewCol; }).forEach(function (r) {
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
  s.setColumnWidth(1, 20); s.setColumnWidth(2, 110); s.setColumnWidth(3, 460); s.setColumnWidth(4, 300); s.setColumnWidth(5, 170);
  for (var c = 6; c <= width; c++) s.setColumnWidth(c, 220);
  s.setFrozenRows(2);
  s.hideColumns(1);
  // the hidden keys warn before they are changed; the visible headers are only labels (the Sheet
  // reads the column names from the hidden keys), so typing over one breaks nothing
  s.getRange(1, 1, s.getMaxRows(), 1).protect().setDescription("Keys — do not change").setWarningOnly(true);
}

/* ── Productions: one card per production ── */
function productionsTab_(ss, list) {
  var s = freshSheet_(ss, "Productions");
  var laid = layoutProductions_(list);
  var n = laid.rows.length;
  s.getRange(1, 1, n, 5).setNumberFormat("@").setValues(laid.rows).setWrap(true).setVerticalAlignment("top");
  s.setRowHeights(1, n, 21); s.autoResizeRows(1, n);
  var ticks = [], posters = [];
  laid.fmt.forEach(function (f, i) {
    var row = i + 1, r = s.getRange(row, 2, 1, 4);
    if (f.type === "title") s.getRange(row, 2).setFontSize(16).setFontWeight("bold").setFontColor(COLORS.title).setWrap(false);
    if (f.type === "hint") s.getRange(row, 2).setFontColor(COLORS.note).setFontStyle("italic").setWrap(false);
    if (f.type === "prod") { r.setBackground(COLORS.band).setFontColor(COLORS.bandText).setFontWeight("bold").setFontSize(12); s.getRange(row, 4).setBackground(COLORS.edit).setFontColor("#000000"); ticks.push(row); }
    if (f.type === "pf") { s.getRange(row, 3).setFontColor(COLORS.note); s.getRange(row, 4).setBackground(COLORS.edit); }
    if (f.poster) { posters.push(row); s.setRowHeight(row, 110); }
  });
  ticks.forEach(function (row) { s.getRange(row, 2).insertCheckboxes().setNumberFormat("General"); });
  laid.rows.forEach(function (x, i) { if (laid.fmt[i].type === "prod") s.getRange(i + 1, 2).setValue(x[1]); });
  posters.forEach(function (row) { s.getRange(row, 5).setFormula(previewFormula_("D" + row)); });
  s.hideColumns(1);
  s.setColumnWidth(2, 70); s.setColumnWidth(3, 130); s.setColumnWidth(4, 520); s.setColumnWidth(5, 110);
  s.setFrozenRows(2);
  s.getRange(1, 1, s.getMaxRows(), 1).protect().setDescription("Keys — do not change").setWarningOnly(true);
}
