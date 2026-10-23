// Proof 5: the Sheet's own code (Code.gs + Layout.gs), run against a simulated Google Sheet:
// Update preview reads every tab and sends content the robot accepts; roles block the wrong people;
// approve is refused when the Sheet changed after the preview; users can be added and removed.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { readSite, PAGES, PAGE_NAMES, GLOBAL_FIELDS, PRODUCTION_COLUMNS } from "../engine/site.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const site = readSite(path.join(HERE, "../.."));
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) fails++; };

/* ── a tiny Google ── */
const sheets = {};
const props = { GITHUB_REPO: "jagli/adc-webupdate", GITHUB_TOKEN: "test-token" };
let user = "owner@example.com";
const calls = [];
const mails = [];
let lastPreview = null;

function sheetFrom(values) {
  const s = {
    values,
    getDataRange: () => ({ getValues: () => s.values.map((r) => r.slice()) }),
    getLastRow: () => s.values.length,
    appendRow: (r) => s.values.push(r),
    formulas: {},
    getLastColumn: () => s.values.reduce((m, r) => Math.max(m, r.length), 0),
    getName: () => s.name,
    getRange: (row, col, nr = 1, nc = 1) => {
      if (typeof row === "string") { const [a, b] = row.split(":").map(Number); return { rowA: a, rowB: b }; }
      const rg = {
        row, col,
        getRow: () => row,
        setValues: (v) => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { while (s.values.length < row + i) s.values.push([]); s.values[row - 1 + i][col - 1 + j] = v[i][j]; } return rg; },
        getValues: () => s.values.slice(row - 1, row - 1 + nr).map((r) => r.slice(col - 1, col - 1 + nc)),
        getValue: () => (s.values[row - 1] || [])[col - 1],
        setValue: (v) => { s.values[row - 1][col - 1] = v; return rg; },
        getFormulas: () => [Array.from({ length: nc }, (_, j) => s.formulas[`${row},${col + j}`] || "")],
        getCell: (i, j) => s.getRange(row + i - 1, col + j - 1),
        clearContent: () => { s.values[row - 1][col - 1] = ""; return rg; },
        copyTo: (t) => { for (let j = 0; j < nc; j++) { t.getCell(1, j + 1).setValue(s.values[row - 1][col - 1 + j]); const f = s.formulas[`${row},${col + j}`]; if (f) s.formulas[`${t.row},${t.col + j}`] = f; } },
        setFontWeight: () => ({ setBackground: () => {} }), setBackground: () => {},
      };
      return rg;
    },
    moveRows: (spec, dest) => { const a = spec.rowA, b = spec.rowB; const block = s.values.splice(a - 1, b - a + 1); const at = dest > a ? dest - 1 - block.length : dest - 1; s.values.splice(at, 0, ...block); },
    insertRowsAfter: (after, n) => { const w = s.getLastColumn(); for (let i = 0; i < n; i++) s.values.splice(after, 0, Array(w).fill("")); },
    setActiveRange: (rg) => { active = { sheet: s, range: rg }; },
    deleteRow: (r) => s.values.splice(r - 1, 1),
    setFrozenRows() {}, setColumnWidths() {},
    protect: () => ({ setDescription: () => ({ setWarningOnly() {}, removeEditors() {}, getEditors: () => [], addEditor() {} }), removeEditors() {}, getEditors: () => [], addEditor() {} }),
  };
  return s;
}
const width = (rows) => rows.reduce((m, r) => Math.max(m, r.length), 5);
const pad = (rows) => { const w = width(rows); return rows.map((r) => { const x = r.slice(); while (x.length < w) x.push(""); return x; }); };

