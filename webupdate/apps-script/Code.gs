/**
 * ADC Website — the "Website" menu and sidebar inside the Google Sheet.
 *
 * Editors change words, photos and lists in the tabs, then press Update preview. The robot on
 * GitHub builds the preview and a change page; the moderator approves (it goes live) or sends it
 * back with a note. Everything is recorded in the Log tab.
 *
 * Settings (Extensions ▸ Apps Script ▸ Project settings ▸ Script properties), set once by the owner:
 *   GITHUB_REPO   e.g. jagli/adc-webupdate
 *   GITHUB_TOKEN  a GitHub key that can only change that one project (contents + actions)
 * The owner runs Website ▸ Owner ▸ Set up the Sheet once; it lays out every tab from the live site.
 */

/* ── constants ─────────────────────────────────────────────────────────── */

var PAGES = [
  ["index", "Home"], ["about", "About"], ["performances", "Performances"], ["school", "School"],
  ["activities", "Activities"], ["store", "Store"], ["support", "Support"], ["contact", "Contact"],
  ["research", "Research"], ["testimonials", "Testimonials"], ["credentials", "Credentials"], ["gallery", "Gallery"]
];
var GLOBAL_FIELDS = [
  ["Company name", "name"], ["Tagline", "tagline"], ["Email", "email"], ["Phone", "phone"],
  ["School email", "schoolEmail"], ["School phone", "schoolPhone"], ["Instagram link", "instagram"],
  ["YouTube link", "youtube"], ["School Instagram link", "schoolInstagram"], ["Show School Instagram", "showSchoolInstagram"]
];
var PRODUCTION_COLUMNS = ["Production", "Label", "Length", "Artists", "Style", "About", "Performers", "Director", "Music", "Lighting", "Availability", "Poster", "Media folder", "Videos", "Show"];
var SITE = "https://abhinava.dance/";
var COLORS = {
  band: "#0a2a45", bandText: "#ffffff", note: "#5b6170", edit: "#fffbea", head: "#f1e6cf", listNote: "#faf5ea",
  title: "#6a0f3b", problem: "#fde2e1", key: "#eeeeee"
};
var ROLE = { owner: "Super admin", moderator: "Moderator", editor: "Editor" };

/* ── menu ──────────────────────────────────────────────────────────────── */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("Website")
    .addItem("Open the Website panel", "openPanel")
    .addSeparator()
    .addItem("① Update preview", "menuPreview")
    .addItem("② Submit for review", "menuSubmit")
    .addItem("③ Review (moderator)", "openPanel")
    .addSeparator()
    .addItem("How this works", "openHelp")
    .addSubMenu(ui.createMenu("Owner")
      .addItem("Users", "openPanel")
      .addItem("Activity log", "openLog")
      .addItem("Set up the Sheet (first time / new layout)", "setupSheet")
      .addItem("Check settings", "checkSettings"))
    .addToUi();
}

function openPanel() {
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile("Sidebar").setTitle("Website"));
}
function openHelp() {
  SpreadsheetApp.getActive().setActiveSheet(SpreadsheetApp.getActive().getSheetByName("Start here"));
}
function openLog() {
  var s = SpreadsheetApp.getActive().getSheetByName("Log");
  if (s) SpreadsheetApp.getActive().setActiveSheet(s);
}
function menuPreview() { var r = updatePreview(); toast_(r.message); openPanel(); }
function menuSubmit() { var r = submitForReview(""); toast_(r.message); }
function toast_(m) { SpreadsheetApp.getActive().toast(m, "Website", 8); }

/* ── who is using it ───────────────────────────────────────────────────── */

function me_() { return String(Session.getActiveUser().getEmail() || "").toLowerCase(); }

function users_() {
  var s = SpreadsheetApp.getActive().getSheetByName("Users");
  if (!s) return [];
  var v = s.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) if (v[i][0]) out.push({ email: String(v[i][0]).trim().toLowerCase(), role: String(v[i][1] || "Editor").trim(), name: String(v[i][2] || ""), row: i + 1 });
  return out;
}

function roleOf_(email) {
  var u = users_().filter(function (x) { return x.email === email; })[0];
  if (u) return u.role;
  // the Sheet's owner is always the super admin, even before the Users tab exists
  try { if (SpreadsheetApp.getActive().getOwner().getEmail().toLowerCase() === email) return ROLE.owner; } catch (e) {}
  return "";
}

function can_(what) {
  var r = roleOf_(me_());
  if (what === "edit") return r === ROLE.editor || r === ROLE.moderator || r === ROLE.owner;
  if (what === "moderate") return r === ROLE.moderator || r === ROLE.owner;
  if (what === "own") return r === ROLE.owner;
  return false;
}

