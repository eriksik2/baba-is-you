# Level packs

Builtin levels currently live in `packages/engine/src/level/catalog.ts` so tests and the web app share one source.

This folder is reserved for **external** level packs (JSON / `.sheep.txt`) loaded at runtime as the project grows.

## Format reminder

```
sheep,is,you,flag,is,win
sheep!,,,flag!,,
```

- `name!` — object instance of noun `name`
- `name` — text tile for word `name`
- Spaces inside a cell stack multiple things: `sheep! flag`
