# Lanes and contracts (M0a)

Each lane writes only the paths it owns. Stubs already carry the exported
signatures; fill the bodies (look for `TODO(<lane>)`), keep the signatures, and
add new files only inside your own paths. Numbers come from
`src/content/rules.ts` (canon `00-canon.md`), never from literals in systems.

## Owned paths

| Lane | Owns |
|---|---|
| **architect** (done) | Repo skeleton, `src/content/types.ts`, `src/content/rules.ts`, `src/content/data/maps.ts`, `src/sim/{world,fixed,lanes,events,hash}.ts`, `src/app/contracts.ts`, `tests/boundary.test.ts`, `tests/content/**`, `AGENTS.md`, `LANES.md`. Handed over as listed below |
| **sim-battle** | `src/sim/{world,waves,spawn,movement,combat,boss,auras}.ts`, `src/content/data/{enemies,generals,waves,stages}.ts`; from now on also `src/content/types.ts`, `src/content/rules.ts`, `src/content/data/maps.ts`, `src/sim/{fixed,lanes,events,hash}.ts`, `tests/content/**` |
| **sim-ourside** | `src/sim/{traps,houses,units,shop,economy,status,placement}.ts`, `src/content/data/our-side.ts` |
| **typing-learning** | `src/sim/words.ts`, `src/typing/**`, `src/ui/{tags,learning-frame}.ts`, `src/app/learning.ts` |
| **view-terrain** | `src/view/{stage,terrain,water,scatter,camera,paths}.ts` |
| **view-crowd-fx** | `src/view/{crowd,actors,heroes,fx,telegraphs,hpbars,bench}.ts`, `scripts/visual/scenarios/dh-bench.mjs` (bench first) |
| **ui** | `src/ui/{hud,shop-strip,placement-ui,wave-card,results,skin}.ts`, `src/ui/styles/**` |
| **audio** | `src/audio/**` |
| **bot-balance** | `scripts/balance/**`, `tests/sim/**`, `tests/golden/**` |
| **integrator** (later) | `src/main.ts`, `src/app/{app,loop,input-router,contracts}.ts`, `scripts/visual/scenarios/dh-*.mjs` except `dh-bench.mjs`, `vite.config.ts`, `scripts/dev/**` |

Nobody edits `src/kit/**` (copied from `shared/game-kit`, sha256-checked).
`scripts/visual/cdp-run.mjs` is a verbatim copy of Space's; keep it identical.

## Shared types: who owns them

- `src/content/types.ts`, `rules.ts`, `data/maps.ts` and `src/sim/world.ts`:
  the architect wrote them for M0a; **sim-battle owns them from now on**.
- A lane that needs a type change declares the new type in **its own file**
  (for example `export interface TrapState` in `traps.ts`), uses it there, and
  reports the wanted change to `types.ts` in its final answer. sim-battle or
  the integrator folds it in. Do not edit another lane's file.
- `SimEvent` is the only channel from sim to readers. A lane that needs a new
  event adds a `// WANT EVENT: …` note in its own file and reports it.

## Units and conventions

- Sim time: ticks at 60 Hz (`src/sim/fixed.ts`). Content data: ms (`…Ms`),
  mm (`…Mm`), percent (`…Pct`), permille (`…Pm`), tenths (`…X10`), W × 100 (`w100`).
- Sim space: u, 1 m = 60 000 u, so N mm/s moves N u per tick. Map data and
  events use metres. x east, z south, y up; the dais is at the origin; the
  default camera looks north from the south.
- HP and damage in data are chapter-1 numbers; the world scales by `world.gPm`
  (00 §4.1). Foe HP = `enemyHp(w100, chapter, wPm)`.
- Randomness only from `world.rng.<stream>` (`spawn`, `combat`, `words`, `ai`,
  `loot`, `rare`, `props`; never `crit`, there are no crits, 00 D03).