/* ── settings ──────────────────────────────────────────────────────────── */

function setting_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ""; }
function state_() { return JSON.parse(PropertiesService.getScriptProperties().getProperty("STATE") || "{}"); }
function setState_(s) { PropertiesService.getScriptProperties().setProperty("STATE", JSON.stringify(s)); }
function pagesUrl_() {
  var repo = setting_("GITHUB_REPO").split("/");
  return setting_("PREVIEW_URL") || ("https://" + repo[0] + ".github.io/" + repo[1] + "/");
}

function checkSettings() {
  var ok = [];
  ok.push("GITHUB_REPO: " + (setting_("GITHUB_REPO") || "missing"));
  ok.push("GITHUB_TOKEN: " + (setting_("GITHUB_TOKEN") ? "set" : "missing"));
  if (setting_("GITHUB_TOKEN") && setting_("GITHUB_REPO")) {
    var r = gh_("GET", "/repos/" + setting_("GITHUB_REPO"));
    ok.push("GitHub answers: " + (r.code === 200 ? "yes" : "no (" + r.code + ")"));
  }
  ok.push("You are: " + me_() + " — " + (roleOf_(me_()) || "not in the Users tab"));
  SpreadsheetApp.getUi().alert(ok.join("\n"));
}

/* ── GitHub ────────────────────────────────────────────────────────────── */

function gh_(method, path, body) {
  var res = UrlFetchApp.fetch("https://api.github.com" + path, {
    method: method, muteHttpExceptions: true, contentType: "application/json",
    headers: { Authorization: "Bearer " + setting_("GITHUB_TOKEN"), Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    payload: body ? JSON.stringify(body) : undefined
  });
  var text = res.getContentText();
  var json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { code: res.getResponseCode(), json: json, text: text };
}

function putFile_(path, text, message, branch) {
  var repo = setting_("GITHUB_REPO");
  var cur = gh_("GET", "/repos/" + repo + "/contents/" + path + "?ref=" + branch);
  var body = { message: message, content: Utilities.base64Encode(Utilities.newBlob(text).getBytes()), branch: branch };
  if (cur.code === 200 && cur.json && cur.json.sha) body.sha = cur.json.sha;
  var r = gh_("PUT", "/repos/" + repo + "/contents/" + path, body);
  if (r.code !== 200 && r.code !== 201) throw new Error("GitHub said " + r.code + ": " + (r.json && r.json.message || r.text).slice(0, 200));
  return r.json.commit.sha;
}

function rawFile_(path, branch) {
  var url = "https://raw.githubusercontent.com/" + setting_("GITHUB_REPO") + "/" + branch + "/" + path + "?t=" + Date.now();
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { "Cache-Control": "no-cache" } });
  return res.getResponseCode() === 200 ? res.getContentText() : "";
}

/* ── log ───────────────────────────────────────────────────────────────── */

function log_(action, detail) {
  var ss = SpreadsheetApp.getActive();
  var s = ss.getSheetByName("Log");
  if (!s) {
    s = ss.insertSheet("Log");
    s.appendRow(["When", "Who", "What", "Details"]);
    s.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground(COLORS.head);
    s.setFrozenRows(1);
    s.setColumnWidths(1, 1, 160); s.setColumnWidths(2, 1, 220); s.setColumnWidths(3, 1, 160); s.setColumnWidths(4, 1, 520);
    s.protect().setDescription("Activity log — written by the Website menu").setWarningOnly(true);
  }
  s.appendRow([new Date(), me_(), action, String(detail || "").slice(0, 4000)]);
}

/* ── reading the Sheet into content ────────────────────────────────────── */

function readPageTab_(sheet, page) {
  return readPageRows_(sheet.getDataRange().getValues(), page);
}

function readContent_() {
  var ss = SpreadsheetApp.getActive();
  var content = { version: 1, global: {}, productions: [], pages: {} };
  var g = ss.getSheetByName("Global");
  if (g) {
    var gv = g.getDataRange().getValues();
    for (var i = 0; i < gv.length; i++) {
      var k = parseKey_(gv[i][0]);
      if (k.type !== "global") continue;
      content.global[k.rest] = k.rest === "showSchoolInstagram" ? gv[i][2] === true || /^yes$/i.test(gv[i][2]) : String(gv[i][2]);
    }
  }
  var p = ss.getSheetByName("Productions");
  if (p) {
    var pv = p.getDataRange().getValues();
    var head = pv[2];
    for (var r = 3; r < pv.length; r++) {
      if (!String(pv[r][0]).trim()) continue;
      var row = {};
      for (var c = 0; c < PRODUCTION_COLUMNS.length; c++) row[PRODUCTION_COLUMNS[c]] = String(pv[r][head.indexOf(PRODUCTION_COLUMNS[c])] === undefined ? "" : pv[r][head.indexOf(PRODUCTION_COLUMNS[c])]);
      content.productions.push(row);
    }
  }
  PAGES.forEach(function (pg) {
    var s = ss.getSheetByName(pg[1]);
    if (s) content.pages[pg[0]] = readPageTab_(s, pg[0]);
  });
  return content;
}

