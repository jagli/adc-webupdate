#!/usr/bin/env node
/**
 * ADC-26 site package: builds dist/, the only folder visitors ever receive.
 *
 * Usage: node export-tools/build-site.mjs          abhinava.dance (Netlify runs this): the package, the
 *                                                   search files and a DEPLOYED.txt stamp
 *        node export-tools/build-site.mjs --test   the same package for the test site (test.jagli.in/adc26),
 *                                                   kept out of search engines; export-tools/deploy-test.sh runs this
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { site, pageFile } from "./site.config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist");
const ASSET_VERSION = "282";
const LIVE = !process.argv.includes("--test");

/** What is published comes from site.config.mjs: the same lists every other tool reads. */
const PAGES = site.pages.map(pageFile);
const JS_FILES = site.scripts.map((name) => `${name}.js`);
/** All CSS shipped in dist/ (includes @import deps of main.css) */
const CSS_FILES = site.styles.map((name) => `${name}.css`);
/** Stylesheets that must appear as <link> in HTML (tokens/chrome load via @import) */
const CSS_LINKED = site.linkedStyles.map((name) => `${name}.css`);

/** Web media lives under assets/web/ (from optimize-web-media.mjs) */
const WEB_MEDIA_ROOT = path.join(ROOT, "assets", "web");

const GRADIENT_FILES = [
  "g01-dawn", "g02-sage-mist", "g03-lavender-gold", "g04-citron-peach",
  "g05-ocean-soft", "g06-rose-gold", "g07-meadow", "g08-orchid",
  "g09-champagne", "g10-aurora", "g11-blush-navy", "g12-jewel-soft",
].map((g) => `${g}.svg`);

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

/**
 * Prepare production HTML for the package only.
 * Does NOT write back into the authoring tree (avoids surprise ?v= diffs).
 */
