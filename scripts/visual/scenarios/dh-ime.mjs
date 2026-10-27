// dh-ime (05 §10 lists it; added 27/10 after the test pass): a Vietnamese input method left on.
// Accented letters (Telex / VNI output: ă, đ, ơ, ê) reach no word, and a notice over the
// learning frame says to turn the input method off, ≥ 16 px, until a plain letter reaches the
// game; then English typing works. Headless Chrome hides the page after a keyCode-229
// "Process" key (seen by the 27/10 testers), so the composing key goes last and only its
// notice is read. Real Unikey / OpenKey / macOS Telex and VNI need a real keyboard (B9).
// SIZE=1920 runs at 1920×1080 (default 1280×720). Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, outDir, press, startWave, state, waitFor } from "./lib/dh.mjs";

const [W, H] = process.env.SIZE === "1920" ? [1920, 1080] : [1280, 720];

/** One key press as an input method sends it: `key` is the produced character. */
async function imeKey(page, key, code, keyCode = 65) {
  const base = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers: 0 };
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", ...base, text: key, unmodifiedText: key });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

const NOTICE = "(() => { const n = document.querySelector('.dh-notice'); if (!n || n.hidden) return null; const r = n.getBoundingClientRect(); return { text: n.innerText.trim(), cls: n.className, font: parseFloat(getComputedStyle(n).fontSize), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()";

export default async function (page) {
  const out = outDir("ime");
  const shots = [];
  const shot = async (name) => {
    const file = join(out, name + "-" + W + "x" + H + ".png");
    await page.shot(file);
    shots.push(file);
  };
  await boot(page, "prelearn=0", { width: W, height: H });
  const started = await startWave(page);
  await waitFor(page, "window.__dh.words().length > 0", { timeoutMs: 40000 });
  const before = await state(page);
  // Telex / VNI output: accented letters, never English.
  for (const [key, code] of [["ă", "KeyA"], ["đ", "KeyD"], ["ơ", "KeyO"], ["ê", "KeyE"]]) {
    await imeKey(page, key, code);
    await page.sleep(80);
  }
  await page.sleep(200);
  const during = await state(page);
  const notice = await page.eval(NOTICE);
  await shot("01-ime-notice");
  // A plain letter: it reaches the game and the notice goes.
  const word = (await page.eval("window.__dh.words()")).find((x) => x.kind !== "skill");
  if (word) await press(page, "Key" + word.text[word.typed].toUpperCase());
  await page.sleep(250);
  const after = await state(page);
  const cleared = await page.eval(NOTICE);
  await shot("02-after-english");
  // A composing key (keyCode 229) last: its notice only (the headless page may go hidden after it).
  await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Process", code: "KeyA", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Process", code: "KeyA", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await page.sleep(150);
  const composing = await page.eval(NOTICE);
  const result = {
    started,
    keysToSim: { before: before.keysToSim, during: during.keysToSim, after: after.keysToSim },
    notice,
    cleared,
    composing,
  };
  return {
    ok:
      started === true &&
      during.keysToSim === before.keysToSim &&
      notice !== null && /tắt bộ gõ tiếng Việt/.test(notice.text) && notice.font >= 16 &&
      after.keysToSim === before.keysToSim + 1 &&
      cleared === null &&
      composing !== null &&
      page.exceptions.length === 0,
    ...result,
    shots,
    badResources: await badResources(page),
  };
}