/* ── quick checks in the Sheet (the robot checks everything again) ─────── */

function driveId_(s) {
  var m = String(s || "").match(/\/d\/([\w-]{20,})/) || String(s || "").match(/[?&]id=([\w-]{20,})/) || String(s || "").match(/folders\/([\w-]{20,})/);
  return m && /drive\.google|docs\.google/.test(s) ? m[1] : null;
}

/** Look up every Drive link: check it is shared, and list folders. Returns problems. */
function resolveDrive_(content) {
  var drive = {};
  var problems = [];
  function check(link, where, folder) {
    var id = driveId_(link);
    if (!id || drive[id]) return;
    try {
      var item = folder ? DriveApp.getFolderById(id) : DriveApp.getFileById(id);
      var access = item.getSharingAccess();
      if (access !== DriveApp.Access.ANYONE_WITH_LINK && access !== DriveApp.Access.ANYONE) {
        problems.push(where + ": share it as “Anyone with the link” (right-click ▸ Share ▸ General access)");
        return;
      }
      var entry = { name: item.getName(), modified: item.getLastUpdated().toISOString() };
      if (folder) {
        entry.files = [];
        var it = item.getFiles();
        while (it.hasNext()) {
          var f = it.next();
          entry.files.push({ id: f.getId(), name: f.getName(), mimeType: f.getMimeType(), modified: f.getLastUpdated().toISOString() });
        }
      } else entry.mimeType = item.getMimeType();
      drive[id] = entry;
    } catch (e) {
      problems.push(where + ": the Drive link cannot be opened — check it is a link to " + (folder ? "a folder" : "a file") + " and that it is shared");
    }
  }
  Object.keys(content.pages).forEach(function (pg) {
    var tab = PAGES.filter(function (x) { return x[0] === pg; })[0][1];
    content.pages[pg].blocks.forEach(function (b) {
      b.slots.forEach(function (s) { if (driveId_(s.value)) check(s.value, tab + " › " + b.label + " › " + s.what, false); if (driveId_(s.href)) check(s.href, tab + " › " + b.label + " › " + s.what + " link", false); });
      b.lists.forEach(function (l) {
        if (l.folder) check(l.folder, tab + " › " + b.label + " › " + l.what + " (folder link)", true);
        l.rows.forEach(function (r) {
          Object.keys(r.cells).forEach(function (c) { if (driveId_(r.cells[c])) check(r.cells[c], tab + " › row " + r.sheetRow + " › " + c, /folder/.test(r.cells[c])); });
        });
      });
      if (b.gallery) {
        if (b.gallery.folder) check(b.gallery.folder, tab + " › Gallery folder link", true);
        b.gallery.rows.forEach(function (g) { if (driveId_(g.src)) check(g.src, tab + " › row " + g.sheetRow, false); });
      }
    });
  });
  content.productions.forEach(function (p, i) { if (driveId_(p.Poster)) check(p.Poster, "Productions › row " + (i + 4) + " › Poster", false); });
  content.drive = drive;
  return problems;
}

/* ── the buttons ───────────────────────────────────────────────────────── */

function updatePreview() {
  if (!can_("edit")) return { ok: false, message: "Your account is not on the Users list. Ask the owner to add you." };
  if (!setting_("GITHUB_TOKEN")) return { ok: false, message: "The website connection is not set up yet (owner: Website ▸ Owner ▸ Check settings)." };
  var content = readContent_();
  var problems = resolveDrive_(content);
  if (problems.length) {
    var st = state_(); st.problems = problems; st.status = "problems"; st.when = new Date().toISOString(); setState_(st);
    return { ok: false, message: "Please fix " + problems.length + " thing(s) — see the Website panel.", problems: problems };
  }
  // drop helper fields before sending
  Object.keys(content.pages).forEach(function (pg) { content.pages[pg].blocks.forEach(function (b) { b.lists.forEach(function (l) { l.rows.forEach(function (r) { delete r.sheetRow; }); }); if (b.gallery) b.gallery.rows.forEach(function (g) { delete g.sheetRow; }); }); });
  var hash = hash_(content);
  content.by = me_();
  content.at = new Date().toISOString();
  content.hash = hash;
  var sha = putFile_("content/preview.json", JSON.stringify(content, null, 1), "Preview requested by " + me_(), "preview");
  var run = gh_("POST", "/repos/" + setting_("GITHUB_REPO") + "/actions/workflows/preview.yml/dispatches", { ref: "main", inputs: { sha: sha } });
  if (run.code !== 204) return { ok: false, message: "Saved, but the preview could not be started (GitHub said " + run.code + "). Try again in a minute." };
  setState_({ status: "building", by: me_(), when: content.at, sha: sha, hash: hash, problems: [] });
  log_("Update preview", "Preview requested (" + sha.slice(0, 7) + ")");
  return { ok: true, message: "Building the preview… it takes about 2 minutes. The Website panel shows when it is ready." };
}