function prepareHtml(file) {
  const srcPath = path.join(ROOT, file);
  let html = fs.readFileSync(srcPath, "utf8");

  if (!html.includes('name="viewport"')) {
    html = html.replace(
      "<head>",
      '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">'
    );
  }

  /* Package: ensure skip-link target exists (copy only — sources untouched) */
  html = html.replace(/<main([^>]*)>/i, (match, attrs) => {
    let a = attrs || "";
    if (!/\bid\s*=/.test(a)) a += ' id="content"';
    if (!/\bclass\s*=/.test(a)) a += ' class="site-main"';
    else if (!/\bsite-main\b/.test(a)) {
      a = a.replace(/class=(["'])([^"']*)\1/, 'class=$1$2 site-main$1');
    }
    if (!/\btabindex\s*=/.test(a)) a += ' tabindex="-1"';
    return `<main${a}>`;
  });

  if (!html.includes('id="site-header"')) {
    console.warn(`  warn: ${file} missing #site-header`);
  }
  if (!html.includes('id="site-footer"')) {
    console.warn(`  warn: ${file} missing #site-footer`);
  }

  /* Keep ?v=N on published HTML so browsers do not reuse stale css/js from prior deploys */
  html = html.replace(
    /(href="css\/(?:main|luxury|sections)\.css)\?v=\d+"/g,
    `$1?v=${ASSET_VERSION}"`
  );
  html = html.replace(/(src="js\/[^"]+\.js)\?v=\d+"/g, `$1?v=${ASSET_VERSION}"`);

  return html;
}

function injectScripts(html) {
  if (html.includes("progressive-images.js")) return html;
  return html.replace(
    /(<script src="js\/icons\.js(?:\?v=\d+)?"[^>]*><\/script>)/,
    `$1\n  <script src="js/progressive-images.js?v=${ASSET_VERSION}"></script>`
  );
}

/** Point img tags at thumbs in HTML so first paint is tiny; full path in data-full-src */
function injectProgressiveMarkup(html) {
  return html.replace(
    /<img([^>]*)\ssrc="(assets\/web\/(?:client|images)\/(?:[^"]+\/)*)([^"/]+\.jpe?g)(\?v=\d+)?"([^>]*)>/gi,
    (match, before, dir, filename, version = "", after) => {
      if (before.includes("data-full-src") || after.includes("data-full-src")) return match;
      if (dir.includes("/thumbs/")) return match;
      /* Optional ?v=N on a photo changed in place (e.g. re-rotated) busts caches for thumb and full size */
      const full = `${dir}${filename}${version}`;
      const thumb = full.replace("assets/web/", "assets/web/thumbs/");
      let attrs = `${before} src="${thumb}" data-full-src="${full}"${after}`;
      attrs = attrs.replace(/\sloading="eager"/i, ' loading="lazy"');
      attrs = attrs.replace(/\sfetchpriority="high"/i, "");
      return `<img${attrs}>`;
    }
  );
}

function copyTree(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  const walk = (current, rel = "") => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const from = path.join(current, entry.name);
      const toRel = rel ? path.join(rel, entry.name) : entry.name;
      const to = path.join(destDir, toRel);
      if (entry.isDirectory()) {
        mkdirp(to);
        walk(from, toRel);
        continue;
      }
      if (entry.name === "manifest.json") continue;
      copyFile(from, to);
      files += 1;
      bytes += fs.statSync(from).size;
    }
  };
  mkdirp(destDir);
  walk(srcDir);
  return { files, bytes };
}

/** Giant width/height attrs blow up layout when CSS is slow or missing */
function sanitizeImages(html) {
  return html.replace(/\s(width|height)="\d{4,}"/gi, "");
}

function extractAssetRefs(html) {
  const refs = new Set();
  const re = /(?:src|href)=["'](assets\/[^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) refs.add(m[1]);
  return [...refs];
}

function verifyHtmlIntegrity(dir) {
  const issues = [];
  const broken = /(?:href|src)="[^"]+[^"]>/;
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(dir, page), "utf8");
    if (broken.test(html)) issues.push(`${page}: broken href/src quote (re-upload blocked)`);
    if (!/href="css\/main\.css(\?v=\d+)?"/.test(html)) issues.push(`${page}: missing main.css link`);
    if (!html.includes("progressive-images.js")) issues.push(`${page}: missing progressive-images.js`);
    if (!html.includes(`?v=${ASSET_VERSION}`)) issues.push(`${page}: missing cache buster v${ASSET_VERSION}`);
  }
  return issues;
}

function verifyLinks(dir) {
  const missing = [];
  const checked = new Set();

  for (const page of PAGES) {
    const htmlPath = path.join(dir, page);
    const html = fs.readFileSync(htmlPath, "utf8");
    for (const ref of extractAssetRefs(html)) {
      if (checked.has(ref)) continue;
      checked.add(ref);
      const target = path.join(dir, ref.split("?")[0]);
      if (!fs.existsSync(target)) missing.push(`${page} → ${ref}`);
    }

    for (const css of CSS_LINKED) {
      if (!html.includes(`css/${css}`)) {
        missing.push(`${page} → missing css/${css} link`);
      }
    }
    if (!html.includes("js/icons.js") || !html.includes("js/chrome.js") || !html.includes("js/main.js")) {
      missing.push(`${page} → missing core JS`);
    }
  }

  for (const js of JS_FILES) {
    const p = path.join(dir, "js", js);
    if (!fs.existsSync(p)) missing.push(`missing js/${js}`);
  }
  for (const css of CSS_FILES) {
    const p = path.join(dir, "css", css);
    if (!fs.existsSync(p)) missing.push(`missing css/${css}`);
  }
  if (!fs.existsSync(path.join(dir, "assets", "adc-logo.svg"))) {
    missing.push("missing assets/adc-logo.svg");
  }
  const thumbDir = path.join(dir, "assets", "web", "thumbs");
  if (!fs.existsSync(thumbDir)) {
    missing.push("missing assets/web/thumbs/");
  }

  return missing;
}

function verifyNoRemoteRuntime(dir) {
  const issues = [];
  const scan = (filePath) => {
    const text = fs.readFileSync(filePath, "utf8");
    if (/cloudinary\.com/i.test(text)) issues.push(`${path.basename(filePath)}: cloudinary`);
    if (/apps\.script\.google/i.test(text)) issues.push(`${path.basename(filePath)}: apps script`);
    if (/fetch\s*\(\s*['"]https?:/i.test(text)) issues.push(`${path.basename(filePath)}: fetch()`);
  };

  for (const page of PAGES) scan(path.join(dir, page));
  for (const js of JS_FILES) {
    const p = path.join(dir, "js", js);
    if (fs.existsSync(p)) scan(p);
  }
  return issues;
}


function main() {
  console.log(`ADC-26 site build${LIVE ? "" : " (test site)"} — copy-only (sources not rewritten)…`);
  // Stylesheets made of parts must be joined before they are published (css-build.mjs).
  try {
    execSync(`node ${JSON.stringify(path.join(__dirname, "css-build.mjs"))} --check`, { stdio: "inherit" });
  } catch {
    console.error("Stopped: run npm run css:build, commit, then publish.");
    process.exit(1);
  }
  rmrf(OUT);
  mkdirp(OUT);

  for (const page of PAGES) {
    let html = prepareHtml(page);
    html = sanitizeImages(html);
    html = injectProgressiveMarkup(html);
    html = injectScripts(html);
    fs.writeFileSync(path.join(OUT, page), html, "utf8");
  }

  for (const css of CSS_FILES) {
    // Stylesheets pulled in by @import get the same ?v= as the linked ones (in the copy only),
    // so a returning visitor never pairs a new stylesheet with an old tokens file.
    const text = fs.readFileSync(path.join(ROOT, "css", css), "utf8");
    const stamped = text.replace(/@import\s+url\((["']?)([\w.-]+\.css)\1\)/g, (m, q, file) =>
      (CSS_FILES.includes(file) ? `@import url(${q}${file}?v=${ASSET_VERSION}${q})` : m));
    mkdirp(path.join(OUT, "css"));
    fs.writeFileSync(path.join(OUT, "css", css), stamped);
  }
  for (const js of JS_FILES) {
    copyFile(path.join(ROOT, "js", js), path.join(OUT, "js", js));
  }
  if (!fs.existsSync(WEB_MEDIA_ROOT)) {
    console.error("Missing assets/web/ — run: npm run optimize:web");
    process.exitCode = 1;
  } else {
    console.log("  Copying assets/web/ (pre-optimized display + thumbs)…");
    const copied = copyTree(WEB_MEDIA_ROOT, path.join(OUT, "assets", "web"));
    console.log(
      `  Web media: ${copied.files} files, ${(copied.bytes / 1024 / 1024).toFixed(1)} MB`
    );
  }
  for (const grad of GRADIENT_FILES) {
    copyFile(
      path.join(ROOT, "assets", "gradients", grad),
      path.join(OUT, "assets", "gradients", grad)
    );
  }
  const logoSvg = path.join(ROOT, "assets", "adc-logo.svg");
  if (fs.existsSync(logoSvg)) copyFile(logoSvg, path.join(OUT, "assets", "adc-logo.svg"));
  const logoHires = path.join(ROOT, "assets", "adc-logo-hires.png");
  if (fs.existsSync(logoHires)) {
    copyFile(logoHires, path.join(OUT, "assets", "adc-logo-hires.png"));
    copyFile(logoHires, path.join(OUT, "assets", "adc-logo.png"));
  }

  for (const dir of site.hiddenFolders || []) copyTree(path.join(ROOT, dir), path.join(OUT, dir));

  if (LIVE) {
    // The live address publishes the search files, and stamps the commit Netlify built (COMMIT_REF)
    // so `npm run check:live` can prove abhinava.dance is at the latest commit.
    for (const file of site.searchFiles) copyFile(path.join(ROOT, file), path.join(OUT, file));
    const sha = process.env.COMMIT_REF || execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
    const stamp = [
      `sha=${sha}`, `short=${sha.slice(0, 7)}`, `branch=${process.env.BRANCH || ""}`, `asset=${ASSET_VERSION}`,
      `deploy_id=${process.env.DEPLOY_ID || ""}`, `deployed_at=${new Date().toISOString().replace(/\.\d+Z$/, "Z")}`,
    ];
    fs.writeFileSync(path.join(OUT, "DEPLOYED.txt"), stamp.join("\n") + "\n", "utf8");
  } else {
    // The test site must stay out of search results.
    fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nDisallow: /\n", "utf8");
  }

  const missing = verifyLinks(OUT);
  const htmlIssues = verifyHtmlIntegrity(OUT);
  const remote = verifyNoRemoteRuntime(OUT);

  if (htmlIssues.length) {
    console.error("\nHTML errors:");
    htmlIssues.forEach((m) => console.error("  -", m));
    process.exitCode = 1;
  } else {
    console.log("HTML check: css/js links valid");
  }

  if (missing.length) {
    console.error("\nLink errors:");
    missing.forEach((m) => console.error("  -", m));
    process.exitCode = 1;
  } else {
    console.log("\nLink check: all asset paths OK");
  }
  if (remote.length) {
    console.warn("\nRuntime warnings:");
    remote.forEach((m) => console.warn("  -", m));
  } else {
    console.log("Runtime check: static only");
  }

  console.log(`\nReady: dist/ for ${LIVE ? "abhinava.dance" : "the test site"} (${PAGES.length} pages, source cache v${ASSET_VERSION})`);

  console.log("Preview: ./export-tools/preview-site.sh");
}

main();