let active = null;
const cacheStore = {};
const g = {
  SpreadsheetApp: {
    getActiveSheet: () => active.sheet,
    getActiveRange: () => active.range,
    getActive: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => (sheets[n] = sheetFrom([])),
      getOwner: () => ({ getEmail: () => "owner@example.com" }),
      addEditor: (e) => calls.push(["addEditor", e]), removeEditor: (e) => calls.push(["removeEditor", e]),
      getUrl: () => "https://docs.google.com/spreadsheets/d/TEST", toast() {},
    }),
    getUi: () => ({ alert() {} }),
  },
  Session: { getActiveUser: () => ({ getEmail: () => user }), getEffectiveUser: () => user },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cacheStore[k] ?? null, put: (k, v) => (cacheStore[k] = v) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => (props[k] = v) }) },
  UrlFetchApp: {
    fetch: (url, o = {}) => {
      calls.push([o.method || "get", url]);
      const respond = (code, body) => ({ getResponseCode: () => code, getContentText: () => (typeof body === "string" ? body : JSON.stringify(body)) });
      if (/contents\/content\/preview\.json/.test(url) && o.method === "PUT") { const b = JSON.parse(o.payload); lastPreview = Buffer.from(b.content, "base64").toString("utf8"); return respond(201, { commit: { sha: "abc1234def" } }); }
      if (/contents\/content\/preview\.json/.test(url)) return respond(404, {});
      if (/dispatches/.test(url)) return respond(204, "");
      if (/contents\/status\/preview\.json/.test(url)) return respond(200, { ok: true, sha: "abc1234def", hash: JSON.parse(props.STATE || "{}").hash, changes: [] });
      if (/contents\/status\/publish\.json/.test(url)) return respond(404, "");
      return respond(200, {});
    },
  },
  DriveApp: { Access: { ANYONE_WITH_LINK: "A", ANYONE: "B" }, getFileById: () => { throw new Error("no"); }, getFolderById: () => { throw new Error("no"); } },
  MailApp: { sendEmail: (to, subj) => mails.push([to, subj]) },
  HtmlService: {},
  Utilities: {
    base64Encode: (b) => Buffer.from(b).toString("base64"),
    newBlob: (t) => ({ getBytes: () => Buffer.from(t, "utf8") }),
    computeDigest: (alg, s) => crypto.createHash("sha1").update(s, "utf8").digest(),
    DigestAlgorithm: { SHA_1: "sha1" }, Charset: { UTF_8: "utf8" },
    formatDate: (d) => String(d),
  },
  console, JSON, Date, Math, String, Object, Array, Buffer,
};
vm.createContext(g);
for (const f of ["Layout.gs", "Code.gs"]) vm.runInContext(fs.readFileSync(path.join(HERE, "../apps-script", f), "utf8"), g, { filename: f });

/* ── lay the Sheet out the way Setup does ── */
sheets.Global = sheetFrom(pad([["", "Global"], ["", "hint"], [""], ...GLOBAL_FIELDS.map(([l, k]) => [`global|${k}`, l, site.global[k] ?? ""])]));
sheets.Productions = sheetFrom(pad(g.layoutProductions_(site.productions).rows));
for (const p of PAGES) sheets[PAGE_NAMES[p]] = sheetFrom(pad(g.layoutPage_([p, PAGE_NAMES[p]], site.pages[p]).rows));
sheets.Users = sheetFrom([["Email (Google account)", "Role", "Name"], ["owner@example.com", "Super admin", "Owner"], ["ed@example.com", "Editor", "Ed"], ["mod@example.com", "Moderator", "Mo"]]);