/** Status for the sidebar: reads the robot's status file. */
function getStatus() {
  var st = state_();
  var out = { me: me_(), role: roleOf_(me_()), state: st, previewUrl: pagesUrl_(), reviewUrl: pagesUrl_() + "review/" };
  if (st.status === "building" || st.status === "waiting" || st.status === "ready" || st.status === "publishing") {
    var raw = rawFile_("status/preview.json", "status");
    if (raw) {
      var s = JSON.parse(raw);
      if (s.sha === st.sha || s.hash === st.hash) {
        if (s.ok && st.status === "building") { st.status = "ready"; st.changes = s.changes || []; setState_(st); }
        if (!s.ok && st.status === "building") { st.status = "problems"; st.problems = s.problems || ["The build stopped — see GitHub"]; setState_(st); log_("Preview problems", st.problems.join(" | ")); }
      }
    }
    var pub = rawFile_("status/publish.json", "status");
    if (pub) {
      out.publish = JSON.parse(pub);
      if (st.status === "publishing" && out.publish.sha === st.sha && out.publish.ok) { st.status = "published"; setState_(st); }
    }
  }
  out.state = st;
  out.contentChanged = st.hash && (st.status === "ready" || st.status === "waiting") ? currentHash_() !== st.hash : false;
  return out;
}

/** A fingerprint of what editors wrote (words, photos, lists, contact details, productions). */
function hash_(c) {
  var core = JSON.stringify({ global: c.global, productions: c.productions, pages: c.pages });
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, core, Utilities.Charset.UTF_8)).slice(0, 16);
}

function currentHash_() {
  var c = readContent_();
  Object.keys(c.pages).forEach(function (pg) { c.pages[pg].blocks.forEach(function (b) { b.lists.forEach(function (l) { l.rows.forEach(function (r) { delete r.sheetRow; }); }); if (b.gallery) b.gallery.rows.forEach(function (g) { delete g.sheetRow; }); }); });
  return hash_(c);
}

function submitForReview(note) {
  if (!can_("edit")) return { ok: false, message: "Your account is not on the Users list." };
  var st = state_();
  if (st.status !== "ready") return { ok: false, message: st.status === "building" ? "The preview is still being built — wait for it to be ready." : "Press Update preview first, then check it." };
  st.status = "waiting"; st.submittedBy = me_(); st.note = note || ""; setState_(st);
  log_("Submitted for review", note);
  var mods = users_().filter(function (u) { return u.role === ROLE.moderator || u.role === ROLE.owner; }).map(function (u) { return u.email; });
  if (mods.length) MailApp.sendEmail(mods.join(","), "Website changes waiting for your review",
    me_() + " has sent website changes for review.\n\n" + (note ? "Note: " + note + "\n\n" : "") + "See only what changed: " + pagesUrl_() + "review/\n\nTo publish or send back: open the Google Sheet ▸ Website ▸ Review.\n" + SpreadsheetApp.getActive().getUrl());
  return { ok: true, message: "Sent to the moderator for review." };
}

function approveAndPublish() {
  if (!can_("moderate")) return { ok: false, message: "Only the moderator can publish." };
  var st = state_();
  if (st.status !== "waiting" && st.status !== "ready") return { ok: false, message: "There is nothing waiting to be published." };
  if (currentHash_() !== st.hash) return { ok: false, message: "The Sheet has changed since this preview. Press Update preview first so you approve exactly what will go live." };
  var r = gh_("POST", "/repos/" + setting_("GITHUB_REPO") + "/actions/workflows/publish.yml/dispatches", { ref: "main", inputs: { by: me_(), sha: st.sha } });
  if (r.code !== 204) return { ok: false, message: "Could not start publishing (GitHub said " + r.code + ")." };
  st.status = "publishing"; st.approvedBy = me_(); setState_(st);
  log_("Approved & published", "Preview " + String(st.sha).slice(0, 7) + " sent live");
  if (st.submittedBy && st.submittedBy !== me_()) MailApp.sendEmail(st.submittedBy, "Your website changes are going live", "Approved by " + me_() + ". abhinava.dance updates in a few minutes.");
  return { ok: true, message: "Publishing… abhinava.dance updates in a few minutes." };
}

