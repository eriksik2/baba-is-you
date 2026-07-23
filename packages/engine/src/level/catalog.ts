import type { LevelDefinition } from "./format";

/** Classic intro: break WALL IS STOP, form FLAG IS WIN (or BABA IS WIN). */
export const LEVEL_0_BABA_IS_YOU: LevelDefinition = {
  id: "level-0",
  name: "Baba Is You",
  layout: `
,,,,,,,,,
,baba,is,you,,,flag,is,,
,,,,,,flag!,,win,
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

export const LEVEL_TINY_SMOKE: LevelDefinition = {
  id: "tiny-smoke",
  name: "Smoke Test",
  layout: `
baba,is,you,flag,is,win
baba!,,,flag!,,
`,
};

export const BUILTIN_LEVELS: LevelDefinition[] = [
  LEVEL_0_BABA_IS_YOU,
  LEVEL_TINY_SMOKE,
];