- `hashWorld` walks the whole world except the keys in `HASH_SKIP`
  (`src/sim/world.ts`): `stage`, `map`, `lanes`, `events`, `deck`, `wall`,
  and the static config `rules`, `def`, `band`, `table`. Keep wall-clock
  values under `wall`. Create objects with fields in a fixed order; never
  store floats (`tests/sim/battle-determinism.test.ts` walks every difficulty
  and a whole run).

## The world and the step (`src/sim/world.ts`)

```ts
createWorld(stage: StageDef, seed = stage.seed, options?: WorldOptions): World
step(world: World, input: readonly SimCommand[] = []): void   // one 60 Hz tick
applyCommand(world, command): void        // routes a SimCommand to its system
hashWorld(world): number; hashWorldHex(world): string
runLog(world, log: { tick; command }[], untilTick): void
allocEnemy(world, foe): EnemyState; enemyAt(world, { slot, serial }): EnemyState | null
kEFor(wpm): number                         // k_E permille (00 §4.4)
```

Step order (fixed): commands → `stepWords` → `stepWaves` → `stepSpawn` →
`stepAuras` → `stepMovement` → `stepWordHits` → `stepTraps` → `stepUnits` →
`stepHouses` → `stepEnemyAttacks` → `stepBoss` → `stepStatus` →
`stepEconomy` → cleanup (per dead foe: `words.onEnemyGone`,
`combat.onEnemyKilled`, `economy.onEnemyKilled`, `houses.onEnemyKilled`; then
the defeat check) → `tick + 1`.

Every system file exports `create<X>State(init: WorldInit)` and `step<X>(world)`.

## Contracts between systems

| Call | Owner | Callers |
|---|---|---|
| `damageEnemy(world, enemy, amount, type, source, by)` | sim-battle `combat.ts` | traps, units, houses, skills. Word damage ignores armour; lock protection keeps 1 HP; sets `alive=false`, `killedBy`, emits `hit`, `death` |
| `damageHero(world, amount, type, source)` | sim-battle | foes, statuses |
| `queueWordStrike(world, strike)` | sim-battle | words (on word completion) |
| `addRage`, `grantXp` | sim-battle | words, economy (review card) |
| `scheduleWave(world, wave)`, `spawnFoe(...)` | sim-battle `spawn.ts` | waves |
| `knockBack(world, enemy, u)` | sim-battle `movement.ts` | traps, skills |
| `auraPct(world, enemy, kind)`, `sealGeneral` | sim-battle `auras.ts` | movement, combat, words (Ấn Phá) |
| `pullBanner(world, banner)` | sim-battle `boss.ts` | words |
| `applyStatus`, `hasStatus`, `slowPct` | sim-ourside `status.ts` | everyone |
| `blockerFor(world, enemy)` | sim-ourside `units.ts` | movement |
| `resonate(world, enemy, grade)` | sim-ourside `traps.ts` | combat (word hits) |
| `earn`, `spend`, `payWaveEnd` | sim-ourside `economy.ts` | waves, shop, combat |
| `canPlace`, `suggestedSlots`, `slotIndex` | sim-ourside `placement.ts` | shop, UI, bots |
| `dealWord(world, kind, target)` | typing-learning `words.ts` | boss (banner word), combat (urgent, skill words) |
| `isLockProtected`, `chainTier` | typing-learning | combat |
| `damageUnit(world, unit, …)`, `blockPassPct`, `canMove`, `canAttack`, `statusSpeedPm` | sim-ourside `units.ts`, `status.ts` | combat, movement |
| `damageHouse(world, slotIndex, …)` (map slot index, not the house list) | sim-ourside `houses.ts` | combat |
| `delayTrap(world, slot, ticks)` | sim-ourside `traps.ts` | combat (E11 fire arrow) |
| `waveEndGold`, `heroMaxHpBonus` | sim-ourside `economy.ts`, `shop.ts` | waves, combat (level-up), UI |
| `releaseWord(world, slot, reason)` | typing-learning `words.ts` | boss (flag word when its banner expires) |

