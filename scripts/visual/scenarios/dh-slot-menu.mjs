// dh-slot-menu (round 2 gate: "the 1080p slot menu covers Hỏa Long"): in the
// setup, a click on each slot within 14 m of the dais opens its menu; the menu
// must stay off the Dragon (its screen box: 2.5 m round the dais centre, 1.5–6.5 m
// up, where Hỏa Long hovers) and inside the view. Pictures of the inner pads.
// Run at 1280×720 and 1920×1080. Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, outDir, press } from "./lib/dh.mjs";

const OUT = outDir("slot-menu");

const DRAGON_BOX = `(() => {
  const pts = [];
  for (const [x, z] of [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) for (const y of [1.5, 6.5]) pts.push(window.__dh.project(x, y, z));
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
})()`;

const MENU = `(() => {
  const m = document.querySelector('.dh-place-menu');
  if (!m || m.hidden) return null;
  const r = m.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, buttons: m.querySelectorAll('button').length };
})()`;

const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

export default async function (page) {
  const W = page.width;
  const H = page.height;
  await boot(page, "prelearn=0", { width: W, height: H });
  await page.sleep(500);
  const dragon = await page.eval(DRAGON_BOX);
  const slots = await page.eval(`(() => {
    const w = window.__dh.world();
    return w.map.slots.map((s, i) => ({ i, id: s.id, kind: s.kind, d: Math.hypot(s.pos[0], s.pos[1]) })).filter((s) => s.d <= 14);
  })()`);
  const rows = [];
  for (const slot of slots) {
    const marker = await page.locate(`.dh-marker[data-slot="${slot.i}"]`);
    if (!marker || marker.w === 0) {
      rows.push({ id: slot.id, kind: slot.kind, d: +slot.d.toFixed(1), marker: false });
      continue;
    }
    await page.mouse(marker.x, marker.y);
    await page.mouse(marker.x, marker.y, "mousePressed");
    await page.mouse(marker.x, marker.y, "mouseReleased");
    await page.sleep(250);
    const menu = await page.eval(MENU);
    const row = { id: slot.id, kind: slot.kind, d: +slot.d.toFixed(1), marker: true, menu: Boolean(menu) };
    if (menu) {
      row.dragonPx2 = Math.round(overlap(menu, dragon));
      row.inView = menu.left >= 0 && menu.top >= 0 && menu.right <= W && menu.bottom <= H;
      row.coversSlot = marker.x > menu.left && marker.x < menu.right && marker.y > menu.top && marker.y < menu.bottom;
      if (/^h-/.test(slot.id) || row.dragonPx2 > 0) await page.shot(join(OUT, `menu-${slot.id}-${W}x${H}.png`));
    }
    rows.push(row);
    await press(page, "Escape");
    await page.sleep(150);
    // A stray Esc with no menu opens the pause menu: close it.
    if (await page.eval("window.__dh.state().menuOpen")) {
      await press(page, "Escape");
      await page.sleep(150);
    }
  }
  const opened = rows.filter((r) => r.menu);
  return {
    ok: opened.length > 0 && opened.every((r) => r.dragonPx2 === 0 && r.inView && !r.coversSlot) && page.exceptions.length === 0,
    size: W + "x" + H,
    dragon: Object.fromEntries(Object.entries(dragon).map(([k, v]) => [k, Math.round(v)])),
    rows,
    badResources: await badResources(page),
  };
}
