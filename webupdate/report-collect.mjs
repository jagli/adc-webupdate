#!/usr/bin/env node
/**
 * Visitor report data: reads Netlify's analytics for abhinava.dance and writes report/data/.
 *
 *   NETLIFY_AUTH_TOKEN=… NETLIFY_SITE_ID=… node webupdate/report-collect.mjs [repo folder]
 *
 * Writes
 *   report/data/index.json        the weeks on offer, newest first, and when the data was collected
 *   report/data/all.json          everything since launch (21 October 2026) up to today
 *   report/data/month-YYYY-MM.json   one calendar month (the current month so far is rewritten each run)
 *   report/data/week-YYYY-MM-DD.json   one Monday-to-Sunday week (India time), named after its Monday
 *
 * A week already saved is never rewritten, so the history stays even if Netlify stops keeping old data.
 *
 * Phrase lock: every file is encrypted (AES-GCM, key from REPORT_PHRASE via PBKDF2) so the published files are
 * unreadable without the phrase; the page asks for it and decrypts in the browser. report/data/lock.json holds
 * only the salt. The phrase is a GitHub secret, never in a file.
 * Run every Monday at 00:30 IST by the GitHub workflow (report.yml): all time and this month go up to today;
 * a week or month is saved once it has ended and is never rewritten.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const REPO = path.resolve(process.argv[2] || ".");
const OUT = path.join(REPO, "report/data");
const token = process.env.NETLIFY_AUTH_TOKEN;
let site = process.env.NETLIFY_SITE_ID; // a site name works for deploys; analytics needs the site's id, looked up below
if (!token || !site) { console.error("NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID are needed."); process.exit(1); }
const phrase = process.env.REPORT_PHRASE;
if (!phrase) { console.error("REPORT_PHRASE is needed: the report is never published unlocked."); process.exit(1); }
/* the same normalising as the page: only letters and numbers count ("How to name it?" = "how to name it ?") */
const norm = (p) => String(p).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const normV1 = (p) => String(p).trim().replace(/\s+/g, " ").toLowerCase(); // lock version 1, kept to re-seal old files

const LAUNCH = "2026-10-21";
const TZ = "Asia/Kolkata", IST = 5.5 * 3600e3, DAY = 86400e3;
const ANALYTICS = "https://analytics.services.netlify.com/v2";
const istMidnight = (ymd) => Date.parse(ymd + "T00:00:00Z") - IST;
const ymd = (ms) => new Date(ms + IST).toISOString().slice(0, 10);

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) return r.json();
    if (attempt >= 3 || r.status < 500) throw new Error(`${r.status} for ${url.replace(/\?.*/, "")}: ${(await r.text()).slice(0, 200)}`);
    await new Promise((s) => setTimeout(s, 2000 * attempt));
  }
}
const q = (from, to, extra = "") => `?from=${from}&to=${to}&timezone=${encodeURIComponent(TZ)}${extra}`;

const PAGE_NAMES = { "": "Home", index: "Home", about: "About", performances: "Performances", school: "School", activities: "Activities", store: "Store", support: "Support", contact: "Contact", research: "Research", testimonials: "Testimonials", credentials: "Credentials", gallery: "Gallery" };
const pageName = (p) => { const k = String(p).replace(/^\/+|\/+$/g, "").replace(/\.html$/, ""); return PAGE_NAMES[k] ?? null; };
function sourceName(s) {
  s = String(s || "").toLowerCase();
  if (!s) return "Direct";
  if (/(^|\.)google\./.test(s)) return "Google";
  if (/instagram/.test(s)) return "Instagram";
  if (/facebook|fb\.me/.test(s)) return "Facebook";
  if (/youtube/.test(s)) return "YouTube";
  if (/bing\./.test(s)) return "Bing";
  if (/whatsapp/.test(s)) return "WhatsApp";
  if (/(^|\.)t\.co$|twitter|x\.com/.test(s)) return "X (Twitter)";
  if (/linkedin/.test(s)) return "LinkedIn";
  return s.replace(/^www\./, "");
}
function merge(rows, nameOf, limit) {
  const m = new Map();
  for (const r of rows || []) { const n = nameOf(r); if (n) m.set(n, (m.get(n) || 0) + (r.count || 0)); }
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

let account = null;
async function period(fromYmd, toYmd) {
  const from = istMidnight(fromYmd), to = Math.min(istMidnight(toYmd) + DAY - 1, Date.now());
  const base = `${ANALYTICS}/${site}`;
  const [pv, uv, uvRange, bw, countries, pages, sources] = await Promise.all([
    get(base + "/pageviews" + q(from, to, "&resolution=day")),
    get(base + "/visitors" + q(from, to, "&resolution=day")),
    get(base + "/visitors" + q(from, to, "&resolution=range")),
    get(base + "/bandwidth" + q(from, to, "&resolution=range")),
    get(base + "/ranking/countries" + q(from, to, "&limit=60")),
    get(base + "/ranking/pages" + q(from, to, "&limit=60")),
    get(base + "/ranking/sources" + q(from, to, "&limit=40")),
  ]);
  let req = { data: [] };
  try { if (account) req = await get(`${ANALYTICS}/accounts/${account}/usage_insights/web_requests` + q(from, to, "&resolution=day")); }
  catch (e) { console.warn("requests served: " + e.message); }
  const days = new Map();
  for (let t = from; t <= to; t += DAY) days.set(ymd(t), { d: ymd(t), visitors: 0, pages: 0, requests: 0 });
  for (const [t, n] of pv.data || []) { const d = days.get(ymd(t)); if (d) d.pages = n; }
  for (const [t, n] of uv.data || []) { const d = days.get(ymd(t)); if (d) d.visitors = n; }
  for (const r of req.data || []) { const d = days.get(String(r.Time).slice(0, 10)); if (d) d.requests = r.Values?.count || 0; }
  const daily = [...days.values()].filter((d) => d.d >= LAUNCH);
  const sum = (k) => daily.reduce((s, d) => s + d[k], 0);
  return {
    from: fromYmd < LAUNCH ? LAUNCH : fromYmd, to: toYmd,
    people: (uvRange.data || [])[0]?.[1] ?? null,
    pages: sum("pages"), requests: sum("requests"),
    bandwidth: (bw.data || [])[0]?.siteBandwidth ?? null,
    countryCount: (countries.data || []).length,
    countries: merge(countries.data, (r) => r.country_name || r.resource, 12),
    pagesTop: merge(pages.data, (r) => pageName(r.resource), 12),
    sources: merge(sources.data, (r) => sourceName(r.resource), 8),
    daily,
  };
}

fs.mkdirSync(OUT, { recursive: true });
const ITER = 250000, LOCK_V = 2;
let lock = null;
try { lock = JSON.parse(fs.readFileSync(path.join(OUT, "lock.json"), "utf8")); } catch (e) {}
const oldLock = lock;
if (!lock || lock.iter !== ITER || !lock.salt || lock.v !== LOCK_V) lock = { v: LOCK_V, iter: ITER, salt: crypto.randomBytes(16).toString("base64") };
const key = crypto.pbkdf2Sync(norm(phrase), Buffer.from(lock.salt, "base64"), ITER, 32, "sha256");
function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final(), c.getAuthTag()]);
  return { v: LOCK_V, iv: iv.toString("base64"), ct: ct.toString("base64") };
}
function unseal(raw, k) {
  const buf = Buffer.from(raw.ct, "base64"), d = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(raw.iv, "base64"));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString("utf8"));
}
const write = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(seal(data)) + "\n");
// saved history: unsealed files are sealed; files sealed under an older lock are opened with it and sealed again
const oldKey = oldLock && oldLock !== lock && oldLock.salt
  ? crypto.pbkdf2Sync((oldLock.v === 1 ? normV1 : norm)(phrase), Buffer.from(oldLock.salt, "base64"), oldLock.iter || ITER, 32, "sha256") : null;