function rejectChanges(note) {
  if (!can_("moderate")) return { ok: false, message: "Only the moderator can send changes back." };
  if (!String(note || "").trim()) return { ok: false, message: "Please write a short note so the editor knows what to change." };
  var st = state_();
  st.status = "rejected"; st.rejectNote = note; st.rejectedBy = me_(); setState_(st);
  log_("Sent back", note);
  if (st.submittedBy) MailApp.sendEmail(st.submittedBy, "Website changes sent back", "Note from " + me_() + ":\n\n" + note + "\n\nMake the changes in the Sheet, then Update preview and Submit again.\n" + SpreadsheetApp.getActive().getUrl());
  return { ok: true, message: "Sent back to " + (st.submittedBy || "the editor") + "." };
}

function rollbackLast() {
  if (!can_("own")) return { ok: false, message: "Only the owner can undo a publish." };
  var r = gh_("POST", "/repos/" + setting_("GITHUB_REPO") + "/actions/workflows/rollback.yml/dispatches", { ref: "main", inputs: { by: me_() } });
  if (r.code !== 204) return { ok: false, message: "Could not start the undo (GitHub said " + r.code + ")." };
  log_("Undo last publish", "");
  return { ok: true, message: "Putting the previous version back… a few minutes." };
}

/* ── users (owner) ─────────────────────────────────────────────────────── */

function listUsers() {
  if (!can_("own")) return [];
  return users_().map(function (u) { return { email: u.email, role: u.role, name: u.name }; });
}

function saveUser(email, role, name) {
  if (!can_("own")) return { ok: false, message: "Only the owner can change users." };
  email = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "That is not an email address." };
  if ([ROLE.editor, ROLE.moderator, ROLE.owner].indexOf(role) < 0) return { ok: false, message: "Choose Editor or Moderator." };
  var s = usersSheet_();
  var u = users_().filter(function (x) { return x.email === email; })[0];
  if (u) s.getRange(u.row, 2, 1, 2).setValues([[role, name || u.name]]);
  else s.appendRow([email, role, name || ""]);
  try { SpreadsheetApp.getActive().addEditor(email); } catch (e) {}
  log_(u ? "User changed" : "User added", email + " → " + role);
  return { ok: true, message: (u ? "Updated " : "Added ") + email + " as " + role + ". They can now open this Sheet." };
}

function removeUser(email) {
  if (!can_("own")) return { ok: false, message: "Only the owner can change users." };
  email = String(email || "").trim().toLowerCase();
  if (email === me_()) return { ok: false, message: "You cannot remove yourself." };
  var u = users_().filter(function (x) { return x.email === email; })[0];
  if (!u) return { ok: false, message: "Not found." };
  usersSheet_().deleteRow(u.row);
  try { SpreadsheetApp.getActive().removeEditor(email); } catch (e) {}
  log_("User removed", email);
  return { ok: true, message: "Removed " + email + ". They can no longer open this Sheet." };
}

function usersSheet_() {
  var ss = SpreadsheetApp.getActive();
  var s = ss.getSheetByName("Users");
  if (!s) {
    s = ss.insertSheet("Users");
    s.appendRow(["Email (Google account)", "Role", "Name"]);
    s.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground(COLORS.head);
    s.setFrozenRows(1);
    s.setColumnWidths(1, 1, 280); s.setColumnWidths(2, 1, 140); s.setColumnWidths(3, 1, 200);
    s.appendRow([me_(), ROLE.owner, "Owner"]);
    var p = s.protect().setDescription("Users — only the owner");
    p.removeEditors(p.getEditors()); p.addEditor(Session.getEffectiveUser());
  }
  return s;
}

function getLog(n) {
  if (!can_("own") && !can_("moderate")) return [];
  var s = SpreadsheetApp.getActive().getSheetByName("Log");
  if (!s || s.getLastRow() < 2) return [];
  var start = Math.max(2, s.getLastRow() - (n || 30) + 1);
  return s.getRange(start, 1, s.getLastRow() - start + 1, 4).getValues().reverse().map(function (r) { return [Utilities.formatDate(new Date(r[0]), "Asia/Kolkata", "d MMM, HH:mm"), r[1], r[2], r[3]]; });
}
