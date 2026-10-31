// dh-ground-tiles (DH-12, map pilot A3): run against a production build (`vite preview`)
// to prove the ground paint gets its tiles and decals. On the game page and on the
// terrain preview it reads both manifests from the page, then waits until the paint
// has asked for every texture they list; it throws (cdp-run exits 1) when a manifest
// or a tile fails (HTTP ≥ 400, never asked, or not the WebP the manifest names: a
// server's SPA fallback answers 200 with index.html), when anything is asked of
// /art-src/, or when the paint logs that a texture did not load or decode.
// Env: URL (default http://127.0.0.1:3005/), Q (quality, default high).
// Owner: map pilot.
import { BASE } from "./lib/dh.mjs";

const Q = process.env.Q ?? "high";
const KINDS = ["ground", "decals"];

const RESOURCES = `performance.getEntriesByType("resource").map((r) => ({ name: r.name, status: r.responseStatus ?? 0 }))`;

async function checkPage(page, path) {
  await page.goto(BASE + path, { settle: 300 });
  const manifests = await page.eval(`Promise.all(${JSON.stringify(KINDS)}.map((kind) =>
    fetch("/assets/dragon-hold/" + kind + "/manifest.json").then((r) => r.ok ? r.json() : { status: r.status }).catch((e) => ({ error: String(e) }))))`);
  const problems = [];
  const expected = [];
  manifests.forEach((manifest, k) => {
    if (!manifest || !manifest.textures) problems.push(KINDS[k] + " manifest: " + JSON.stringify(manifest));
    else for (const entry of Object.values(manifest.textures)) expected.push(new URL(entry.url, BASE + "/").href);
  });
  let resources = [];
  let pending = expected;
  for (let i = 0; i < 200; i += 1) {
    resources = await page.eval(RESOURCES);
    const done = new Set(resources.filter((r) => r.status > 0 && r.status < 400).map((r) => r.name));
    pending = expected.filter((url) => !done.has(url));
    if (pending.length === 0) break;
    await page.sleep(100);
  }
  for (const url of pending) problems.push("never asked: " + url);
  // Fetched again (cached): the body must be the manifest's WebP, not a fallback page.
  const bodies = await page.eval(`Promise.all(${JSON.stringify(expected)}.map((url) => fetch(url).then(async (r) =>
    ({ url, status: r.status, type: r.headers.get("content-type"), bytes: (await r.arrayBuffer()).byteLength })).catch((e) => ({ url, error: String(e) }))))`);
  const sizes = new Map();
  for (const manifest of manifests) for (const entry of Object.values(manifest?.textures ?? {})) sizes.set(new URL(entry.url, BASE + "/").href, entry.bytes);
  for (const body of bodies) {
    if (body.error || body.status >= 400 || !String(body.type).startsWith("image/webp") || body.bytes !== sizes.get(body.url)) problems.push("bad body: " + JSON.stringify(body));
  }
  for (const r of resources) {
    if (r.name.includes("/art-src/")) problems.push("asked /art-src/: " + r.name);
    if (/\/assets\/dragon-hold\/(ground|decals)\//.test(r.name) && r.status >= 400) problems.push("HTTP " + r.status + ": " + r.name);
  }
  const terrain = path.includes("view=terrain") ? await page.eval("window.__dhTerrain?.info().ground ?? null") : null;
  if (terrain && terrain.missing.length > 0) problems.push("paint missing: " + terrain.missing.join(", "));
  return { path, expected: expected.length, loaded: expected.length - pending.length, paint: terrain, problems };
}

export default async function (page) {
  const pages = [];
  for (const path of ["/?view=terrain&hud=0&q=" + Q, "/?q=" + Q]) pages.push(await checkPage(page, path));
  // The paint logs "paint: … did not load" (console.error) for a texture it could not get.
  const paintErrors = page.logs.filter((line) => /paint: .*(did not load|manifest)/.test(line));
  const failed = pages.filter((p) => p.problems.length > 0 || p.expected !== 12);
  if (paintErrors.length > 0) failed.push({ paintErrors });
  if (failed.length > 0) throw new Error("dh-ground-tiles failed: " + JSON.stringify(failed, null, 1));
  return { ok: true, pages };
}
