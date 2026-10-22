#!/usr/bin/env node
/**
 * Saves the latest Instagram posts into the site at build time, so visitors
 * never load anything from Instagram or Behold.
 *
 * Each feed is switched on by a Behold JSON feed link in an environment
 * variable (set in Netlify, never committed):
 *   INSTAGRAM_FEED_MAIN    → @nirupama_rajendra   (Home, Gallery)
 *   INSTAGRAM_FEED_SCHOOL  → @abhinavadanceschool (School, footer link)
 *
 * Writes assets/web/instagram/<feed>/1.jpg… (and the same in assets/web/thumbs/instagram/)
 * and js/instagram-data.js.
 * A feed with no link, or one that fails to load, keeps what it had, so a
 * bad build never breaks the site.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "js/instagram-data.js");
const COUNT = 6;
const FEEDS = { main: "INSTAGRAM_FEED_MAIN", school: "INSTAGRAM_FEED_SCHOOL" };

const clean = (text) =>
  String(text || "Instagram post")
    .split("\n")[0]
    .replace(/[<>"'`&]/g, "")
    .trim()
    .slice(0, 90) || "Instagram post";

function imageOf(post) {
  const sized = post.sizes && (post.sizes.medium || post.sizes.large || post.sizes.full);
  if (post.mediaType === "VIDEO") return post.thumbnailUrl || (sized && sized.mediaUrl);
  return (sized && sized.mediaUrl) || post.mediaUrl || post.thumbnailUrl;
}

async function loadData() {
  const text = await readFile(DATA, "utf8");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return Function(`return (${json});`)();
}

async function refresh(key, link, feed) {
  const res = await fetch(link);
  if (!res.ok) throw new Error(`feed answered ${res.status}`);
  const body = await res.json();
  const items = (Array.isArray(body) ? body : body.posts || []).filter(imageOf).slice(0, COUNT);
  if (!items.length) throw new Error("feed has no posts");

  const dir = join(ROOT, "assets/web/instagram", key);
  const thumbs = join(ROOT, "assets/web/thumbs/instagram", key);
  await mkdir(dir, { recursive: true });
  await mkdir(thumbs, { recursive: true });
  const posts = [];
  for (const [i, item] of items.entries()) {
    const img = await fetch(imageOf(item));
    if (!img.ok) throw new Error(`photo ${i + 1} answered ${img.status}`);
    const bytes = Buffer.from(await img.arrayBuffer());
    await writeFile(join(dir, `${i + 1}.jpg`), bytes);
    // The page's progressive loader asks for a thumbs/ copy first; the posts are already small.
    await writeFile(join(thumbs, `${i + 1}.jpg`), bytes);
    posts.push({
      image: `assets/web/instagram/${key}/${i + 1}.jpg?t=${Date.now()}`,
      url: item.permalink || feed.url,
      caption: clean(item.prunedCaption || item.caption),
    });
  }
  return { ...feed, active: true, handle: body.username || feed.handle, posts };
}

const data = await loadData();
for (const [key, env] of Object.entries(FEEDS)) {
  const link = process.env[env];
  if (!link) {
    console.log(`instagram ${key}: no ${env}, left as it is`);
    continue;
  }
  try {
    data[key] = await refresh(key, link, data[key]);
    console.log(`instagram ${key}: ${data[key].posts.length} posts saved`);
  } catch (err) {
    console.warn(`instagram ${key}: kept the previous posts (${err.message})`);
  }
}

const header = (await readFile(DATA, "utf8")).split("const INSTAGRAM_FEEDS")[0];
await writeFile(DATA, `${header}const INSTAGRAM_FEEDS = ${JSON.stringify(data, null, 2)};\n`);
