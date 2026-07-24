import type { LevelDefinition } from "./format";

/** Legacy CSV intro — still uses the slim lexicon + exit via rock walk (no flag). */
export const LEVEL_0_SHEEP_IS_YOU: LevelDefinition = {
  id: "level-0",
  name: "Sheep Is You",
  layout: `
,,,,,,,,,
,sheep,is,you,,,,,,,
,,,,,,,,,
,wall!,wall!,wall!,wall!,wall!,,,,
,wall!,,,,wall!,,,,
,wall!,,wall,sheep!,wall!,,,,
,wall!,,is,,wall!,,,,
,wall!,,stop,,wall!,,,,
,wall!,wall!,wall!,wall!,wall!,,,,
,,,,,,,,,
`,
};

/** Tiny smoke: move onto open tile (rules only). */
export const LEVEL_TINY_SMOKE: LevelDefinition = {
  id: "tiny-smoke",
  name: "Smoke Test",
  layout: `
sheep,is,you,wall,is,stop
sheep!,,,,,,
`,
};

export const BUILTIN_LEVELS: LevelDefinition[] = [
  LEVEL_0_SHEEP_IS_YOU,
  LEVEL_TINY_SMOKE,
];
