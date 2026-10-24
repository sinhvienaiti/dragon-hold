// Shared helpers for the dh-* browser scenarios (cdp-run.mjs page API): boot the
// game, wait for window.__dh, real key presses over CDP (Alt, Shift), load errors.
// Owner: integrator (LANES.md).
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const BASE = (process.env.URL ?? "http://127.0.0.1:3005/").replace(/\/$/, "");
export const outDir = (lane) => {
  const dir = resolve(process.env.OUT_DIR ?? join("tmp/shots", lane));
  mkdirSync(dir, { recursive: true });
  return dir;
};

/** CDP modifier bits. */
export const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

const KEY_CODES = {
  Enter: 13, Escape: 27, Backspace: 8, Tab: 9, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Backquote: 192, Equal: 187, Minus: 189,
};

/** One real key press: `code` like "KeyA", "Digit1", "Enter"; `mods` from MOD. */
export async function press(page, code, mods = 0) {
  let key = code;
  let text;
  let keyCode = KEY_CODES[code];
  if (code.startsWith("Key")) {
    key = mods & MOD.shift ? code.slice(3) : code.slice(3).toLowerCase();
    text = mods & (MOD.alt | MOD.ctrl | MOD.meta) ? undefined : key;
    keyCode = code.charCodeAt(3);
  } else if (code.startsWith("Digit")) {
    key = code.slice(5);
    text = mods & (MOD.alt | MOD.ctrl | MOD.meta | MOD.shift) ? undefined : key;
    keyCode = 48 + Number(key);
  } else if (code === "Enter") {
    key = "Enter";
    text = "\r";
  } else if (code === "Backquote") {
    key = "`";
    text = "`";
  } else if (code === "Equal") {
    key = "=";
    text = "=";
  } else if (code === "Minus") {
    key = "-";
    text = "-";
  }
  const base = { key, code, modifiers: mods, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
  await page.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, ...(text ? { text, unmodifiedText: text } : {}) });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

/** Types a word letter by letter as real key presses, `gapMs` apart. */
export async function typeWord(page, word, gapMs = 40) {
  for (const ch of word) {
    await press(page, "Key" + ch.toUpperCase());
    if (gapMs > 0) await page.sleep(gapMs);
  }
}

/**
 * Opens the game and waits for window.__dh.ready. Without `wpm=` in the query
 * the game asks for a typing speed first (app/typing-pace.ts): scenarios play
 * at the reference 35 WPM unless they say otherwise (dh-pace.mjs opens the card).
 */
export async function boot(page, query = "", { width, height } = {}) {
  if (width && height) {
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: page.dpr ?? 1, mobile: false });
  }
  if (!/(^|&)wpm=/.test(query)) query = query ? query + "&wpm=35" : "wpm=35";
  await page.goto(BASE + "/" + "?" + query, { settle: 300 });
  for (let wait = 0; wait < 120; wait += 1) {
    const ready = await page.eval("window.__dh?.ready === true");
    if (ready === true) break;
    await page.sleep(250);
  }
  // Give the GPU a few frames (shaders, models).
  await page.sleep(800);
  return page.eval("window.__dh.state()");
}

export const state = (page) => page.eval("window.__dh.state()");

/** Steps the scenario until `predicate` (a JS expression over s = __dh.state()) is true. */
export async function waitFor(page, predicate, { timeoutMs = 60000, everyMs = 200 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await page.eval("(() => { const s = window.__dh.state(); return !!(" + predicate + "); })()");
    if (ok === true) return true;
    await page.sleep(everyMs);
  }
  return false;
}

/** Failed or 404 resources (the runner only logs console errors). */
export const badResources = (page) =>
  page.eval("performance.getEntriesByType('resource').filter((r) => (r.responseStatus ?? 200) >= 400).map((r) => r.name + ' ' + r.responseStatus)");

/** Closes Học trước with Escape presses if it is open. */
export async function skipPrelearn(page) {
  for (let k = 0; k < 12; k += 1) {
    const panel = await page.eval("window.__dh.panel()");
    if (panel !== "prelearn") return;
    await press(page, "Escape");
    await page.sleep(120);
  }
}

/** The live word to type next: the lock if any, else the nearest foe word (urgent first). */
export const pickWord = (page) =>
  page.eval(`(() => {
    const d = window.__dh; const w = d.world(); const ws = d.words();
    if (ws.length === 0) return null;
    if (w.words.lock >= 0) { const lw = ws.find((x) => x.slot === w.words.lock); if (lw) return { text: lw.text, typed: lw.typed, slot: lw.slot }; }
    const urgent = ws.find((x) => x.kind === 'urgent'); if (urgent) return { text: urgent.text, typed: 0, slot: urgent.slot };
    let best = null; let bestD = 1e18;
    for (const x of ws) {
      let dist = 1e12;
      if (x.target) { const e = w.enemies.list[x.target.slot]; if (e && e.alive) dist = e.x * e.x + e.z * e.z; }
      if (dist < bestD) { bestD = dist; best = x; }
    }
    return best ? { text: best.text, typed: best.typed, slot: best.slot } : null;
  })()`);
