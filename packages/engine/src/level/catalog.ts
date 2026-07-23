import type { LevelDefinition } from "./format";

/** Legacy CSV intro — still uses the slim lexicon + exit via rock walk (no flag). */
export const LEVEL_0_BABA_IS_YOU: LevelDefinition = {
  id: "level-0",
  name: "Baba Is You",
  layout: `
,,,,,,,,,
,baba,is,you,,,,,,,
,,,,,,,,,
,wall!,wall!,wall!,wall!,wall!,,,,
,wall!,,,,wall!,,,,
,wall!,,wall,baba!,wall!,,,,
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
baba,is,you,wall,is,stop
baba!,,,,,,
`,
};

export const BUILTIN_LEVELS: LevelDefinition[] = [
  LEVEL_0_BABA_IS_YOU,
  LEVEL_TINY_SMOKE,
];
