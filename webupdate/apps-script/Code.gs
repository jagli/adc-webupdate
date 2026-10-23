/**
 * ADC Website — the "Website" menu and sidebar inside the Google Sheet.
 *
 * Editors change words, photos and lists in the tabs, then press Send my changes. The robot on
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
  title: "#6a0f3b", problem: "#fde2e1", key: "#eeeeee", item: "#fffdf2", itemRow: "#fbfaf6"
};
var ROLE = { owner: "Super admin", moderator: "Moderator", editor: "Editor" };

/* ── menu ──────────────────────────────────────────────────────────────── */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("Website")
    .addItem("Open the Website panel", "openPanel")
    .addSeparator()
    .addItem("Send my changes", "menuSend")
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
function menuSend() { var r = sendChanges(""); toast_(r.message); openPanel(); }
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
  if (what === "own") return r === ROLE.owner || !SpreadsheetApp.getActive().getSheetByName("Users"); // first set-up: whoever runs it becomes the owner
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
  var body = { message: message, content: Utilities.base64Encode(Utilities.newBlob(text).getBytes()), branch: branch };
  var r;
  for (var attempt = 0; attempt < 2; attempt++) {
    // someone else may have saved a moment ago: read the current version, then save on top of it
    var cur = gh_("GET", "/repos/" + repo + "/contents/" + path + "?ref=" + branch);
    if (cur.code === 200 && cur.json && cur.json.sha) body.sha = cur.json.sha;
    r = gh_("PUT", "/repos/" + repo + "/contents/" + path, body);
    if (r.code !== 409 && r.code !== 422) break;
    Utilities.sleep(1500);
  }
  if (r.code !== 200 && r.code !== 201) throw new Error("GitHub said " + r.code + ": " + (r.json && r.json.message || r.text).slice(0, 200));
  return r.json.commit.sha;
}

function rawFile_(path, branch) {
  // through the API (not raw.githubusercontent.com, which is cached for minutes)
  var headers = { Accept: "application/vnd.github.raw" };
  if (setting_("GITHUB_TOKEN")) headers.Authorization = "Bearer " + setting_("GITHUB_TOKEN"); // the project is public: reading works without the key
  var res = UrlFetchApp.fetch("https://api.github.com/repos/" + setting_("GITHUB_REPO") + "/contents/" + path + "?ref=" + branch, { muteHttpExceptions: true, headers: headers });
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
  content.problems = [];
  var p = ss.getSheetByName("Productions");
  if (p) {
    var pr = readProductions_(p.getDataRange().getValues());
    content.productions = pr.productions.map(function (x) { var row = {}; PRODUCTION_COLUMNS.forEach(function (c) { row[c] = x[c] || ""; }); return row; });
    pr.problems.forEach(function (m) { content.problems.push("Tab Productions, " + m); });
  }
  PAGES.forEach(function (pg) {
    var s = ss.getSheetByName(pg[1]);
    if (!s) return;
    var d = readPageTab_(s, pg[0]);
    (d.problems || []).forEach(function (m) { content.problems.push(pg[1] + " tab, " + m); });
    delete d.problems;
    content.pages[pg[0]] = d;
  });
  return content;
}

/* ── quick checks in the Sheet (the robot checks everything again) ─────── */

function driveId_(s) {
  var m = String(s || "").match(/\/d\/([\w-]{20,})/) || String(s || "").match(/[?&]id=([\w-]{20,})/) || String(s || "").match(/folders\/([\w-]{20,})/);
  return m && /drive\.google|docs\.google/.test(s) ? m[1] : null;
}

