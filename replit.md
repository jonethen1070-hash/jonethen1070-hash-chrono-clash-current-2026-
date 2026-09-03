# Chrono Clash

Mobile-first cosmic puzzle battle game with crystalline gem matching, rival combat, and Chrono Power abilities.

## Run & Operate

- `pnpm --filter @workspace/chrono-clash run dev` — run the game preview
- `pnpm --filter @workspace/chrono-clash run typecheck` — check the game client
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/chrono-clash/src/engine/` — gameplay, scoring, board, power, and progression logic
- `artifacts/chrono-clash/src/ui/` — canvas rendering and presentation helpers
- `artifacts/chrono-clash/src/styles/` — visual skin and responsive match presentation
- `artifacts/chrono-clash/public/assets/` — logo, arena art, metallic texture, and gem atlas

## Architecture decisions

- Treat visual redesigns as presentation-only: preserve gameplay logic, critical DOM IDs, board geometry, canvas input, and the gem atlas contract.
- Keep the player side cyan and the rival side crimson throughout match presentation.

## Product

Players match crystalline gems, build score and attack charge, use Freeze, Time Shift, and Rewind powers, and compete against a rival across time and score modes.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
