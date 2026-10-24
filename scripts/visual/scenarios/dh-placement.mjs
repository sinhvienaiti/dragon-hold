// dh-placement (05 §10): slots show at the right time (setup, breaks, while
// placing; not in a wave), the ghost card and range ring at the cursor; every
// trap and support bought and placed by mouse and by keyboard (1…5, arrows,
// Enter), the consumable and both upgrades bought (6, 7, 8), edit mode by
// keyboard (` arrows, = twice upgrades, - twice sells, Esc) and by mouse (the
// slot menu). Gold and slots are read back from the world after each step.
// Owner: integrator (LANES.md).
import { join } from "node:path";
import { badResources, boot, MOD, outDir, press, state, waitFor } from "./lib/dh.mjs";

/** Lane px and slot px² under the wave card and the gold delta box against the gold number (round 2). */
const COVER = `(async () => {
  const z = await import('/src/ui/screen-zones.ts');
  const zones = z.zonesFor(document.getElementById('dh-overlay'));
  const box = (sel) => { const n = document.querySelector(sel); if (!n || n.closest('[hidden]')) return null; const r = n.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const view = { w: innerWidth, h: innerHeight };
  const card = box('.dh-wave-card');
  const c = card && zones ? z.spotCost(card, zones, [], view) : null;
  const gold = box('.dh-stat--gold b');
  const delta = box('.dh-gold-float');
  return { zones: Boolean(zones), waveCard: c && { lanePx: Math.round(c.lanes), slotPx2: Math.round(c.slots), at: [Math.round(card.x), Math.round(card.y)] }, goldOverlapPx2: gold && delta ? Math.round(z.overlapArea(gold, delta)) : null };
})()`;

const markersShown = (page) => page.eval("[...document.querySelectorAll('.dh-marker')].filter((m) => !m.hidden).length");

async function clickSel(page, selector) {
  const p = await page.locate(selector);
  if (!p || p.w === 0) return false;
  await page.mouse(p.x, p.y);
  await page.mouse(p.x, p.y, "mousePressed");
  await page.mouse(p.x, p.y, "mouseReleased");
  await page.sleep(150);
  return true;
}

async function placeByMouse(page, item) {
  const before = await state(page);
  const opened = await clickSel(page, `.dh-cell[data-item="${item}"]`);
  const mode = (await state(page)).placement;
  const clicked = await clickSel(page, ".dh-marker.is-cand:not([hidden])");
  const after = await state(page);
  return { item, way: "mouse", opened, mode, clicked, goldBefore: before.gold, goldAfter: after.gold, placed: after.slots.find((s) => s.includes("=" + item) && !before.slots.includes(s)) ?? null };
}

async function placeByKeys(page, digit, item, moves = 1) {
  const before = await state(page);
  await press(page, "Digit" + digit);
  await page.sleep(150);
  const mode = (await state(page)).placement;
  for (let k = 0; k < moves; k += 1) {
    await press(page, "ArrowRight");
    await page.sleep(80);
  }
  await press(page, "Enter");
  await page.sleep(200);
  const after = await state(page);
  if (!after.placement.startsWith("idle")) await press(page, "Escape");
  return { item, way: "keys", mode, goldBefore: before.gold, goldAfter: after.gold, placed: after.slots.find((s) => s.includes("=" + item) && !before.slots.includes(s)) ?? null };
}

/** Carry-strip cells whose text runs past the cell (round 2 gate: "Thiếu 28" and "Bom Hạt" at 720p). */
const STRIP_OVERFLOW = `[...document.querySelectorAll('.dh-strip .dh-cell')].filter((c) => c.offsetParent).flatMap((c) => {
  const box = c.getBoundingClientRect();
  return [...c.querySelectorAll('.dh-cell__name, .dh-cell__price, .dh-cell__reason')].filter((n) => n.offsetParent).filter((n) => {
    const r = n.getBoundingClientRect();
    return r.left < box.left - 0.5 || r.right > box.right + 0.5 || n.scrollWidth > n.clientWidth + 1;
  }).map((n) => c.dataset.item + ':' + n.className.replace('dh-cell__', '') + ':' + n.innerText.replace(/\\s+/g, ' ').trim());
})`;

