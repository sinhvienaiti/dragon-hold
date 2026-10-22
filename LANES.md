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
- `hashWorld` walks the whole world except keys named `stage`, `map`,
  `lanes`, `events`, `deck`, `wall`. Keep wall-clock values under `wall`.
  Create objects with fields in a fixed order; never store floats.

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

## Open items for the integrator

- `src/app/app.ts` only shows a notice; the integrator wires stage, world,
  loop, input router and presenters.
