# Agent guidance: Rồng Giữ Ải (Dragonhold, `dragon-hold`)

A standalone 3D typing lane-defense game. Two dragons stand on the Dragon Dais
at the map centre; foes of the Bầy Héo walk 1–4 dirt lanes and a sky lane, each
carrying an English word. Typing a word makes Hỏa Long breathe fire at it.
Between waves the player buys traps, magic houses, blockers, potions and armour.
Dev port 3005, host `dragon.typing-game.local`.

## Design

- Authoritative design (Vietnamese): `docs/games/dragon-lane/` in the parent
  repo (`../..` from this repo's root). `00-canon.md` holds every number
  and wins when documents disagree; `DESIGN.md` §9 has the milestones.
- Current milestone: **M0a** grey box (full M0 rules, primitive placeholders,
  procedural terrain and river), map `L2-cau`.
- State (25/10, round 3 review fixes): G8 = traps, houses, units (D28) and the
  k cap 1.50 (D29) are taken as recommended. Cân bằng I ≤ 20 % (D27) and
  D29's gate rules (never under 1.5 s / 0.6 s; the wave waits with a held
  group) are proposals waiting for the owner. The bot report prints B1 and B7
  against the shared BALANCE §3 band (the gate of record) and D27's; both
  fail. B9 waits for the owner's playtest. See
  `docs/changelog/2026-10-25-m0a-round3-fix.md`.
- State (25–26/10, Mac): the damage-number box and multi-pass `settle()` live
  in the kit (synced at parent `21e8eaf9`, `DrawnNumberField` removed);
  `dh-crowd` holds the Dragon so every seed gets three measurements and checks
  every frame from wave 3; word tags add up what they hide of a body, and a
  tag inside its 0.5 s hold moves once it hides > 30 % of one (an exception to
  05 §4.3: the lane's own proposal, 00 D32, waiting for the owner; 25/10
  wrongly said "taken as recommended"). On `710f34a`: 10/10 `dh-crowd` runs
  `ok`, 0 of 33,592 frames with a foe ≥ 40 % (foes 10 m and more only, on a
  6 × 6 grid; see the 26/10 review fixes). See
  `docs/changelog/2026-10-25-mac-kit-drift-crowd.md`.
- State (26/10, Mac): the herb hut is "Lều Thuốc Nam" (owner; taken as
  recommended), and the labels that read wrong are reworded. B1/B7: 6
  measured rounds, none kept (each easier-play lever broke B3 or B4), sim
  unchanged; B1 and B7 still fail both bands. Recommended to the owner:
  confirm D27, keep the kit's idle metric (corrected after the review: the
  vanguard itself breaks B4 at 80 seeds; in four bots 60–72 % of I is the
  26 m ring, not T_a / k, so D27 comes with that lever and the I ↔ Q
  trade-off). See `docs/changelog/2026-10-26-b1b7-names.md`.
- State (26/10, Mac, review fixes): ring-slot tags keep off bodies and red
  wind-ups, the last-resort ring spot weighs bodies in every direction, a
  held tag yields once and never bounces back, a tag whose best spot in reach
  still hides ≥ 40 % of a body takes a clean ring spot; `dh-crowd` measures exact
  areas for far foes, foes within 10 m and wind-ups, and counts jumps; the
  wave warning lights its lanes (`view/lane-cue.ts`); scenarios stub
  speechSynthesis and have `ok`. Canon: D30–D32 are the lane's proposals
  waiting for the owner. Kit synced at parent `cfad21e1`. See
  `docs/changelog/2026-10-26-review-fix.md`.
- State (27/10, Mac, level test pass): each right key pops its letter and
  sends a fire mote, the word bolt has a body and lands with its hit, Viêm Đế
  draws its beam, Héo lan's beat is seen and heard (stream, tag flash, edge,
  number), debut cards, a 2.6 s victory hold, the defeat line names its cause
  and offers one level easier after two defeats (00 §4.10), the pause menu's
  speed card keeps the speed in use, `dh-ime`. Sim unchanged (a `hit` event
  carries `power`; golden kept). Measured and not kept: the bomb suggestion
  on the swarm lane (bots lose more), G01 planting in the word zone (B4
  breaks). Owner decisions: `docs/changelog/2026-10-27-test-pass.md` §5.
- Never judge a shared gate (`docs/games/BALANCE.md`) by a game-only band
  alone: print the shared result too.
- Rule numbers live in `src/content/rules.ts`, each pointing to its canon section.

## Lanes

Each lane writes only its own paths. See [LANES.md](LANES.md) for owned paths,
contracts, the event list and how to ask for a shared type change.

## Hard rules

- Never modify `games/space-typing` or any `games/.wt-*` worktree; never touch
  other games. Copy code you reuse into this repo with a one-line
  `// Source: …` header; never import across repos.
- No media in Git, ever: images, audio, video, `.glb`, `.gltf`, `.bin`, `.ktx2`.
  `public/assets/**` and `art-src/` are ignored.
- Never build character, creature, building or prop models in code. Allowed:
  primitive placeholders (one colour per foe family; biped tall, quadruped
  long and low, flyer floats), procedural terrain, river, paths, decals,
  particles, shaders, instancing. Real models come from the owner as GLB.
- `src/sim`, `src/typing`, `src/content` are pure deterministic TypeScript at a
  fixed 60 Hz: integer state, seeded RNG (`kit/platform`), no `three`,
  `window`, `document`, `Date`, `performance`, `Math.random`, trig, `pow`,
  `hypot` or `**`. `tests/boundary.test.ts` enforces this.
- Never edit `src/kit/**` by hand. It is copied from `shared/game-kit` by
  `node scripts/sync-game-kit.mjs --target games/dragon-hold` (run in the
  parent repo) and sha256-checked by `src/kit/verify-kit.mjs`.
- No destructive git (`reset --hard`, `checkout -- .`, `clean -f`, bare
  `stash`, force push). Never push. Never run `sudo`, `scripts/setup-nginx.sh`
  or `pnpm media:push/pull`.
- TypeScript strict. Code comments in English, short. Docs and changelogs in
  Vietnamese with full diacritics; each update adds
  `docs/changelog/<date>-<topic>.md`.
- Kill every background process you start (Vite, Chrome).
- On the Dell, Vite in WSL does not see files edited from Windows: restart it
  after a code change, before a browser run. `pnpm dh:balance --jobs=4` keeps
  the bots within the shared machine's thread budget.
- Browser checks: run Vite on your assigned port with `--strictPort`; run
  scenarios with `node scripts/visual/cdp-run.mjs <scenario.mjs>` (keep that
  file identical to Space's copy); screenshots go to `tmp/shots/<lane>/`
  (ignored) and must be looked at before claiming anything visual.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Vite on 127.0.0.1:3005 (strict port); serves `/vocabulary/` and `/typing-texts/` from the parent `shared/` |
| `pnpm test` | Vitest (`tests/**`) |
| `pnpm build` | `tsc --noEmit` then `vite build` |
| `pnpm check` | Kit hash check, tests, build |
| `pnpm dh:balance` | Headless bots on the M0 stage (`scripts/balance/run.ts`) |
| `pnpm dh:golden:update` | Rewrite golden hashes after a deliberate rule change |
| `node scripts/visual/cdp-run.mjs scripts/visual/scenarios/dh-*.mjs` | Real-browser scenarios over CDP |
