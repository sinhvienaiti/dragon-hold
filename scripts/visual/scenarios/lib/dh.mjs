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
 * speechSynthesis stubbed in every document the page opens (26/10 review): on
 * the Mac, headless Chrome 155 stalls CDP replies for 13–15 s after
 * cancel() + speak() with the network voice, so dh-hitstop-keys sent 23 of
 * ~100 keys and dh-words typed 1–4 words a run. The stub counts what the game
 * would say (`window.__dhSpoke`). SPEECH=1 keeps the real voice.
 */
const SPEECH_STUB = "(() => { window.__dhSpoke = 0; try { const s = window.speechSynthesis; if (s) { s.speak = () => { window.__dhSpoke += 1; }; s.cancel = () => {}; } } catch {} })()";
const stubbed = new WeakSet();
async function stubSpeech(page) {
  if (process.env.SPEECH === "1" || stubbed.has(page)) return;
  stubbed.add(page);
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: SPEECH_STUB });
}

/**
 * Opens the game and waits for window.__dh.ready. Without `wpm=` in the query
 * the game asks for a typing speed first (app/typing-pace.ts): scenarios play
 * at the reference 35 WPM unless they say otherwise (dh-pace.mjs opens the card)
 * or the WPM environment variable names another speed (WPM=70: k 1.50).
 */
export async function boot(page, query = "", { width, height } = {}) {
  await stubSpeech(page);
  if (width && height) {
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: page.dpr ?? 1, mobile: false });
  }
  const wpm = /^\d+$/.test(process.env.WPM ?? "") ? process.env.WPM : "35";
  if (!/(^|&)wpm=/.test(query)) query = query ? query + "&wpm=" + wpm : "wpm=" + wpm;
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

/**
 * Enter until wave 1 runs (26/10 review: one 720p run's Enter after boot left
 * the stage in Bày binh, and 89 keys typed nothing while the run still read
 * "0 lost"). Up to `tries` presses, `waitMs` each; true once the phase is
 * "wave". Scenarios put the result in their `ok`.
 */
export async function startWave(page, { tries = 3, waitMs = 8000 } = {}) {
  for (let k = 0; k < tries; k += 1) {
    const phase = (await state(page)).phase;
    if (phase === "wave") return true;
    // In the 6 s warning the wave is already on its way: wait, do not press again.
    if (phase !== "warning") await press(page, "Enter");
    if (await waitFor(page, "s.phase === 'wave'", { timeoutMs: waitMs })) return true;
  }
  return (await state(page)).phase === "wave";
}

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

/**
 * In-page check of the damage numbers as drawn, not as boxed (review 2 minor 2):
 * NumberField.box() both spaces the numbers and judges __dh.numbersTouching(),
 * so a box narrower than the drawing passes its own test. This reads what
 * NumberSprites last uploaded for the GPU (`iRect`, `iUv`: one quad per glyph,
 * one for the "HOÀN HẢO" label, grouped per live number in write() order) and
 * the ink inside each quad from the glyph atlas canvas (alpha ≥ 0.1, the dark
 * outline included; a glyph's ink bounding box, so a slight over-count).
 * Installs `window.__dhInk()`: live numbers, number pairs whose ink boxes
 * overlap (all, and those whose overlap is inside the view: a number lifted
 * above the top edge is uploaded but never seen), the smallest ink gap between
 * two numbers (px, < 0 overlap; all, and between numbers both in view), and
 * how far ink reaches outside each number's box() (left, right, top, bottom).
 * Call it right after a frame (the field is then as last drawn).
 */
