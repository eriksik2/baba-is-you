# Baba

Groundwork for a **Baba Is You**-inspired puzzle game: grid levels, turn-based controls, and a flexible rules engine — built with **Bun** and **TypeScript**.

## Play

https://eriksik2.github.io/baba-is-you/

Pushes to `main` build and deploy the web client via GitHub Actions → Pages.

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
| Sample level (“Baba Is You”) | playable in the web app |

### Engine capabilities

- Grid world with **stacked** entities per cell
- **Lexicon**-driven words (nouns, properties, operators) — content-pack friendly
- Rule scan/parse → **Features** → property / transform indexes
- Implicit `TEXT IS PUSH`, `AND` expansion, `NOT` cancellation
- Movement with recursive **PUSH** and **STOP**
- Turn pipeline (move → reparse → transform → resolve)
- Win / lose / defeat / sink / hot-melt hooks via property plugins
- Undo / restart via snapshot history
- Compact CSV-like level format

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
    systems/              Movement + effects
    turn/                 Pipeline + GameSession
    level/                Format + builtin levels
    history/              Undo stack
    events/               Typed event bus
docs/ARCHITECTURE.md
```

## Controls

| Key | Action |
|-----|--------|
| Arrows / WASD | Move |
| Z / U | Undo |
| R | Restart |
| Space | Wait |

## Design stance

The engine is the source of truth. The web app only sends `PlayerIntent`s and renders. Rules and properties are data/plugin oriented so the project can grow toward conditions, more verbs, and larger content packs without collapsing into a single `update()` blob.

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full picture.

## License

Fan / learning project. Not affiliated with Hempuli or Baba Is You. Do not ship copyrighted Baba assets.
