# Sheep Is You

A **Sheep Is You** puzzle game: grid levels, realtime-friendly turn pipeline, and a flexible rules engine — built with **Bun** and **TypeScript**.

## Play

https://eriksik2.github.io/baba-is-you/

Hard-refresh after updates. Hold a direction to keep moving. Undo + d-pad always on. Editor: **Board** / **Tools** toggles paint chrome.

**Core vocabulary:** `sheep` `wolf` `wall` `rock` `tree` `fruit` `door` `tnt` · `is` `you` `push` `stop` `pull` `slide` `sticky` `win` `boom` `fragile` `danger` · `and` `not` `on`. Levels clear on an **EXIT** tile (or WIN).

## Campaign

- Pastoral path **I–IV** + hard **?** spur
- **Flock** spur **F1–F6** (sheep, wolf, DANGER)
- Jungle **J1–J7** (ON win, boom, fragile, sticky)
- **Dev world** sandbox

## Format notes

Levels are **chunk-based** (16×16 tiles). Dense authoring still works and is migrated on load/save. Paint past the edge in the editor to grow the map.

## What’s new

- **Sheep** is the playable noun (no Baba branding)
- **WOLF** + **DANGER** — living danger chases YOU; inanimate danger destroys whatever shares its tile
- Flock levels F1–F6 on the overworld north spur
- Slide, sticky, boom, fragile, conditional ON win, and sandbox verbs in Dev World

Pushes to `main` deploy via GitHub Actions → Pages.

## Quick start

```bash
bun install
bun test          # engine unit + integration tests
bun run dev       # Vite client at http://localhost:5173
```

## What’s in the box

| Piece | Location |
|-------|----------|
| Headless simulation engine | `packages/engine` |
| Canvas web client | `apps/web` |
| Architecture notes | `docs/ARCHITECTURE.md` |

### Engine capabilities

- Grid world with **stacked** entities per cell
- **Lexicon**-driven words (nouns, properties, operators) — content-pack friendly
- Rule scan/parse → **Features** → property / transform indexes
- Implicit `TEXT IS PUSH`, `AND` expansion, `NOT` cancellation, `ON` conditions
- Movement with recursive **PUSH**, **PULL**, **STICKY**, **SLIDE**
- Turn pipeline (move → slide → danger → reparse → transform → resolve)
- Win / lose via property plugins + EXIT portals
- Undo / restart via snapshot history

## Project layout

```
apps/web/                 Vite + Canvas UI
packages/engine/          Pure TS game logic
  src/
    entity/               Entity store
    world/                Grid + World
    lexicon/              Word registry
    rules/                Parser + feature tables
    properties/           Behavior plugins
    systems/              Movement + effects + danger
    turn/                 Pipeline + GameSession
    campaign/             Overworld + level documents
    history/              Undo stack
    events/               Typed event bus
docs/ARCHITECTURE.md
```

## Controls

| Key | Action |
|-----|--------|
| Arrows / WASD | Move (hold for realtime) |
| Z / U | Undo |
| R | Restart |
| Space | Wait |
| +/- / wheel | Play zoom (follow camera) |

## Design stance

The engine is the source of truth. The web app only sends `PlayerIntent`s and renders. Rules and properties are data/plugin oriented so the project can grow toward conditions, more verbs, and larger content packs without collapsing into a single `update()` blob.

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full picture.

## License

Fan / learning project. Not affiliated with Hempuli or *Baba Is You*.