Presentation side (`src/app/contracts.ts`): every view, UI and audio part is a
`Presenter { onEvents(events, world); frame(world, info); dispose() }`. Player
intent goes out only as `SimCommand`s through a `CommandSink`. DOM parts that
follow world points get a `Projector` from `view/stage.ts`. Parts that claim
keys first implement `ActionHandler.handleAction(action)` with action names from
`rules.ts` `KEYS`. Three units are metres; convert sim u with `uToM`.

## Commands (`SimCommand`, `src/content/types.ts`)

`key` (a–z as 0–25, wall `ms` for learning only), `backspace`, `release`, `mark`
(foe `{slot, serial}`), `skill`, `consumable`, `buy`, `place`, `upgrade`, `sell`,
`start`, `call-early`, `continue`, `learn-ahead`, `review-card`.

## Events (`SimEvent`, drained once a frame by the app)

| Event | Emitted by | Read by |
|---|---|---|
| `phase`, `wave-start`, `wave-end`, `victory` | waves | ui (wave card, results), audio (music layers) |
| `defeat` | world cleanup | ui, audio |
| `spawn`, `move` | spawn, movement | view actors, ui tags |
| `attack` (wind-up, strike), `telegraph` | combat, boss | view telegraphs, fx, audio |
| `hit`, `death` | combat (all damage) | fx, numbers, audio, hp bars, tags |
| `trap-trigger`, `house-pulse`, `unit-down`, `unit-up`, `built`, `upgraded`, `sold`, `bought`, `consumable` | traps, houses, units, shop | view actors, fx, ui strip, audio |
| `status`, `aura` | status, auras | view tint, tag icons |
| `word-assigned`, `word-progress`, `word-complete`, `word-released`, `grade` | words | tags, learning frame, app/learning (events to shared learning), audio typing ticks |
| `gold` | economy | hud, strip |
| `rage`, `skill`, `hero-level` | combat | hud, fx, heroes |
| `rejected` | any command handler | ui (gentle feedback) |

Feedback tiers T0–T5 (`hit.tier`, `death.tier`) follow 05 §5 and drive
`kit/feedback`'s `dragon` profile.

## Data seeded by the architect

`enemies.ts`, `generals.ts` (02 §2–3), `our-side.ts` (03 §6–9) and the wave
plan in `waves.ts` (timing and loads only; groups are TODO for sim-battle) were
filled from the design so the types meet real data. Their owners verify them
against 02 and 03 and keep them.

## Kit (synced at the wiring step)

- `src/kit/**` holds all 11 modules of `kit.config.json` and is committed with
  `kit-manifest.json`; `node src/kit/verify-kit.mjs` checks every sha256.
- Import kit modules by folder (`../kit/typing`, `../kit/feedback`, …). Pure
  rules (`src/sim`, `src/typing`, `src/content`) may import only
  `kit/platform` and `kit/typing`; browser code never imports `kit/tools`.
- `vite.config.ts` serves `/vocabulary/` and `/typing-texts/` with the kit's
  `serveSharedFolders` (`scripts/dev/serve-shared.ts` is gone).
- A kit bug is fixed in `shared/game-kit`, then re-synced from the parent repo
  (`node scripts/sync-game-kit.mjs --target games/dragon-hold`); never here.

## sim-battle (M0a): shared changes and contracts

Additive changes to shared files (sim-battle owns them):

- `types.ts`: `EliteTraitId`; `SpawnGroupDef.traits?`, `.variant?` (hooks, none in
  M0); new event `banner` (G01's Cắm Cờ: `windup`, `plant`, `pulled`,
  `expired`, `cancel`, with position, radius, duration); `aura` events mark a
  general's ring turning on or off (members: `world.auras.bySlot` each frame).
- `world.ts` `EnemyState`: `aim`, `bornAt`, `stopAt`, `homeLateral`, `action`,
  `actionUntil`, `actionAlong`, `skillAt`, `pounces`, `wading`, `traits`,
  `variant`. `cleanup` also calls `waves.onEnemyGone` (wave alive counts).
