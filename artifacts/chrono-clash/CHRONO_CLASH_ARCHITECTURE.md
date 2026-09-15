# Chrono Clash Architecture

This document is the ownership contract for the Chrono Clash web game. It is
intentionally narrow: the architecture pass must not change the 8×8 board,
visual geometry, gem materials, touch behavior, HUD layout, powers, online
protocol, authentication, or persistence semantics.

## Ownership map

| Concern | Authoritative owner | Allowed callers | Do not move into |
| --- | --- | --- | --- |
| Board generation, matching, swapping, gravity, refill, cascades | `src/engine/board.ts` | `GameSession`, `BattleDirector`, tests | `main.ts`, renderers, HTTP |
| Score and energy formulas | `src/engine/board.ts` and `src/engine/combat.ts` | session/server orchestration | CSS, UI event handlers |
| Power catalog, costs, charge metadata, targeted-cell selection | `src/engine/powers.ts` | session, server, UI metadata | `main.ts`, duplicated server branches |
| Local match state, timer, CPU, local rewards, FX events | `src/engine/session.ts` | browser bridge, tests | Canvas renderer, DOM |
| Online battle authority and action sequencing | `src/server/battle.ts` | HTTP façade and transport | client reconciliation/UI |
| Online HTTP/session façade | `src/server/core.ts`, `src/server/http.ts` | browser transport | board rules |
| Pointer event plumbing | `src/main.ts` | DOM only | engine rules |
| Swipe classification and drag clamping | `src/engine/input.ts` | browser pointer bridge, tests | duplicated inline math |
| Canvas gems, wells, board lighting, gameplay FX | `src/ui/renderer.ts` | frame loop | DOM/CSS frame |
| Menus, metadata views, profile/chat HTML fragments | `src/ui/metaViews.ts` | `main.ts` | board engine |
| Screen transitions, HUD projection, DOM event wiring, frame loop | `src/main.ts` | app entrypoint | board mutation/rendering internals |
| Global / arena presentation CSS (non-HUD cosmetics + geometry) | `src/styles/game.css`, `src/styles/studio.css`, `src/styles/aaa-polish.css` | `index.html` | engine modules |
| Match-stage responsive geometry (`--*-height`, board size budget) | `src/styles/aaa-polish.css` (“LOCKED BASELINE”) | match layout only | HUD cosmetic files |
| Match HUD cosmetics (controls, fighters, VS/timer, energy skin, ability dock look) | `src/styles/hud-redesign.css` | loaded last among presentation sheets | `aaa-polish.css` cosmetic passes, board frame |
| Player DOM board frame and hardware material pass | `src/styles/match-frame.css` | loaded after presentation sheets, before `hud-redesign.css` | Canvas renderer or gem atlas |
| Local settings/profile/economy persistence | `src/engine/settings.ts`, `src/engine/progress.ts` | session/UI | server battle rules |

`main.ts` remains the browser adapter. It is not the gameplay authority: it
turns DOM events into `GameSession` calls and projects snapshots into the HUD
and renderer.

## Refactor completed in this pass

### Shared power contract

`engine/powers.ts` now owns:

- energy costs for all power IDs;
- validation and cell selection for `burst` and `megaStrike`;
- the call into the normal `resolveBoard()` cascade/refill path.

Both `GameSession` and `BattleDirector` use `resolveTargetedPower()`. They
retain ownership of cost deduction, score/energy/attack bookkeeping, history,
network sequencing, and local FX because those side effects belong to their
respective authorities.

### Shared input contract

`engine/input.ts` owns both axis-biased neighbor selection and drag clamping.
`main.ts` owns pointer capture, cancellation, lost-capture cleanup, haptics,
audio, and DOM-to-board coordinate measurement. The browser bridge must call
the engine helpers rather than reimplementing swipe math.

### CSS contract

Load order in `index.html`:

1. `game.css` — base app / early match layout
2. `studio.css` — studio presentation layer
3. `aaa-polish.css` — arena polish + **locked match-stage geometry**
4. `match-frame.css` — player board-frame / hardware materials only
5. `hud-redesign.css` — **authoritative match HUD cosmetics** (last)

`match-frame.css` is the only file for future player board-frame and hardware
material changes. It intentionally restates the existing winning declarations
rather than changing geometry or the Canvas board. The frame does not own the
board's canvas, gem sprites, stage atmosphere, or match HUD.

