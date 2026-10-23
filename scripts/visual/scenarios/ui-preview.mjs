// UI lane preview (src/ui/ui-preview.ts): every screen at 1280 × 720 and 1920 × 1080,
// keep-out overlap checks against the learning frame and word tags, and a
// keyboard-only pass (00 §6) through placement, edit, buys, call-early and skills.
//   URL=http://127.0.0.1:3216/ node scripts/visual/cdp-run.mjs scripts/visual/scenarios/ui-preview.mjs
// Shots go to tmp/shots/ui/. Owner: ui (LANES.md).
const base = (process.env.URL ?? "http://127.0.0.1:3005/").replace(/\/$/, "");
const out = process.env.OUT_DIR ?? "tmp/shots/ui";

const SIZES = [
  [1280, 720],
  [1920, 1080],
];
const SCENES = ["prep", "break", "placing", "edit", "menu", "warning", "wave", "low", "victory", "defeat"];

async function boot(page) {
  await page.goto(base + "/?view=ui", { settle: 600 });
  // Until main.ts routes ?view=ui (integrator), load the preview module directly.
  const ready = await page.eval(`(async () => {
    if (!window.__dhUi) { const m = await import("/src/ui/ui-preview.ts"); m.startUiPreview(document); }
    await document.fonts.ready;
    return Boolean(window.__dhUi);
  })()`);
  return ready;
}

const OVERLAPS = `(() => {
  const vis = (el) => { if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.05 ? r : null; };
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const keep = [...document.querySelectorAll("[data-keepout]")].map((el) => ({ el, r: vis(el) })).filter((x) => x.r);
  const frame = vis(document.querySelector('[data-fake="learning-frame"]'));
  const tags = [...document.querySelectorAll("[data-fake-tag]")].map((el) => ({ el, r: vis(el) })).filter((x) => x.r);
  const name = (el) => el.dataset.ui ?? el.className.split(" ").slice(-1)[0];
  const out = [];
  for (const k of keep) {
    if (frame && hit(k.r, frame)) out.push(name(k.el) + " × learning-frame");
    for (const t of tags) if (hit(k.r, t.r)) out.push(name(k.el) + " × tag " + t.el.textContent);
    if (k.r.left < 0 || k.r.top < 0 || k.r.right > innerWidth || k.r.bottom > innerHeight) out.push(name(k.el) + " off screen");
  }
  // Panels must not overlap one another either.
  for (let i = 0; i < keep.length; i += 1) for (let j = i + 1; j < keep.length; j += 1) if (hit(keep[i].r, keep[j].r)) out.push(name(keep[i].el) + " × " + name(keep[j].el));
  const area = keep.reduce((sum, k) => sum + k.r.width * k.r.height, 0) / (innerWidth * innerHeight);
  return { overlaps: out, hudAreaPct: Math.round(area * 1000) / 10, frame: frame ? [Math.round(frame.left), Math.round(frame.right)] : null };
})()`;

async function key(page, code, key, modifiers = 0) {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, modifiers, text: modifiers === 0 && key.length === 1 ? key : undefined });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers });
  await page.sleep(60);
}

export default async function (page) {
  const report = { screens: {}, keyboard: null, mouse: null, failedLoads: [] };
  if (!(await boot(page))) return { error: "preview did not start" };

  for (const [w, h] of SIZES) {
    await page.viewport(w, h);
    await page.sleep(250);
    for (const scene of SCENES) {
      await page.eval(`window.__dhUi.scene(${JSON.stringify(scene === "menu" ? "break" : scene)})`);
      await page.sleep(120);
      if (scene === "edit") await key(page, "Equal", "=");
      if (scene === "menu") {
        // Mouse: click an empty inner house pad (h-sw, slot index 14) to open its menu.
        await page.click('.dh-marker[data-slot="14"]');
      }
      if (scene === "placing") await key(page, "ArrowLeft", "ArrowLeft");
      await page.sleep(scene === "victory" || scene === "defeat" ? 900 : 380);
      const file = `${out}/${w}x${h}-${scene}.png`;
      await page.shot(file);
      report.screens[`${w}x${h}-${scene}`] = await page.eval(OVERLAPS);
    }
  }

  // Keyboard only at 1280 × 720 (00 §6): place spikes, upgrade, sell, buy, call early, skills.
  await page.viewport(1280, 720);
  await page.eval(`window.__dhUi.scene("break"); window.__dhUi.commands.length = 0; window.__dhUi.actions.length = 0;`);
  await page.sleep(150);
  const steps = [];
  const state = async (label) => steps.push({ label, ...(await page.eval("window.__dhUi.state()")) });
  await key(page, "Digit1", "1"); // carry-1: Gai Chông → placement
  await key(page, "ArrowRight", "ArrowRight");
  await state("placing spikes");
  await page.shot(`${out}/kb-1-placing.png`);
  await key(page, "Enter", "Enter");
  await page.sleep(100);
  await state("placed");
  await key(page, "Backquote", "`"); // edit mode
  await key(page, "Equal", "=");
  await page.shot(`${out}/kb-2-edit-armed.png`);
  await key(page, "Equal", "="); // second press: upgrade
  await page.sleep(100);
  await state("upgraded");
  await key(page, "Minus", "-");
  await key(page, "Minus", "-"); // sell
  await page.sleep(100);
  await state("sold");
  await key(page, "Escape", "Escape");
  await key(page, "Digit6", "6"); // carry-6: Bình Máu Nhỏ (buy)
  await key(page, "Digit7", "7"); // key 7: Tim Rồng (buy)
  await page.sleep(100);
  await state("bought");
  await page.shot(`${out}/kb-3-bought.png`);
  await key(page, "Enter", "Enter", 8); // Shift + Enter: call early
  await page.sleep(150);
  await state("called early");
  await page.eval(`window.__dhUi.scene("wave")`);
  await page.sleep(150);
  await key(page, "Digit1", "¡", 1); // Alt + 1: Phun Lửa
  await key(page, "Digit2", "™", 1); // Alt + 2: on cooldown → gentle toast
  await key(page, "Digit7", "¶", 1); // Alt + 7: consumable (cooling) → toast from the stand-in sink
  await key(page, "Digit5", "∞", 1); // Alt + 5: Viêm Đế
  await page.sleep(200);
  await page.shot(`${out}/kb-4-wave-keys.png`);
  await state("wave keys");
  report.keyboard = {
    steps,
    commands: await page.eval("window.__dhUi.commands.map((c) => c.type + (c.item ? ':' + c.item : '') + (c.skill ? ':' + c.skill : '') + (c.slot ? '@' + c.slot : ''))"),
    actions: await page.eval("window.__dhUi.actions.slice()"),
  };

  // Mouse: click a strip cell, then a lit slot.
  await page.eval(`window.__dhUi.scene("break"); window.__dhUi.commands.length = 0;`);
  await page.sleep(150);
  await page.click('.dh-cell[data-item="moss-warden"]');
  await page.sleep(150);
  const cand = await page.eval(`(() => { const m = document.querySelector('.dh-marker.is-cursor'); return m ? m.dataset.slot : null; })()`);
  if (cand !== null) await page.click(`.dh-marker[data-slot="${cand}"]`);
  await page.sleep(150);
  report.mouse = { cursorSlot: cand, commands: await page.eval("window.__dhUi.commands.map((c) => c.type + ':' + (c.item ?? '') + '@' + (c.slot ?? ''))") };

  report.failedLoads = await page.eval(`performance.getEntriesByType("resource").filter((e) => e.responseStatus >= 400).map((e) => e.name + " " + e.responseStatus)`);
  return report;
}