export default async function (page) {
  const out = outDir("integrator");
  const steps = [];
  const sizes = process.env.SIZE === "1920" ? [[1920, 1080]] : [[1280, 720]];
  const [width, height] = sizes[0];
  await boot(page, "prelearn=0", { width, height });
  const prepMarkers = await markersShown(page);

  // Setup: two items by mouse, two by keyboard.
  steps.push(await placeByMouse(page, "spikes"));
  await page.shot(join(out, `place-mouse-spikes-${width}x${height}.png`));
  steps.push(await placeByKeys(page, 4, "moss-warden", 1));
  // Ghost card and range ring while placing.
  await press(page, "Digit2");
  await page.sleep(250);
  await page.shot(join(out, `place-ghost-pinebomb-${width}x${height}.png`));
  await press(page, "Escape");
  await page.sleep(100);
  const prep = await state(page);

  // Start; in the wave no slot shows and the number keys do not enter placement (C1–C5).
  await press(page, "Enter");
  await waitFor(page, "s.phase === 'wave'", { timeoutMs: 15000 });
  await page.sleep(400);
  const waveMarkers = await markersShown(page);
  await press(page, "Digit3");
  await page.sleep(150);
  const waveMode = (await state(page)).placement;
  // Esc only if it did open (a bare Esc in a wave opens the pause menu).
  if (!waveMode.startsWith("idle")) await press(page, "Escape");
  await page.shot(join(out, `place-wave-${width}x${height}.png`));

  // Waves play out with an in-page word bot (typing is not under test here), at speed.
  const playWave = async () => {
    await page.eval("window.__dh.setSpeed(6)");
    const n = await page.eval(`(async () => {
      const d = window.__dh; let n = 0;
      for (let k = 0; k < 4000; k += 1) {
        const w = d.world();
        if (w.phase !== 'wave' && w.phase !== 'warning') break;
        const lock = w.words.lock;
        const live = d.words();
        const word = lock >= 0 ? live.find((x) => x.slot === lock) : live[0];
        if (word) { for (const ch of word.text.slice(word.typed)) d.send({ type: 'key', letter: ch.charCodeAt(0) - 97 }); n += 1; }
        await new Promise((r) => setTimeout(r, 40));
      }
      return n;
    })()`);
    await page.eval("window.__dh.setSpeed(1)");
    await waitFor(page, "s.phase === 'break' || s.phase === 'defeat' || s.phase === 'victory'", { timeoutMs: 30000 });
    // Thẻ Ôn has its own scenario (dh-learning-frame): close it.
    for (let k = 0; k < 4 && (await page.eval("window.__dh.panel()")) === "review"; k += 1) {
      await press(page, "Escape");
      await page.sleep(100);
    }
    return n;
  };
  const nextWave = async () => {
    await press(page, "Enter", MOD.shift); // Gọi sớm
    await waitFor(page, "s.phase === 'wave'", { timeoutMs: 15000 });
  };
  let typed = await playWave(page);
  const breakState = await state(page);
  const breakMarkers = await markersShown(page);

  // Break 1: the net by mouse. Break 2: the pine bomb by keys. Break 3: the herb hut by mouse.
  steps.push(await placeByMouse(page, "net-launcher"));
  await nextWave();
  typed += await playWave(page);
  steps.push(await placeByKeys(page, 2, "pine-bomb", 1));
  await nextWave();
  typed += await playWave(page);
  steps.push(await placeByMouse(page, "herb-hut"));
  await page.shot(join(out, `place-break3-${width}x${height}.png`));
  const cover = await page.eval(COVER);
  const overflowBreak3 = await page.eval(STRIP_OVERFLOW);
  // Edit mode by keyboard: = twice upgrades the first built item, - twice sells the next one.
  await press(page, "Backquote");
  await page.sleep(150);
  const editMode = (await state(page)).placement;
  await page.shot(join(out, `place-edit-${width}x${height}.png`));
  await press(page, "Equal");
  await page.sleep(100);
  await press(page, "Equal");
  await page.sleep(200);
  const upgraded = await state(page);
  await press(page, "ArrowRight");
  await page.sleep(100);
  await press(page, "Minus");
  await page.sleep(100);
  await press(page, "Minus");
  await page.sleep(200);
  const sold = await state(page);
  await press(page, "Escape");
  await page.sleep(150);

  // Keys 6, 7, 8 need 30 + 80 + 70 Vàng: play more waves until a break holds that much.
  const SHOP_GOLD = 180;
  for (let k = 0; k < 3 && (await state(page)).gold < SHOP_GOLD; k += 1) {
    await nextWave();
    typed += await playWave(page);
  }

  // A buy by key waits for the same key again (a stray digit never spends gold): one press arms, the second buys.
  const shopBefore = await state(page);
  await press(page, "Digit6");
  await page.sleep(150);
  const armed = await state(page);
  const armedCell = await page.eval("document.querySelector('.dh-cell.is-armed')?.dataset.item ?? null");
  await page.shot(join(out, `place-armed-${width}x${height}.png`));
  await press(page, "Digit6");
  await page.sleep(150);
  for (const digit of ["Digit7", "Digit8"]) {
    await press(page, digit);
    await page.sleep(120);
    await press(page, digit);
    await page.sleep(150);
  }
  const shopAfter = await state(page);
  // Round 2 gate: the "press again" notice must go with the buy (it named the old price).
  const infoAfterBuy = await page.eval("document.querySelector('.dh-strip__info')?.innerText.replace(/\\s+/g, ' ').trim() ?? ''");
  const overflowAfterBuy = await page.eval(STRIP_OVERFLOW);
  const stripReasons = await page.eval("[...document.querySelectorAll('.dh-cell')].map((c) => c.dataset.item + ':' + c.innerText.replace(/\\s+/g, ' ').trim())");

  // Mouse edit: click a built marker, the menu shows upgrade and sell.
  // The lowest filled marker on screen (clear of the top panels).
  const lowest = await page.eval("(() => { const ms = [...document.querySelectorAll('.dh-marker.is-filled:not([hidden])')]; ms.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top); return ms[0] ? ms[0].dataset.slot : null; })()");
  const menuOpened = lowest !== null && (await clickSel(page, `.dh-marker[data-slot="${lowest}"]`));
  await page.sleep(200);
  await page.shot(join(out, `place-menu-${width}x${height}.png`));
  const menuButtons = await page.eval("[...document.querySelectorAll('.dh-place-menu:not([hidden]) button')].map((b) => b.innerText.replace(/\\s+/g, ' ').trim())");
  await press(page, "Escape");

  return {
    armedBuy: { cell: armedCell, goldBefore: shopBefore.gold, goldAfterOnePress: armed.gold, heldAfterOnePress: armed.held },
    markers: { prep: prepMarkers, wave: waveMarkers, break: breakMarkers },
    waveNumberKeyMode: waveMode,
    prepGold: prep.gold,
    typed,
    breakPhase: breakState.phase,
    steps,
    shop: {
      goldBefore: shopBefore.gold,
      goldAfter: shopAfter.gold,
      held: shopAfter.held,
      heroBuys: shopAfter.heroBuys,
      allBought: (shopAfter.held?.["small-potion"] ?? 0) >= 1 && (shopAfter.heroBuys?.["dragon-heart"] ?? 0) >= 1 && (shopAfter.heroBuys?.["hard-scale"] ?? 0) >= 1,
      stripReasons,
      infoAfterBuy,
      staleNotice: /lần nữa/.test(infoAfterBuy),
      overflow: { break3: overflowBreak3, afterBuy: overflowAfterBuy },
    },
    edit: { mode: editMode, slotsBefore: sold.slots.length, upgraded: upgraded.slots, sold: sold.slots, goldAfterSell: sold.gold },
    menu: { opened: menuOpened, buttons: menuButtons },
    cover,
    end: await state(page),
    badResources: await badResources(page),
  };
}
