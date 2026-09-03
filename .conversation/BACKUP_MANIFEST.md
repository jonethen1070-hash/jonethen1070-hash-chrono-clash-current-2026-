# Chrono Clash backup manifest

Portable snapshot of the game source so another environment can install, run, test, and keep developing. This file lists what is in the archive and how the code is structured.

## Archive

- **Name:** `chrono-clash-complete-backup.zip`
- **Root folder inside the zip:** `chrono-clash/`
- **Runtime:** Node 18+, npm, Vite 6, TypeScript 5, Vitest 3
- **App type:** Vanilla TypeScript + DOM + Canvas. **Not React.**

## Intentionally excluded

Do **not** restore these from a dirty tree; they are omitted from the zip:

| Path | Reason |
| --- | --- |
| `node_modules/` | Reinstall with `npm install` |
| `dist/` | Rebuild with `npm run build` |
| `.git/` | History is not required to continue development |
| `.vite/`, `*.tsbuildinfo` | Caches |
| `*.log`, `.DS_Store` | Temporary |
| `.env`, secrets, API keys | None exist; do not add any |

There is no `.env`, no cloud API, and no password store. Audio is synthesized in-browser (Web Audio). Optional voice files can later be listed in `public/voice/manifest.json` (currently `{}`).

## Included tree

```
chrono-clash/
  README.md                 How to install, run, test, and build
  BACKUP_MANIFEST.md        This file
  package.json              Scripts and devDependencies
  package-lock.json         Locked Vite / TypeScript / Vitest versions
  tsconfig.json             Strict ES2022 + DOM, includes src + tests
  vite.config.ts            Dev server :5173, Vitest node environment
  index.html                Entry: #app, /src/main.ts, game.css + studio.css
  .gitignore                node_modules, dist, caches
  public/
    voice/manifest.json     Optional VO file map (empty object = synth fallback)
  src/
    main.ts                 DOM screens, input, rAF loop, wiring
    styles/game.css         Base tokens, match HUD, screens
    styles/studio.css       Studio visual pass (linked after game.css)
    engine/                 Simulation (board, session, progress, modes)
    ui/                     Canvas renderer, meta HTML, haptics, feel
    audio/                  SFX, music, announcer, battle cues
  tests/                    Vitest specs (see below)
```

## Source map

### Entry and shell

| File | Role |
| --- | --- |
| `index.html` | Loads fonts, `game.css`, `studio.css`, `/src/main.ts` |
| `src/main.ts` | Builds all screens in `#app`, owns `GameSession`, pointer swipe on `#playerBoard`, `requestAnimationFrame` loop |
| `src/styles/game.css` | Tokens, `html/body { overflow: hidden }`, screen stack, match layout |
| `src/styles/studio.css` | Cinematic restyle; pins match HUD to `100dvh`; Rewards scroll + CONTINUE footer |

Screens are siblings under `.shell`. Only the active `.screen` is visible. The canvas `#stage` is `position: fixed` with `pointer-events: none`; gems are drawn into `#playerBoard` / `#oppBoard` rects.

### Engine (`src/engine/`)

| File | Role |
| --- | --- |
| `types.ts` | Grid 8×8, 60s TIME, SCORE targets, energy costs, piece kinds, progress shape |
| `board.ts` | Seeded RNG, generate, match detection, swap resolve, gravity, refill |
| `session.ts` | `GameSession`: screens, countdown, rival AI, powers, endMatch, rewards grant |
| `combat.ts` | Score/attack fill, combo flavor, score-target clamp |
| `input.ts` | Swipe → orthogonal neighbor, drag clamp |
| `progress.ts` | `localStorage` key `chrono-clash-meta-v2`, XP, achievements, unlocks |
| `settings.ts` | `localStorage` key `chrono-clash-settings-v2` (audio, FX, score target, intro) |
| `catalog.ts` | Cosmetics, mode copy, ownership helpers |
| `intro.ts` | Splash timing / skip rules |

**Modes**

- TIME BATTLE: 60 seconds (`MATCH_SECONDS`). Higher score wins.
- SCORE BATTLE: first to 3000 / 5000 / 8000 / 10000 (`SCORE_TARGETS`, default 5000). 90s fallback clock.

**Powers** (player energy 0–100)

- FREEZE 12 → rival halted 5s
- TIME SHIFT 18 → TIME: steal 5s / SCORE: tempo surge 5s
- REWIND 26 → restore last valid player snapshot

