# Architecture

This project is a **Baba Is You–inspired** puzzle engine. The design prioritizes a headless, testable core and a rules system that can grow toward the real game’s complexity without rewriting movement or rendering.

## Goals

- Grid levels with stacking (multiple entities per cell)
- Turn-based movement with push / stop
- A **data-driven rules language** (words on the board → features → properties)
- Room to add conditions (`ON`, `NEAR`, `LONELY`), verbs (`HAS`, `MAKE`), and new properties without forking the turn loop

## Package layout

```
apps/web          Canvas client (Vite). Input + paint only.
packages/engine   Pure simulation. No DOM. Bun-tested.
docs/             Design notes
levels/           Future external level packs (engine also embeds builtins)
```

Bun workspaces keep the engine importable as `@baba/engine` while the web app hot-reloads against TypeScript source (internal packages pattern).

## Layering

```
┌─────────────────────────────────────────┐
│  apps/web  (input, canvas, HUD)         │
└─────────────────┬───────────────────────┘
                  │ PlayerIntent
┌─────────────────▼───────────────────────┐
│  GameSession  (history, events, façade) │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  TurnPipeline  (ordered TurnPhases)     │
│  move → parse rules → transform → …     │
└─────────────────┬───────────────────────┘
                  │
     ┌────────────┼────────────┐
     ▼            ▼            ▼
 World/Grid   Rules/Lexicon  PropertyHandlers
 Entities     Features       (push/stop/win/…)
```

**Rule of thumb:** gameplay truth lives in `World`. UI never mutates entities directly.

## Core concepts

### Entities & grid

- `EntityStore` — opaque `EntityId`s, recycled on destroy
- `Grid` — spatial index; each cell is an ordered stack
- Kinds: `object` (baba, wall, …) and `text` (rule tiles)
- Text always queries as noun `text` so the implicit rule `TEXT IS PUSH` applies

### Lexicon (content pack seam)

`Lexicon` registers nouns and words with a `WordClass`:

| Class | Examples | Role |
|-------|----------|------|
| noun | BABA, WALL | Subject / transform target |
| property | YOU, PUSH, STOP | Granted abilities |
| operator | IS, AND, NOT, HAS | Grammar glue |
| prefix / infix | LONELY, ON, NEAR | Reserved for conditions |

New content should prefer **registering data + a property handler** over editing the parser.

### Rules pipeline

Inspired by Hempuli’s GDC talk / feature tables:

1. Scan noun-words as sentence starts (horizontal & vertical)
2. Collect a valid `Subject IS Predicate` tile sequence
3. Parse phrases; expand `AND` via cartesian product into **Features**
4. Apply `NOT` cancellation (`X IS YOU` + `X IS NOT YOU` → no YOU)
5. Index into `propertiesByNoun` and `transformsByNoun`

`Feature` is the stable intermediate form. Future grammar (conditions, `HAS`) can emit richer features without changing consumers that only care about property maps.

### Properties as plugins

`PropertyRegistry` maps `PropertyId` → hooks:

- `onBeforeEnter` — block or allow entry (STOP)
- `onAfterEnter` — land effects (WIN, DEFEAT, SINK)
- `onResolve` — end-of-turn / same-cell checks (YOU+WIN, HOT/MELT)

Push is handled in the movement system (recursive chain) because it redirects motion rather than only reacting to entry.

### Turn phases

Default order:

1. `move-you` / `wait`
2. `rebuild-rules`
3. `transform` (noun IS noun)
4. `rebuild-rules-after-transform`
5. `resolve` (overlaps, win/lose)

Add patrol `MOVE`, teleports, etc. as new `TurnPhase`s. Do not bury them inside the renderer or a god-object `Level.update()`.

### Undo

`HistoryStack` stores full `World` snapshots. Correct and simple; swap for command/deltas later if memory becomes an issue.

## Level format

CSV-like rows; `noun!` = object, `noun` = text; space-separated stacks in one cell. See `packages/engine/src/level/format.ts`.

## Testing strategy

- Unit: parser, level loader, property indexing
- Integration: `GameSession` playthroughs (win, lose, push, undo, transform)
- Keep the engine headless so CI never needs a browser

## Extension roadmap (non-binding)

1. Conditions (`ON` / `NEAR` / `LONELY`) in phrase parsers + feature filters
2. Stacked text permutations (all valid sentences from stacked words)
3. `HAS` / `MAKE` / `WRITE` verbs
4. Level select, packs, editor
5. Sprite atlas + animations (renderer only)
6. Optional ECS migration if entity queries grow unwieldy — current store is intentionally small

## Non-goals (for now)

- Pixel-perfect clone of Hempuli’s assets or every edge-case interaction
- Multiplayer / netcode
- Full visual editor
