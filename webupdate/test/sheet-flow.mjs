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
    getRange: (row, col, nr = 1, nc = 1) => ({
      setValues: (v) => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { while (s.values.length < row + i) s.values.push([]); s.values[row - 1 + i][col - 1 + j] = v[i][j]; } return s; },
      getValues: () => s.values.slice(row - 1, row - 1 + nr).map((r) => r.slice(col - 1, col - 1 + nc)),
      setFontWeight: () => ({ setBackground: () => {} }), setBackground: () => {},
    }),
    deleteRow: (r) => s.values.splice(r - 1, 1),
    setFrozenRows() {}, setColumnWidths() {},
    protect: () => ({ setDescription: () => ({ setWarningOnly() {}, removeEditors() {}, getEditors: () => [], addEditor() {} }), removeEditors() {}, getEditors: () => [], addEditor() {} }),
  };
  return s;
}
const width = (rows) => rows.reduce((m, r) => Math.max(m, r.length), 5);
const pad = (rows) => { const w = width(rows); return rows.map((r) => { const x = r.slice(); while (x.length < w) x.push(""); return x; }); };

const g = {
  SpreadsheetApp: {
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
sheets.Productions = sheetFrom(pad([["title"], ["hint"], [...PRODUCTION_COLUMNS, "Preview"], ...site.productions.map((p) => [...PRODUCTION_COLUMNS.map((c) => p[c] ?? ""), ""])]));
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
ok(/changed since this preview/.test(g.approveAndPublish().message), "approve refused when the Sheet changed after the preview");
perf[i][2] = keep;
const a = g.approveAndPublish();
ok(a.ok && calls.some(([m, u]) => m === "POST" && /publish\.yml\/dispatches/.test(u)), `moderator approves → ${a.message}`);
ok(g.rejectChanges("").ok === false, "send back needs a note");
user = "ed@example.com";
ok(g.saveUser("x@example.com", "Editor", "X").ok === false, "an editor cannot add users");
user = "owner@example.com";
ok(g.saveUser("new@example.com", "Editor", "New").ok && calls.some(([m, e]) => m === "addEditor" && e === "new@example.com"), "owner adds a user (gets Sheet access)");
ok(g.listUsers().some((u) => u.email === "new@example.com"), "user listed");
ok(g.removeUser("new@example.com").ok && calls.some(([m, e]) => m === "removeEditor" && e === "new@example.com"), "owner removes a user (loses Sheet access)");
ok(g.getLog(50).length >= 5, "activity log written");
console.log(fails ? `\n${fails} problem(s)` : "\nThe Sheet's code works end to end (simulated Google).");
process.exit(fails ? 1 : 0);