`hud-redesign.css` is the only file for future match HUD visual redesign work
(top controls, fighter panels, VS/timer, energy rail skin, ability dock look).
Do not add new HUD cosmetic passes to `aaa-polish.css`. Geometry variables that
size the board remain in the aaa-polish locked baseline until a deliberate
geometry migration.

When cleaning further CSS, preserve these invariants:

1. `#playerGems` and `#oppGems` remain Canvas elements.
2. Do not change `.board-slot` dimensions, grid tracks, or responsive caps.
3. Do not restore the hidden rival mini-board or attack bars.
4. Keep frame glow outside the socket bed so wells and gems remain crisp.
5. Keep reduced-motion and low-quality selectors effective.
6. Do not reintroduce a `#match .match-brand` title element; the title strip is
   removed from the match DOM. Keep `.match-brand-actions` for Chat/Audio/Settings.

## State-to-rendering flow

```text
GameSession / BattleDirector
  -> GameSnapshot / BattleSnapshot
  -> main.ts projection
     -> HUD/menu DOM updates
     -> BoardRenderer.draw(snapshot, playerRect, rivalRect, now)
        -> player/rival Canvas layers
        -> board wells, gem materials, gameplay FX
     -> DOM board-frame CSS
```

The DOM frame is a shell around the Canvas boards. It must never become a
second source of gem or board state.

## Input-to-gameplay flow

```text
pointerdown on #playerGems
  -> main.ts records pointer/cell and captures pointer
pointermove
  -> engine/input.ts clamps the visual drag
  -> session.updateDrag() updates transient state
pointerup
  -> main.ts resolves an armed power target, or calls neighborFromSwipe()
  -> GameSession.usePower() / tryPlayerSwap()
  -> snapshot and FX are projected on the next frame
pointercancel / lostpointercapture
  -> main.ts clears drag without mutating the board
```

`touch-action: none` on the board remains the scroll-lock contract. Do not add
a global non-passive touch listener to replace it.

## Power mutation flow

```text
UI button
  -> main.ts arms a targeted power or calls a non-targeted power
  -> local: GameSession validates state and mutates its player board
  -> online: ChronoClient sends the target; BattleDirector validates again
  -> resolveTargetedPower()
     -> targetedPowerCells()
     -> resolveBoard()
     -> gravity/refill/cascade result
  -> owner applies score, energy, attack, history, FX, and synchronization
```

The client never treats a target coordinate as authority in online mode.
`BattleDirector` validates it against the actor's current board and applies
the same shared board operation.

## Regression contract

The regression suite should keep coverage for:

- generated 8×8 boards with no opening matches and a valid swap;
- valid and invalid swaps, match shapes, score, energy, gravity, refill, and
  cascades;
- freeze, time shift, rewind, burst, and mega strike costs and state guards;
- clipped burst targets, color-based mega targets, and invalid coordinates;
- pointer swipe axis bias, drag clamping, cancellation, and scroll locking;
- online action sequence, target validation, snapshot projection, and
  reconciliation;
- unchanged board geometry and Canvas ownership in the mobile smoke path.

The targeted power tests live in `tests/targeted-powers.test.ts`. Existing
board, session, power-economy, online-sync, and mobile swipe suites remain
the behavioral baseline.

## Verification checklist

From `artifacts/chrono-clash`:

```bash
pnpm run typecheck
pnpm run build
pnpm exec vitest run
pnpm run test:e2e:mobile
```

Then restart the managed Chrono Clash workflow and verify:

1. desktop and mobile previews load without browser-console errors;
2. board remains 8×8, gems remain Canvas-rendered, and swap input works;
3. burst targets a clipped 3×3 area and mega strike targets the selected color;
4. pointer cancellation leaves the board unchanged;
5. rival mini-board and attack bars remain hidden;
6. the player frame remains the same size and visual material;
7. `git diff --check` is clean.

## Remaining architectural issues

- `main.ts` is still the application coordinator and is intentionally not
  split into a framework component hierarchy during this no-visual-change
  refactor.
- Historical HUD cosmetic rules still exist inside `aaa-polish.css` /
  `studio.css` / `game.css`. They are cascade-superseded by `hud-redesign.css`
  for active-match cosmetics, but have not all been deleted yet. Future HUD
  redesigns must edit `hud-redesign.css` only; leftover polish HUD passes should
  be removed in later cleanup passes after screenshot comparison.
- DOM HUD projection and Canvas rendering are both driven from the same frame
  loop, but they should not share mutable rendering state.