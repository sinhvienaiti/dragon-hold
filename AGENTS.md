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