**Screens** (`GameSession.screen`): `splash` → `menu` → `modes` / `profile` / `collection` / `settings` / `tutorial` → `ready` → `match` → `results` → `rewards` → `menu`.

Post-match Rewards (`#rewards`) uses `.rewards-scroll` (`overflow-y: auto`) plus a pinned footer with `#rewardsContinue` (CONTINUE → `session.toMenu()`). Match HUD stays viewport-locked; do not remove `html, body, #app, .shell { max-height: 100dvh }` without re-checking the match layout.

### UI (`src/ui/`)

| File | Role |
| --- | --- |
| `renderer.ts` | Faceted gem canvas, `cellAt()` hit test, VFX particles |
| `metaViews.ts` | Profile / collection / chat / leaderboard / missions HTML |
| `feel.ts` | Combo burst class names, result headlines, score ticker |
| `haptics.ts` | Vibration cues from FX |

### Audio (`src/audio/`)

| File | Role |
| --- | --- |
| `bus.ts` | Web Audio master / SFX / music gains |
| `sfx.ts` / `music.ts` | Procedural cues |
| `voice.ts` | Line IDs + optional `/voice` asset map |
| `announcer.ts` | Queue / intensity |
| `events.ts` | Map match FX → announcer / SFX |

### Tests (`tests/`)

| File | Covers |
| --- | --- |
| `board.test.ts` | Matches, gravity, swaps |
| `input.test.ts` | Swipe axis |
| `freeze.test.ts` | Freeze halt |
| `modes.test.ts` | TIME vs SCORE |
| `full-match.test.ts` | 60s simulated match + winner |
| `phase3.test.ts` / `phase3-checklist.test.ts` | Phase 3 battle checklist |
| `phase4.test.ts`–`phase8.test.ts` | Later systems |
| `phase7-runtime.test.ts` | Runtime feel |
| `profile.test.ts` / `meta.test.ts` | XP, cosmetics, collection |
| `voice.test.ts` / `audio-events.test.ts` | Cue arbitration |
| `rewards-nav.test.ts` | Rewards → menu + CONTINUE markup/CSS |

`full-match.test.ts` and `phase3-checklist.test.ts` write logs to `/opt/cursor/artifacts/` when that directory exists.

## Critical DOM IDs (do not rename without updating `src/main.ts`)

Match HUD: `#playerCard` `#youAvatar` `#youName` `#youLevel` `#playerScore` `#oppCard` `#oppScore` `#rivalLevel` `#rivalAvatar` `#timerBtn` `#timerLabel` `#timer` `#playerAttack` `#oppAttack` `#energyFill` `#incomingBanner` `#freezeClock` `#oppCombo` `#oppBoard` `#shiftClock` `#playerCombo` `#playerBoard` `#freeze` `#timeshift` `#rewind` `#energyLabel` `#comboDamage` `#playerScoreFill` `#oppScoreFill`.

Chrome: `#dockChat` `#dockBoard` `#dockHome` `#dockSettings` `#dockMissions` `#overlay` `#comboBurst` `#energyBurst`.

Post-match: `#toRewards` (results CONTINUE) `#rewardsContinue` (rewards CONTINUE → home) `#again` `#rewProfile` `#toMenu` `#rewardList` `#rewardXp`.

## Local data

| Key | Contents |
| --- | --- |
| `chrono-clash-settings-v2` | Mute, FX intensity, score target, `introSeen` |
| `chrono-clash-meta-v2` | Name, XP, level, cosmetics, achievements, tutorial, last mode |

Reset from in-game Settings → Reset local progress. No server copy exists.

## How to continue development

1. Unzip so you have a `chrono-clash/` folder.
2. `cd chrono-clash && npm install`.
3. `mkdir -p /opt/cursor/artifacts && npm test`.
4. `npm run dev` and play on a ~390×844 viewport.
5. Keep gameplay in `src/engine/` (especially `session.ts`, `board.ts`, `types.ts`). Keep presentation in `src/styles/` and `src/ui/renderer.ts`. Keep screen wiring in `src/main.ts`.

Gameplay that must stay intact unless a task explicitly changes it: 8×8 match-3, hold-to-drag swipe, simulated rival, Freeze 12 / Time Shift 18 / Rewind 26, TIME 60s, SCORE first-to-target, HUD label **YOU**, Rewards scroll + CONTINUE home.