- `lanes.ts`: bridges carry `halfWidth` (foes squeeze onto the deck).
- `rules.ts`: `BATTLE` holds the battle values the design leaves open (leap,
  charge speed, crowding, banner planting).

Contracts other lanes use:

- `queueWordStrike(world, strike)` takes an optional `skill` (Chữ Chiêu); it
  stores the target's position for the 4 m redirect. A small foe always dies
  to a word that is not Ẩu (00 §4.6); `cluster` strikes deal 1 W × M_q × M_c
  to every member within 3 m.
- `castSkill(world, "roar")` works without a key (the urgent word); every cast
  is rejected outside a wave. A 4th argument adds a power bonus in %.
- `sealGeneral` ignores a repeat within the same seal, so words may call it
  and also queue the `seal` strike.
- `bannerStanding(world, index)` / `bannerForWord(world, wordSlot)` in
  `boss.ts`: the flag word is dealt with a null target; drop it when its
  banner is gone.
- `clusterLeader(world, cluster)` in `spawn.ts`: the first live member in slot
  order (the one words gives the cluster word).
- Plan analysis in `waves.ts` (`planArrivals`, `waveW100`, `waveLoad100`,
  `peakLoad100` with the 8 s window, `groupsIn`, `headsIn`, `lullsOf`,
  `threatByLane10`): the same timing the spawner uses, the same measure as
  `scripts/balance/load.ts`.