for (const f of fs.readdirSync(OUT)) {
  if (!/^(week|month)-.*\.json$/.test(f)) continue;
  const raw = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));
  if (!raw.ct) write(f, raw);
  else if (oldKey) write(f, unseal(raw, oldKey));
}
fs.writeFileSync(path.join(OUT, "lock.json"), JSON.stringify({ v: LOCK_V, iter: ITER, salt: lock.salt }) + "\n");
{
  const info = await get(`https://api.netlify.com/api/v1/sites/${site}`);
  site = info.site_id || info.id || site;
  account = info.account_id || null;
}

// full weeks, Monday to Sunday (India time), from the launch week to the last one that has ended
const now = Date.now(), todayYmd = ymd(now);
const weekday = (new Date(istMidnight(todayYmd) + IST).getUTCDay() + 6) % 7; // 0 = Monday
const lastSunday = ymd(istMidnight(todayYmd) - (weekday + 1) * DAY);
const weeks = [];
for (let mon = istMidnight("2026-10-19"); ymd(mon + 6 * DAY) <= lastSunday; mon += 7 * DAY) weeks.push([ymd(mon), ymd(mon + 6 * DAY)]);

for (const [mon, sun] of weeks) {
  const file = `week-${mon}.json`;
  if (fs.existsSync(path.join(OUT, file))) continue;
  const w = await period(mon, sun);
  if (!w.daily.some((d) => d.visitors)) { console.error(`Netlify returned no visitors for ${mon}; nothing saved.`); process.exit(1); }
  write(file, w);
  console.log("saved " + file);
}
// calendar months from launch: past months saved once, the current month rewritten up to today
const months = [];
for (let y = 2026, m = 10; `${y}-${String(m).padStart(2, "0")}` <= todayYmd.slice(0, 7); m === 12 ? (y++, m = 1) : m++) {
  const id = `${y}-${String(m).padStart(2, "0")}`, first = `${id}-01`, last = ymd(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - DAY - IST + IST);
  const current = todayYmd.slice(0, 7) === id;
  months.push({ id, from: first < LAUNCH ? LAUNCH : first, to: current ? todayYmd : last, current });
}
for (const mo of months) {
  const file = `month-${mo.id}.json`;
  if (!mo.current && fs.existsSync(path.join(OUT, file))) continue;
  const d = await period(mo.from, mo.to);
  if (!d.daily.some((x) => x.visitors)) { console.error(`Netlify returned no visitors for ${mo.id}; nothing saved.`); process.exit(1); }
  write(file, d);
}
const all = await period(LAUNCH, todayYmd);
if (!all.people && !all.daily.some((d) => d.visitors)) { console.error("Netlify returned no visitor numbers; nothing saved. Is Web Analytics switched on for the site?"); process.exit(1); }
write("all.json", all);
write("index.json", {
  collected: new Date(now).toISOString(), launch: LAUNCH, upTo: todayYmd,
  months: months.slice().reverse(),
  weeks: weeks.map(([from, to]) => ({ id: from, from, to })).reverse(),
});
console.log(`all time ${LAUNCH} to ${todayYmd}, ${months.length} months, ${weeks.length} weeks`);