/* ── the flow ── */
user = "stranger@example.com";
ok(g.updatePreview().ok === false, "a stranger cannot update the preview");
user = "ed@example.com";
const r1 = g.updatePreview();
ok(r1.ok, `editor: Update preview → ${r1.message}`);
const sent = JSON.parse(lastPreview);
if (process.env.SAVE_PREVIEW) fs.writeFileSync(process.env.SAVE_PREVIEW, lastPreview);
ok(sent.by === "ed@example.com" && sent.hash, "content carries who and a fingerprint");
ok(calls.some(([m, u]) => m === "POST" && /preview\.yml\/dispatches/.test(u)), "the preview robot is started");
const st = g.getStatus();
ok(st.state.status === "ready", `status read back: ${st.state.status}`);
ok(g.approveAndPublish().ok === false, "an editor cannot publish");
ok(g.submitForReview("please check").ok, "editor submits for review");
ok(mails.some(([to]) => /mod@example.com/.test(to)), "moderator is emailed");
// someone edits after the preview → approve refused
const perf = sheets.Performances.values;
const i = perf.findIndex((r) => /^slot\|performances\/upcoming-shows\/t2\|text/.test(r[0]));
const keep = perf[i][2];
perf[i][2] = "Changed after the preview";
user = "mod@example.com";
const waitBefore = g.getStatus().contentChanged;
props.STATE = JSON.stringify({ ...JSON.parse(props.STATE), when: new Date(Date.now() - 60000).toISOString() });
g.onEdit();
ok(waitBefore === false && g.getStatus().contentChanged === true, "the panel notices an edit after sending (and only reads the Sheet after an edit)");
ok(/changed since these changes were sent/.test(g.approveAndPublish().message), "approve refused when the Sheet changed after the preview");
perf[i][2] = keep;
const a = g.approveAndPublish();
ok(a.ok && calls.some(([m, u]) => m === "POST" && /publish\.yml\/dispatches/.test(u)), `moderator approves → ${a.message}`);
ok(g.rejectChanges("").ok === false, "send back needs a note");
// the one-button flow: Send my changes → preview → goes to the moderator by itself; Send back
user = "ed@example.com";
ok(/being published/.test(g.sendChanges("x").message), "no new send while the site is being published");
props.STATE = JSON.stringify({ ...JSON.parse(props.STATE), status: "published" });
const mailsBefore = mails.length;
const sc = g.sendChanges("new photos");
ok(sc.ok && g.getStatus().state.status === "waiting", "Send my changes: once the preview is ready it waits for the moderator by itself");
ok(mails.length === mailsBefore + 1 && /mod@example.com/.test(mails[mails.length - 1][0]), "the moderator is emailed once");
ok(g.getStatus() && mails.length === mailsBefore + 1, "no second email when the panel refreshes");
user = "mod@example.com";
ok(g.rejectChanges("Photo 3 is sideways").ok && g.getStatus().state.status === "rejected", "moderator sends back with a note");
ok(/Photo 3 is sideways/.test(mails[mails.length - 1][1] + JSON.stringify(g.getStatus().state)), "the note reaches the editor");
user = "ed@example.com";
ok(g.saveUser("x@example.com", "Editor", "X").ok === false, "an editor cannot add users");
user = "owner@example.com";
ok(g.saveUser("new@example.com", "Editor", "New").ok && calls.some(([m, e]) => m === "addEditor" && e === "new@example.com"), "owner adds a user (gets Sheet access)");
ok(g.listUsers().some((u) => u.email === "new@example.com"), "user listed");
ok(g.removeUser("new@example.com").ok && calls.some(([m, e]) => m === "removeEditor" && e === "new@example.com"), "owner removes a user (loses Sheet access)");
ok(g.getLog(50).length >= 5, "activity log written");
/* ── the panel's row buttons ── */
user = "ed@example.com";
const perfSheet = sheets.Performances;
perfSheet.name = "Performances";
const rowOf = (pred) => perfSheet.values.findIndex(pred) + 1;
const select = (row) => { active = { sheet: perfSheet, range: perfSheet.getRange(row, 3) }; };
const festCard = rowOf((r) => String(r[0]).startsWith("row|") && String(r[2]).includes("Cultural Festivals"));
const corpCard = rowOf((r) => String(r[0]).startsWith("row|") && String(r[2]).includes("Corporate Shows"));
select(corpCard);
const info = g.getSelectedRow();
ok(info.ok && /Corporate Shows/.test(info.label) && info.canUp, `panel shows the clicked row: “${info.label}” (${info.kind})`);
const before = JSON.stringify(g.readPageRows_(perfSheet.values.map((r) => r.slice()), "performances").blocks.map((b) => b.lists.map((l) => l.rows.map((x) => x.cells))));
ok(g.rowTool("up").ok, "Move up: Corporate Shows above Cultural Festivals");
const afterUp = g.readPageRows_(perfSheet.values.map((r) => r.slice()), "performances").blocks.find((b) => b.key === "performances/past-performances").lists.find((l) => l.rows.some((x) => /Corporate/.test(x.cells.Text)));
ok(/Corporate/.test(afterUp.rows[0].cells.Text) && /Infosys/.test(afterUp.rows[0].cells["List (one per line)"]) && /Rasaaradhanam|Rasaaraadhanam/.test(afterUp.rows[1].cells["List (one per line)"]), "the card moved with all its own items");
select(rowOf((r) => String(r[0]).startsWith("row|") && String(r[2]).includes("Corporate Shows")));
ok(g.rowTool("down").ok, "Move down puts it back");
const afterDown = JSON.stringify(g.readPageRows_(perfSheet.values.map((r) => r.slice()), "performances").blocks.map((b) => b.lists.map((l) => l.rows.map((x) => x.cells))));
ok(afterDown === before, "after up + down, everything is exactly as before");
select(festCard + 1); // first festival
const n0 = perfSheet.values.length;
ok(g.rowTool("add").ok && perfSheet.values.length === n0 + 1, "Add below: one new empty festival row");
const newRow = perfSheet.values[festCard + 1];
ok(String(newRow[0]) === "sub|List (one per line)|" && newRow[1] === true && newRow.slice(2).every((x) => x === ""), "the new row is empty, ticked, and belongs to the same list");
select(festCard + 2);
ok(g.rowTool("toggle").ok && perfSheet.values[festCard + 1][1] === false, "Show / hide unticks the row");
select(rowOf((r) => String(r[0]).startsWith("block|")));
ok(g.getSelectedRow().ok === false, "clicking a band says it is not an item");
// an empty new row is fine; clearing an existing item is caught before anything is sent
const ev = rowOf((r) => String(r[0]).startsWith("ev|"));
const keepEv = perfSheet.values[ev - 1].slice();
for (let c = 2; c < keepEv.length; c++) perfSheet.values[ev - 1][c] = "";
const res = g.updatePreview();
ok(res.ok === false && res.problems.some((m) => /Performances tab, row .* untick Show instead/.test(m)), "Update preview stops on a cleared event: " + (res.problems || [])[0]);
perfSheet.values[ev - 1] = keepEv;

console.log(fails ? `\n${fails} problem(s)` : "\nThe Sheet's code works end to end (simulated Google).");
process.exit(fails ? 1 : 0);