/** Call fn for each line of a cell that is a Drive link (a photos cell holds one per line). */
function eachLine_(value, fn) {
  String(value || "").split(/\r?\n/).forEach(function (line) { line = line.trim(); if (driveId_(line)) fn(line); });
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
      // a single file owned by someone else may not open here even when it is public; the robot
      // downloads it like any visitor and stops with a plain message if it really cannot
      if (!folder) return;
      problems.push(where + ": the Drive link cannot be opened — check it is a link to a folder and that it is shared");
    }
  }
  Object.keys(content.pages).forEach(function (pg) {
    var tab = PAGES.filter(function (x) { return x[0] === pg; })[0][1];
    content.pages[pg].blocks.forEach(function (b) {
      b.slots.forEach(function (s) {
        eachLine_(s.value, function (line) { check(line, tab + " › " + b.label + " › " + s.what, /folders\//.test(line)); });
        if (driveId_(s.href)) check(s.href, tab + " › " + b.label + " › " + s.what + " link", false);
      });
      b.lists.forEach(function (l) {
        if (l.folder) check(l.folder, tab + " › " + b.label + " › " + l.what + " (folder link)", true);
        l.rows.forEach(function (r) {
          Object.keys(r.cells).forEach(function (c) { eachLine_(r.cells[c], function (line) { check(line, tab + " › row " + r.sheetRow + " › " + c, /folders\//.test(line)); }); });
        });
      });
      if (b.gallery) {
        if (b.gallery.folder) check(b.gallery.folder, tab + " › Gallery folder link", true);
        b.gallery.rows.forEach(function (g) { if (driveId_(g.src)) check(g.src, tab + " › row " + g.sheetRow, false); });
      }
    });
  });
  content.productions.forEach(function (p, i) { if (driveId_(p.Poster)) check(p.Poster, "Productions › " + p.Production + " › Poster", false); });
  content.drive = drive;
  return problems;
}

/* ── the buttons ───────────────────────────────────────────────────────── */

function updatePreview() {
  if (!can_("edit")) return { ok: false, message: "Your account is not on the Users list. Ask the owner to add you." };
  if (!setting_("GITHUB_TOKEN")) return { ok: false, message: "Previews are switched off in this copy of the Sheet (it has no website key, on purpose). Typing and the row buttons still work. Previews and publishing happen in the real “ADC Website” Sheet." };
  var content = readContent_();
  var problems = content.problems.concat(resolveDrive_(content));
  delete content.problems;
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

/**
 * The editor's one button: build the preview and, as soon as it is ready, hand it to the
 * moderator (an email goes out). Nothing goes live until the moderator presses Publish.
 */
function sendChanges(note) {
  var r = updatePreview();
  if (!r.ok) return r;
  var st = state_();
  st.autoSubmit = true; st.submittedBy = me_(); st.note = note || "";
  setState_(st);
  return { ok: true, message: "Sending… the preview takes about 2 minutes, then it goes to the moderator by itself." };
}

function notifyModerators_(st) {
  var mods = users_().filter(function (u) { return u.role === ROLE.moderator || u.role === ROLE.owner; }).map(function (u) { return u.email; });
  if (mods.length) MailApp.sendEmail(mods.join(","), "Website changes waiting for you",
    (st.submittedBy || "An editor") + " has sent website changes.\n\n" + (st.note ? "Note: " + st.note + "\n\n" : "") + "See what changed: " + pagesUrl_() + "review/\n\nTo publish or send back: open the Google Sheet ▸ Website ▸ Open the Website panel.\n" + SpreadsheetApp.getActive().getUrl());
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
        if (s.ok && st.status === "building") {
          st.status = st.autoSubmit ? "waiting" : "ready"; st.changes = s.changes || [];
          if (st.autoSubmit) { delete st.autoSubmit; setState_(st); log_("Sent to the moderator", st.note || ""); notifyModerators_(st); }
          else setState_(st);
        }
        if (!s.ok && st.status === "building") { st.status = "problems"; st.problems = s.problems || ["The build stopped — see GitHub"]; setState_(st); log_("Preview problems", st.problems.join(" | ")); }
      }
    }
    var pub = rawFile_("status/publish.json", "status");
    if (pub) {
      out.publish = JSON.parse(pub);
      if (st.status === "publishing" && out.publish.sha === st.sha) {
        if (out.publish.ok) { st.status = "published"; st.publishError = ""; setState_(st); }
        else {
          // nothing went live: back to waiting, so it can be approved again once fixed
          st.status = "waiting";
          st.publishError = out.publish.netlify === "2" ? "Approved, but abhinava.dance is not connected yet — the owner has to add the Netlify key (see the owner guide). Nothing changed on the live site." : "Publishing did not finish, so the live site did not change. The owner can see why on GitHub (Actions ▸ Publish). You can approve again.";
          setState_(st);
          log_("Publish did not finish", st.publishError);
        }
      }
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
  delete c.problems;
  Object.keys(c.pages).forEach(function (pg) { c.pages[pg].blocks.forEach(function (b) { b.lists.forEach(function (l) { l.rows.forEach(function (r) { delete r.sheetRow; }); }); if (b.gallery) b.gallery.rows.forEach(function (g) { delete g.sheetRow; }); }); });
  return hash_(c);
}

function submitForReview(note) {
  if (!can_("edit")) return { ok: false, message: "Your account is not on the Users list." };
  var st = state_();
  if (st.status !== "ready") return { ok: false, message: st.status === "building" ? "The preview is still being built — wait for it to be ready." : "Press Update preview first, then check it." };
  st.status = "waiting"; st.submittedBy = me_(); st.note = note || ""; setState_(st);
  log_("Submitted for review", note);
  notifyModerators_(st);
  return { ok: true, message: "Sent to the moderator for review." };
}

function approveAndPublish() {
  if (!can_("moderate")) return { ok: false, message: "Only the moderator can publish." };
  var st = state_();
  if (st.status !== "waiting" && st.status !== "ready") return { ok: false, message: "There is nothing waiting to be published." };
  if (currentHash_() !== st.hash) return { ok: false, message: "The Sheet has changed since these changes were sent. Ask the editor to press Send my changes again, so you publish exactly what you checked." };
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
  if (st.submittedBy) MailApp.sendEmail(st.submittedBy, "Website changes sent back", "Note from " + me_() + ":\n\n" + note + "\n\nMake the changes in the Sheet, then press Send my changes again.\n" + SpreadsheetApp.getActive().getUrl());
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

/* ── the panel's row buttons: Move up, Move down, Add below, Show / hide ───── */

function rowTarget_() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var range = SpreadsheetApp.getActiveRange();
  if (!range) return { error: "Click a row in a page tab first." };
  var last = sheet.getLastRow();
  var marks = sheet.getRange(1, 1, Math.max(last, 1), 1).getValues().map(function (x) { return x[0]; });
  var r = range.getRow() - 1;
  var unit = rowUnit_(marks, r);
  if (!unit) return { error: "That row is not an item. Click a row that has a Show tick box." };
  return { sheet: sheet, marks: marks, r: unit.start, unit: unit };
}

function describeRow_(t) {
  var row = t.sheet.getRange(t.r + 1, 1, 1, Math.min(t.sheet.getLastColumn(), 8)).getValues()[0];
  if (t.unit.kind === "prod") return String(row[3] || "(new production)").split("\n")[0].slice(0, 50);
  var words = row.slice(2).map(function (x) { return x instanceof Date ? eventDate_(x) : String(x); }).filter(function (x) { return x.trim(); })[0] || "(empty row)";
  return String(words).replace(/\*/g, "").split("\n")[0].slice(0, 50);
}

/** The gallery's "Drive folder" row: say what is in the pasted folder and what to do next. */
function folderRowInfo_() {
  var sheet = SpreadsheetApp.getActiveSheet(), range = SpreadsheetApp.getActiveRange();
  if (!range) return null;
  var row = range.getRow();
  if (parseKey_(sheet.getRange(row, 1).getValue()).type !== "galleryfolder") return null;
  var link = String(sheet.getRange(row, 3).getValue()).trim();
  var base = { ok: false, folder: true, sheet: sheet.getName(), row: row };
  if (!link) { base.message = "Paste a Google Drive folder link in the yellow cell. Its photos will be added at the end of the gallery."; return base; }
  var id = driveId_(link);
  if (!id || !/folders\//.test(link)) { base.message = "That is not a folder link. In Drive, right-click the folder ▸ Share ▸ Copy link, and paste it here."; base.bad = true; return base; }
  var cache = CacheService.getScriptCache(), hit = cache.get("folder:" + id);
  if (hit) return JSON.parse(hit);
  try {
    var f = DriveApp.getFolderById(id), access = f.getSharingAccess();
    var it = f.getFiles(), photos = [], other = 0, otherNames = [], subs = [];
    while (it.hasNext()) { var x = it.next(); if (/^image\/(jpeg|png|webp)/.test(x.getMimeType())) photos.push(x.getName()); else { other++; if (otherNames.length < 3) otherNames.push(x.getName()); } }
    var fit = f.getFolders(); while (fit.hasNext() && subs.length < 5) subs.push(fit.next().getName());
    photos.sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
    if (access !== DriveApp.Access.ANYONE_WITH_LINK && access !== DriveApp.Access.ANYONE) {
      base.bad = true;
      base.message = "Folder “" + f.getName() + "” is not shared yet. In Drive: right-click it ▸ Share ▸ General access: “Anyone with the link”.";
    } else if (!photos.length) {
      base.bad = true;
      base.message = "Folder “" + f.getName() + "” has no JPG or PNG photos directly inside it." +
        (subs.length ? " It has folders inside (" + subs.join(", ") + ") — open the folder that holds the photos and paste that folder's link instead." : "") +
        (other ? " It has " + other + " other file(s) (" + otherNames.join(", ") + (other > 3 ? ", …" : "") + ") — videos go on YouTube; iPhone HEIC photos must be saved as JPG." : "") +
        (!subs.length && !other ? " The folder is empty." : "");
    } else {
      base.message = "✓ Folder “" + f.getName() + "”: " + photos.length + " photo" + (photos.length > 1 ? "s" : "") + " (" + photos.slice(0, 3).join(", ") + (photos.length > 3 ? ", …" : "") + "). " +
        (other ? other + " other file(s) will be skipped (videos go on YouTube; iPhone HEIC photos must be saved as JPG). " : "") +
        "They will be added after the photos below.  Next: press Send my changes.";
      base.next = true;
    }
  } catch (e) {
    base.bad = true;
    base.message = "This folder cannot be opened. Check the link, and that it is shared “Anyone with the link”.";
  }
  cache.put("folder:" + id, JSON.stringify(base), 60);
  return base;
}

/** What the panel shows about the clicked row. */
function getSelectedRow() {
  if (!can_("edit")) return { ok: false, message: "Your account is not on the Users list." };
  var fr = folderRowInfo_();
  if (fr) return fr;
  var t = rowTarget_();
  if (t.error) return { ok: false, message: t.error };
  var kind = { row: "item", sub: "list item", pho: "photo", ev: "event", grow: "gallery item", prod: "production" }[t.unit.kind];
  return { ok: true, label: describeRow_(t), kind: kind, canUp: !!t.unit.prev, canDown: !!t.unit.next, shown: t.sheet.getRange(t.r + 1, 2).getValue() !== false, sheet: t.sheet.getName(), row: t.r + 1 };
}

function rowTool(action) {
  if (!can_("edit")) return { ok: false, message: "Your account is not on the Users list." };
  var t = rowTarget_();
  if (t.error) return { ok: false, message: t.error };
  var s = t.sheet, u = t.unit, label = describeRow_(t);
  var rows = function (a, b) { return s.getRange((a + 1) + ":" + (b + 1)); };
  if (action === "up" || action === "down") {
    var other = action === "up" ? u.prev : u.next;
    if (!other) return { ok: false, message: action === "up" ? "It is already the first one." : "It is already the last one." };
    var dest = action === "up" ? other.start + 1 : other.end + 2;
    s.moveRows(rows(u.start, u.end), dest);
    var newStart = action === "up" ? other.start : u.start + (other.end - other.start + 1);
    s.setActiveRange(s.getRange(newStart + 1, 3));
    return { ok: true, message: "Moved “" + label + "” " + action + "." };
  }
  if (action === "toggle") {
    var cell = s.getRange(t.r + 1, 2);
    var show = cell.getValue() === false;
    cell.setValue(show);
    return { ok: true, message: (show ? "Showing “" : "Hidden “") + label + "”." };
  }
  if (action === "add") {
    var lastCol = s.getLastColumn();
    // a new card gets one empty row for each of its own lists, copied from the card's first item rows
    var templates = [u.start];
    if (u.kind === "prod") for (var q = u.start + 1; q <= u.end; q++) templates.push(q);
    if (u.kind === "row") {
      var seen = {};
      for (var i = u.start + 1; i <= u.end; i++) { var f = parseKey_(t.marks[i]).rest.split("|")[0]; if (!seen[f]) { seen[f] = 1; templates.push(i); } }
    }
    s.insertRowsAfter(u.end + 1, templates.length);
    templates.forEach(function (src, j) {
      var target = s.getRange(u.end + 2 + j, 1, 1, lastCol);
      s.getRange(src + 1, 1, 1, lastCol).copyTo(target);
      var formulas = target.getFormulas()[0];
      var k = parseKey_(t.marks[src]);
      // a production card keeps its labels (column C) and empties only the values (column D)
      for (var c = k.type === "prod" || k.type === "pf" ? 4 : 3; c <= lastCol; c++) if (!formulas[c - 1]) target.getCell(1, c).clearContent();
      var marker = k.type === "sub" ? "sub|" + k.rest.split("|")[0] + "|" : k.type === "pf" ? t.marks[src] : k.type === "pgap" ? "pgap" : k.type + "|";
      target.getCell(1, 1).setValue(marker);
      if (k.type !== "pf" && k.type !== "pgap") target.getCell(1, 2).setValue(true);
    });
    s.setActiveRange(s.getRange(u.end + 2, u.kind === "prod" ? 4 : 3));
    return { ok: true, message: u.kind === "prod" ? "Added a new empty production card below “" + label + "”. Type its name and details in the yellow cells." : "Added a new empty row below “" + label + "”. Type in its yellow cells." };
  }
  return { ok: false, message: "Unknown action." };
}
