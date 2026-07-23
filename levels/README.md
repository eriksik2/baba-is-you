# Level packs

Builtin levels currently live in `packages/engine/src/level/catalog.ts` so tests and the web app share one source.

This folder is reserved for **external** level packs (JSON / `.baba.txt`) loaded at runtime as the project grows.

## Format reminder

```
baba,is,you,flag,is,win
baba!,,,flag!,,
```

- `name!` — object instance of noun `name`
- `name` — text tile for word `name`
- Spaces inside a cell stack multiple things: `baba! flag`
