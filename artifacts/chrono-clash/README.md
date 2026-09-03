# Chrono Clash

Local **Vite + TypeScript** match-3 puzzle battle. An 8×8 gem board, a simulated rival, Chrono Powers, XP/achievements, and a studio-styled mobile HUD. No backend and no API keys are required.

## Requirements

- Node.js 18 or newer
- npm 9 or newer (lockfile is `package-lock.json`, lockfileVersion 3)

## Install

```bash
cd chrono-clash
npm install
```

## Run (development)

```bash
npm run dev
```

Vite serves the game at `http://localhost:5173` (host binding is enabled in `vite.config.ts`). Open that URL on a phone or in a desktop browser. The layout is built for a portrait phone viewport.

Skip the intro on later launches: settings persist in `localStorage` under `chrono-clash-settings-v2`. Profile, XP, cosmetics, and achievements persist under `chrono-clash-meta-v2`.

## Test

Two tests write logs under `/opt/cursor/artifacts`. Create that folder first if it does not exist:

```bash
mkdir -p /opt/cursor/artifacts
npm test
```

Watch mode:

```bash
npm run test:watch
```

Tests are Vitest + Node (no browser). They cover the board engine, modes, powers, rewards, audio cue arbitration, and a full 60-second match simulation.

`tests/phase3-checklist.test.ts` walks a live seeded board and can occasionally fail if `findAnyValidSwap` finds no move at that instant. Re-run that file if it flakes:

```bash
npx vitest run tests/phase3-checklist.test.ts
```

## Build and preview

```bash
npm run build
npm run preview
```

`npm run build` typechecks with `tsc -b` then emits a static site in `dist/`. `npm run preview` serves that production bundle.

## Play

1. **PLAY** starts the last selected mode (default **TIME BATTLE**, 60 seconds).
2. **GAME MODES** chooses TIME BATTLE or SCORE BATTLE (first to 3k / 5k / 8k / 10k).
3. Hold and swipe adjacent gems on **YOUR BOARD**. Matches score, fill energy, and charge attack.
4. Chrono Powers: **FREEZE** (12 energy, halt rival 5s), **TIME SHIFT** (18 energy, steal 5s in TIME or tempo surge in SCORE), **REWIND** (26 energy, restore last valid move).
5. After the match: results → Rewards (scrollable on mobile, **CONTINUE** returns to the main menu).

The rival board is simulated. This is a complete local game, not a live PvP client.

## Project layout

See [BACKUP_MANIFEST.md](./BACKUP_MANIFEST.md) for the architecture map and the files that belong in a portable backup.

## License / data

Player progress is local-only (`localStorage`). There are no cloud saves, secrets, or environment files in this repository.

### Local online 1v1

`npm run dev` starts both the Vite client (`5173`) and the Chrono Clash API server (`8787`). For a local online test, open the game in two browser windows, continue as Guest in both, open **ONLINE 1v1**, and start matchmaking on both devices/windows.