export const INSTALL_INK_CHECK = `(() => {
  if (window.__dhInk) return true;
  const ALPHA = 26;
  const cache = new Map();
  let atlas = null; let pixels = null; let pw = 0; let ph = 0;
  const readAtlas = (canvas) => {
    if (canvas === atlas && pixels !== null) return;
    pw = canvas.width; ph = canvas.height;
    pixels = canvas.getContext('2d').getImageData(0, 0, pw, ph).data;
    atlas = canvas; cache.clear();
  };
  const inkIn = (u0, v0, u1, v1) => {
    const x0 = Math.round(u0 * pw); const x1 = Math.round(u1 * pw); const y0 = Math.round(v0 * ph); const y1 = Math.round(v1 * ph);
    const key = x0 + ',' + y0 + ',' + x1 + ',' + y1;
    if (cache.has(key)) return cache.get(key);
    let a = Infinity; let b = -Infinity; let c = Infinity; let d = -Infinity;
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      if (pixels[(y * pw + x) * 4 + 3] < ALPHA) continue;
      if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y;
    }
    const out = a === Infinity ? null : { fx0: (a - x0) / (x1 - x0), fx1: (b + 1 - x0) / (x1 - x0), fy0: (c - y0) / (y1 - y0), fy1: (d + 1 - y0) / (y1 - y0) };
    cache.set(key, out);
    return out;
  };
  const r1 = (v) => Math.round(v * 10) / 10;
  window.__dhInk = () => {
    const layer = window.__dh.numberLayer();
    const field = layer ? layer.numbers : null;
    const sprites = layer ? layer.sprites : null;
    const empty = { numbers: field ? field.live : 0, perfect: 0, quads: 0, consistent: true, dropped: field ? field.dropped : 0, pairsTouching: 0, pairsTouchingOnScreen: 0, inkPairsOverlap: 0, minGapPx: null, minGapOnScreenPx: null, outsideBox: 0, outsidePx: { left: 0, right: 0, top: 0, bottom: 0 }, outsideByGlyph: {}, examples: [], bounds: null };
    if (!field || field.live === 0 || !sprites) return empty;
    const mesh = sprites.mesh; const geo = mesh.geometry;
    readAtlas(mesh.material.uniforms.uAtlas.value.image);
    const n = geo.instanceCount; const R = geo.attributes.iRect.array; const U = geo.attributes.iUv.array;
    const nums = []; let q = 0;
    const box = { x: 0, y: 0, w: 0, h: 0 };
    for (let i = 0; i < field.alive.length; i += 1) {
      if (field.alive[i] === 0) continue;
      const perfect = field.style[i] === 2;
      const text = field.text(i);
      const count = text.length + (perfect ? 1 : 0);
      const inks = [];
      for (let c = 0; c < count && q < n; c += 1, q += 1) {
        const o = q * 4; const k = inkIn(U[o], U[o + 1], U[o + 2], U[o + 3]);
        if (k === null) continue;
        inks.push({ glyph: c < text.length ? text[c] : 'label', x: R[o] + k.fx0 * R[o + 2], y: R[o + 1] + k.fy0 * R[o + 3], w: (k.fx1 - k.fx0) * R[o + 2], h: (k.fy1 - k.fy0) * R[o + 3] });
      }
      field.box(i, box);
      nums.push({ text: field.text(i) + (perfect ? '*' : ''), perfect, inks, box: { x: box.x, y: box.y, w: box.w, h: box.h } });
    }
    // Round 3: an overlap is "on screen" when the two ink boxes' common part lies in the view (numbers lifted
    // above the top edge are uploaded but never seen).
    let pairsTouching = 0; let pairsTouchingOnScreen = 0; let inkPairsOverlap = 0; let minGap = Infinity; let minGapOnScreen = Infinity; const examples = [];
    const seen = (x0, y0, x1, y1) => x1 > 0 && y1 > 0 && x0 < innerWidth && y0 < innerHeight;
    for (let a = 0; a < nums.length; a += 1) for (let b = a + 1; b < nums.length; b += 1) {
      let touch = false; let touchSeen = false;
      for (const p of nums[a].inks) for (const r of nums[b].inks) {
        const gap = Math.max(r.x - (p.x + p.w), p.x - (r.x + r.w), r.y - (p.y + p.h), p.y - (r.y + r.h));
        if (gap < minGap) minGap = gap;
        const visible = seen(Math.min(p.x, r.x), Math.min(p.y, r.y), Math.max(p.x + p.w, r.x + r.w), Math.max(p.y + p.h, r.y + r.h)) && seen(p.x, p.y, p.x + p.w, p.y + p.h) && seen(r.x, r.y, r.x + r.w, r.y + r.h);
        if (visible && gap < minGapOnScreen) minGapOnScreen = gap;
        if (gap < 0) {
          inkPairsOverlap += 1; touch = true;
          if (seen(Math.max(p.x, r.x), Math.max(p.y, r.y), Math.min(p.x + p.w, r.x + r.w), Math.min(p.y + p.h, r.y + r.h))) touchSeen = true;
        }
      }
      if (touch) {
        pairsTouching += 1;
        if (touchSeen) pairsTouchingOnScreen += 1;
        if (examples.length < 4) { const ys = [...nums[a].inks, ...nums[b].inks].map((k) => [k.y, k.y + k.h]).flat(); examples.push(nums[a].text + ' / ' + nums[b].text + ' y ' + Math.round(Math.min(...ys)) + '…' + Math.round(Math.max(...ys)) + (touchSeen ? '' : ' (off screen)')); }
      }
    }
    const out = { left: 0, right: 0, top: 0, bottom: 0 }; let outsideBox = 0; const outsideByGlyph = {};
    let bx0 = Infinity; let by0 = Infinity; let bx1 = -Infinity; let by1 = -Infinity;
    for (const m of nums) {
      let worst = 0;
      for (const r of m.inks) {
        const l = m.box.x - r.x; const rt = r.x + r.w - (m.box.x + m.box.w); const t = m.box.y - r.y; const bt = r.y + r.h - (m.box.y + m.box.h);
        out.left = Math.max(out.left, l); out.right = Math.max(out.right, rt); out.top = Math.max(out.top, t); out.bottom = Math.max(out.bottom, bt);
        const most = Math.max(l, rt, t, bt);
        if (most > 0.5) outsideByGlyph[r.glyph] = Math.max(outsideByGlyph[r.glyph] ?? 0, r1(most));
        worst = Math.max(worst, most);
        bx0 = Math.min(bx0, r.x); by0 = Math.min(by0, r.y); bx1 = Math.max(bx1, r.x + r.w); by1 = Math.max(by1, r.y + r.h);
      }
      if (worst > 0.5) outsideBox += 1;
    }
    return {
      numbers: nums.length, perfect: nums.filter((m) => m.perfect).length, quads: n, consistent: q === n, dropped: field.dropped,
      pairsTouching, pairsTouchingOnScreen, inkPairsOverlap, minGapPx: minGap === Infinity ? null : r1(minGap), minGapOnScreenPx: minGapOnScreen === Infinity ? null : r1(minGapOnScreen), outsideBox,
      outsidePx: { left: r1(out.left), right: r1(out.right), top: r1(out.top), bottom: r1(out.bottom) }, outsideByGlyph, examples,
      bounds: bx0 === Infinity ? null : { x: Math.floor(bx0), y: Math.floor(by0), w: Math.ceil(bx1 - bx0), h: Math.ceil(by1 - by0) },
    };
  };
  return true;
})()`;

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