- Foes hit our side through sim-ourside's `damageUnit`, `damageHouse` and
  `delayTrap` (E11's fire arrow); blocking goes through `blockerFor` and
  `blockPassPct` every tick.

## Integration (M0a, done)

- `src/main.ts` routes the page: the game by default; `?view=terrain`
  (diorama only), `?view=ui` (UI preview on a mock world), `?bench=crowd|fx`
  (left empty for `dh-bench.mjs`, which imports `view/bench.ts` itself).
- `src/app/app.ts` (`startApp`): map stage, deck (≤ 2 s portal wait), world,
  loop, key router and every presenter. Frame order: drain events →
  `learning.onEvents` → app flow (Thẻ Ôn, flushes) → `onEvents` of every
  presenter (actors first) → `map.update(dt)` (camera before DOM projection)
  → `frame` of every presenter → `map.render()` → `fx.renderOverlay()`.
- Commands from keys, mouse and panels go into the world at once
  (`applyCommand`) and are logged with their tick; `step` applies input
  first, so the log replays to the same hash (`__dh.replayCheck()`). A
  hit-stop slows only the world, never the typing.
- The sim stands still while a learning panel is open (the break clock stops,
  00 §4.5), in the pause menu, under the focus veil and during the 3-2-1 after
  a pause in a wave (06 §2).
- `src/app/input-router.ts`: one keydown listener on window, capture phase.
  Letters (kit `typedLetter`) go to the open panel or become `key` commands;
  command keys map by `event.code` through `KEYS` (Shift + digit = Alt + digit
  for Linux). Order: intercept (menu, veil, countdown) → open panel → Esc
  releases a lock → Backspace → handlers `[results, placement, strip,
  waveCard, hud, learning replay, camera rig]` → app fallback (pause menu,
  fast-forward).
- Dev URL flags: `?q=low|medium|high|ultra`, `?seed=`, `?difficulty=`,
  `?wpm=`, `?prelearn=0`, and in dev builds only `?speed=N` (world time × N,
  rules unchanged). `window.__dh` (dev, or `?debug=1`) is the scenario handle.
- Browser scenarios: `scripts/visual/scenarios/dh-*.mjs` with helpers in
  `scripts/visual/scenarios/lib/dh.mjs`.

## Changes made at integration (other lanes' files)

- `src/ui/learning-frame.ts`: the panel class `dh-panel` became `dh-lpanel`
  (it clashed with the ui skin's carved panel and moved every HUD panel).
- `src/sim/boss.ts`: a banner that expires releases its flag word.
- `src/content/data/{enemies,generals}.ts`: bigger placeholders so the default
  camera draws them at 05 §2.3's bands (`dh-scale.mjs`); the swarm test in
  `tests/sim/battle-species.test.ts` allows a swarm up to 1 m long, under 0.5 m tall.
- `src/content/types.ts` + `data/maps.ts` + `view/camera.ts`: `camera.lookM`,
  the default look point's offset from the dais (L2-cau: 4 m north, so the
  wave card no longer covers the slots by the north gate).
- `src/content/data/waves.ts`: waves 2, 3, 6, 9, 10 brought inside 00 §4.4's
  load bands (golden replays regenerated).
- `src/ui/skin.ts`: Noto Sans (latin, latin-ext, greek) for IPA lines.
- `src/ui/results.ts` + `styles/dh.css`: the word book's status chip class
  `dh-tag` became `dh-wstatus` (it took the word tags' absolute position and
  sat in the panel's corner).
- `src/ui/learning-frame.ts`: the "Vừa học" line reads `small (nhỏ) · big (to, lớn)`
  (runs of spaces collapse in HTML, entries ran together).
- `src/sim/world.ts`: `rules` (the typing session's compiled float config) and
  `def` (slot definitions) stay out of the hash: hashed state is integers only.
  Command logs unchanged, golden hashes regenerated.
- `src/content/rules.ts` + `scripts/balance/report.ts`: G5 on the 10-wave M0
  map is judged by the canon's M0 exception (00 §7, set 23/10): typing only
  wins ≤ 40 % (`typingOnlyWinMax: 40`, DESIGN.md §9's row). The ≥ 70 % on
  stages 1–10 of the 00 §7 table is for the real chapter 1 (M2).

## Round 2 integration (M0a, 24/10/2026)

Lanes: balance (`89b4aca`), kit-learning (parent `339e6dac`, `0c8e0c7`,
`e9f7242`, `a234c74`), readability and visuals (`0273afa`, `f720737`,
`59e268b`). Notes: `docs/changelog/2026-10-24-m0a-round2-integration.md`.

- Kit `typing`: `RouterRules.unlockErrors` ("drop" default, "keep"); dragon-hold
  sets "keep" (Esc keeps a word's wrong keys, 01 §3.3). Synced at parent
  `339e6dac`; `scripts/balance/calibrate.ts` uses the same rule. Only
  dragon-hold uses the kit's `typing/` module.
- `src/app/learning.ts` `isRightRecall(activity, result, hintUsed)`: one rule
  for the device record and the portal samples (Học trước sends `review-card`
  with `hintUsed: true` and never counts as a recall).
- Balance: wave plan `layOut`, `PACE` time margins (slip, unevenness), Héo lan
  per waiting target (`PRESSURE`, event `blight` unchanged), director per
  difficulty (`BAND_MODE`: Dễ / Thường / Khó steer to Thư giãn / Cân bằng /
  Thử thách; `?difficulty=` reaches it through `createWorld`), small foes
  carry one word (`chainWords`); bots with Kém / Vừa / Tốt tactics;
  `pnpm dh:balance` runs 3 modes × 2 seed sets.
- View: drawn foe sizes live in `src/view/foe-look.ts` (`foeDrawnSize`,
  `__dh.foeSizes()` reads them). Cards pick a clear spot through
  `src/ui/screen-zones.ts`. Word tags keep clear of other foes' drawn boxes
  and of enemy warning rings (`foe-look.ts` `drawnWarnings`, filled by
  `telegraphs.ts`), ≤ 20 % cover.
- Fast-forward's word-zone check in `src/app/app.ts` reads `RINGS.wordZoneMm`
  (was a literal 26).

New files and who owns them: `src/view/foe-look.ts` view-crowd-fx;
`src/ui/screen-zones.ts` ui; `scripts/balance/anatomy.ts`,
`tests/sim/balance-pressure.test.ts` bot-balance; `tests/ui/**` ui (tag tests
with typing-learning); `tests/view/**` view-crowd-fx;
`scripts/visual/scenarios/dh-crowd.mjs` integrator.

Other lanes' files changed in round 2 (owners keep them): `src/sim/{combat,
director,world,words}.ts` (balance; `words.ts` only `chainWords`),
`src/ui/{tags,learning-frame,wave-card}.ts` (visuals: tag layout, card
placement), `src/app/app.ts` (visuals: `__dh.foeSizes`).

## Open items after round 2

- B1 and B7 fail on idle I (standard 21 %, director off 22 %, band ≤ 10 %):
  the 00 §4.4 load caps plus ~46 % untyped damage leave ~15–19 % at best.
  The owner picks one of: I counts only gaps ≥ 1 s or the strike flight as
  busy (kit FlowMeter); an I band ≤ 20 % for this game; middle-wave load
  1.05–1.10 (peaks ≤ 1.25, wave 1 ≤ 0.75); untyped share 20–25 %.
  Round 3: an I band ≤ 20 % (D27), round 3's own proposal waiting for the
  owner (no document recommended it); the shared ≤ 10 % stays the gate of
  record and the report prints B1 and B7 against both. Both fail (below).
- The Fast bot wins 100 % (k cap 1.30); Q ~40 % (§9.1 aims 55–70 %); B9
  needs the owner's playtest. Round 3: k cap 1.50 (D29), Fast wins 77.5 %.
- Written into the canon on 24/10 (committed in the parent at 26f97a9e):
  slip and unevenness margins and the pace (00 §4.4), Héo lan per mode and
  its rates (00 §4.10), wave 10 peak 1.39 (00 §7 M0 exceptions), Esc keeps
  wrong keys (00 D24), Học trước is no recall (00 D25), the typing speed is
  asked, never assumed (00 D26). 01 §3.3, §6.3, §6.6 and BALANCE.md §9.1 still
  carry the old lines (the canon wins; their owners update them).
- A word let go with Esc that still carries wrong keys cannot be taken by a
  soft switch when locked again (kit behaviour; a change needs sim state and
  new golden replays).
- Ring tags (foes within 10 m) keep their fixed place (05 §4.3) and can cover
  part of a warning ring by the dais; a foe behind a blocker shows only as a
  striped ghost (the placeholder Vệ Binh Rêu is drawn × 2; M0b models decide).
- Map slots `suoi-t2`/`suoi-b1` and `suoi-t3`/`suoi-b2` sit 0.5 m apart on the
  ground (trap under a blocker by design); the DOM markers offset blockers 2.2 m.
- Round 2 gate small fixes: done in round 3 (below).

## Round 3 (M0a, Dell, 24/10/2026)

Notes: `docs/changelog/2026-10-24-m0a-review2.md` (review 2 recorded, the
35-WPM pacing trap fixed, the round 2 gate's small fixes).

- Typing speed (00 D26): `src/app/typing-pace.ts` (header, presets, the
  measured profile through kit/balance `parseSkill` / `updateSkill` under
  `dragon-hold.skill`, the last pick under `dragon-hold.pace`, `PaceMeter`)
  and `src/app/pace-card.ts` (the speed card), integrator. `startApp` builds
  no world until `?wpm=` or the card gives a speed; `Run.header` is the
  world's speed and replays use it; a finished stage updates the profile; the
  pause menu has "Tốc độ gõ" (a new speed replays the stage). `?wpm=` is
  clamped to a whole 10–120. `__dh.state()` has `pace` and `paceCard`.
  Scenario `boot()` adds `wpm=35` unless the query names a speed;
  `dh-pace.mjs` opens the card.
- `banner` events are drawn: `src/view/banners.ts` (view-crowd-fx) puts a
  placeholder banner on every live general and, on `plant`, a standing
  banner, a light pillar in the aura colour, its aura ring
  (`TelegraphsView.end(id)` is new) and "Cắm Cờ" for 1 s; `pulled` fells it,
  `expired` sinks it. `__dh.state().banners`.
- Aura rings (`telegraphs.ts`) keep #C8D24A with a paler core and a dark
  Hắc Vụ edge on both sides.
- Damage numbers: `src/view/number-field.ts` (`DrawnNumberField`, view-crowd-fx)
  counts the glyph overhang and the "HOÀN HẢO" label in `box()`, so spawn and
  settle keep labels apart. Kit drift to report to `shared/game-kit`
  (feedback/numbers.ts `box()` counts digits only). `__dh.numbersTouching()`.
- Scenarios that need a later wave step the world in the page (`dh-banner`,
  `dh-numbers`: `import('/src/sim/world.ts')` then `step`, keys through
  `__dh.send`, so `replayCheck` holds): the Dell's headless Chrome draws in
  software (~1 frame a second at High under load).
- Slot menu (`placement-ui.ts`): `placeNear` also keeps off Hỏa Long's screen
  box (dais rim, up to 7 m), weighted × 2, and opens outward first.
- Golden: case `sloppy-hard-off-seed3` (Ẩu bot, Khó, director off, 7 min,
  4 `release` commands); `GoldenCase.difficulty`, `.director`.
- `src/sim/world.ts` imports `../kit/platform/rng`; `tests/boundary.test.ts`
  follows the rules' real import chain into `src/kit` and checks it is pure.

New files and owners: `src/app/{typing-pace,pace-card}.ts`,
`tests/app/typing-pace.test.ts`, `scripts/visual/scenarios/dh-{pace,banner,slot-menu,numbers}.mjs`
integrator; `src/view/{banners,number-field}.ts`, `tests/view/number-field.test.ts`
view-crowd-fx. Other lanes' files changed in round 3 (owners keep them):
`src/view/{telegraphs,fx}.ts`, `src/ui/placement-ui.ts`, `src/sim/world.ts`
(import only), `scripts/balance/golden-spec.ts`, `tests/golden/**`.

### Round 3 review fixes (Dell, 24/10/2026)

Notes: `docs/changelog/2026-10-24-m0a-review2-minor.md`; GPU results in
`2026-10-24-m0a-review2.md` ("Chạy lại trên GPU").

- Speed card keys are stable: `PaceOption.key`, presets 1–7 always, the
  measured row 0 (first and preselected, 00 D26). `KEYS` binds no bare
  Digit 0, so the app's intercept hands it to the open card as `carry-0`.
- The HUD toast stands 8 px above the carry strip as laid out (`hud.ts`
  `placeToast`, measured while it shows; the CSS offsets are the fallback).
- `DrawnNumberField.box()` also takes the glyph rows: the digit and label ink
  rows of the atlas fonts, measured once, outline included (digits reached
  13.5 px under the old box at 720p). Kit drift to report to
  `shared/game-kit` feedback/numbers.ts: `box()` width (overhang, label) and
  height (glyph quads 1.25 font sizes), and the atlas label row's accents
  reaching into the digit row (glyph 3).
- Reading what was drawn: `FxPresenter.sprites`, `__dh.numberLayer()`,
  `scripts/visual/scenarios/lib/dh.mjs` `INSTALL_INK_CHECK` (quads uploaded
  for the GPU + atlas ink, independent of `box()`); `dh-numbers-drawn.mjs`
  (new, integrator) runs it with the kit's box as a control;
  `dh-hitstop-keys` samples numbers in a frame callback.
- Browser runs on the Dell use Windows Chrome with its GPU over CDP (a
  Windows Node runs `cdp-run.mjs`, Vite stays in WSL); WSL's own Chrome only
  draws in software.

Other lanes' files changed here (owners keep them): `src/ui/hud.ts`,
`src/view/{number-field,fx}.ts`, `src/content/rules.ts` (`PACE` comment only).

### Round 3 decisions (Dell, 24/10/2026)

Notes: `docs/changelog/2026-10-24-m0a-round3.md`. The 9 owner decisions of the
round 2 gate (canon 00 D27–D29, committed in the parent at 512033e9). D28 and
the k cap are as recommended; D27 is round 3's own proposal, waiting for the
owner (fixed after the round 3 review, 25/10).

- `src/sim/director.ts` `DH_BANDS`: BALANCE.md §3 with Cân bằng's I ≤ 20 %
  (D27's proposal). Since 25/10 the bot report prints B1–B9 against the shared
  bands (the gates of record) and B1, B7 against `DH_BANDS` too
  (`report.ts` `bandGates`); the pace director still steers by the kit band +
  `DIRECTOR_IDLE_SLACK` (sim unchanged).
- `PACE.kMaxPm` 1500 (D29). Round 3 scaled the gate rules (`FLOW.gateGapMs`,
  `laneStaggerMs`) by `spawnMs`, which took the stagger to ~0.34 s at k 1.50;
  replaced on 25/10 (below). Golden `noTyping-seed2` and
  `sloppy-hard-off-seed3` regenerated (k ≠ 1), logs unchanged.
- G8 is traps, houses and units (03 §0, D28); `report.ts` adds G8b (the Fire
  Dragon's words and skills, 65–80 %), and the "Phe ta" column follows G8.
- `scripts/balance/run.ts` workers wait for each send (Node 24 crashed the IPC).
- Kit `feedback/numbers.ts` (parent `shared/game-kit`, committed at 512033e9;
  resynced here at a4d00e7, typing-survival synced too, `kit:check` passes for
  all three games): digit cells as wide as the widest glyph's ink (≥ 64 px),
  the label in its own row (atlas 1024 × 256), same drawn scale; exports
  `NUMBER_ATLAS`. Commit 24c8591 carried the kit synced from the uncommitted
  parent (`parentDirty: true`); from now on the parent commits first.
- `src/view/number-field.ts`: the box reads `NUMBER_ATLAS` and the measured ink;
  `settle()` runs until no two boxes touch (the kit's one pass left storm numbers
  touching for a frame, 3 frames on screen at 1080p).
- Scenarios: `dh-hitstop-keys` checks every frame and what lies on screen;
  `lib/dh.mjs` ink check counts on-screen overlaps; `dh-numbers-drawn` reads the
  new atlas layout; `dh-crowd` takes `GUARD` (off by default); `dh-words16.mjs`
  (new) stages a crowd at the letter budget (10 words with the M0 deck).

Still open: B1 and B7 (idle of the standard, skilled and fast bots; Mới's S;
Khá's wins), B9 (the owner's playtest). The kit's `box()` and one-pass
`settle()` stay as drift for `shared/game-kit`.

### Round 3 review fixes (Dell, 25/10/2026)

Notes: `docs/changelog/2026-10-25-m0a-round3-fix.md`.

- `scripts/balance/report.ts` `bandGates` (bot-balance): B1–B9 against the
  shared BALANCE §3 bands, B1 and B7 against D27's proposal too; per seed
  set and in the JSON (`bGates`, `bGateSets`). Never D27 alone.
- `src/sim/spawn.ts` `stepSpawn` (sim-battle): the gate rules follow the spawn
  time scale only above 02 §5.3's 1.5 s and 01 §1.4's 0.6 s; while a gate rule
  holds a due group, every later waiting group of its wave waits a tick too
  (G9 1.40; the floors alone read 1.45). Golden `sloppy-hard-off-seed3`
  back to `4d27a14a`. This part of D29 is a proposal waiting for the owner.
- `scripts/visual/scenarios/lib/dh.mjs` `boot()` reads `WPM` (default 35);
  `dh-words` and `dh-telegraphs` report `kPm` (integrator).
- B1/B7: 4 measured iterations (foes × √k, a wave vanguard walking in during
  the warning, the vanguard with Héo × 1.1); none kept (numbers and next
  levers in the notes). The vanguard patch is kept in `tmp/` only.

Waiting for the owner: D27 (I ≤ 20 % in Cân bằng) and D29's gate-rule part.
Still open: B1, B7 (both bands), B9 (plus a run at `?wpm=70`). Key latency on
the Dell depends on other lanes' load: 1080p read 76–77 ms (over the
scenario's 70 ms) during their builds and tests, 26.2 ms on a later run.
