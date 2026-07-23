export type {
  Vec2,
  GlobalRuleSpec,
  AreaDef,
  LevelEntitySpec,
  LevelDocument,
  CampaignProgress,
} from "./types";

export {
  BG,
  fill,
  stamp,
  stampArea,
  createBlankLevel,
  OVERWORLD,
  LEVEL_1,
  LEVEL_2,
  LEVEL_3,
  LEVEL_4,
  LEVEL_SPECIAL,
  CAMPAIGN_LEVELS,
  INITIAL_UNLOCKS,
} from "./builtin";
export type { BgTile, Rect } from "./builtin";

export { loadDocument, rulesFromGlobalSpecs } from "./loader";
export { createInitialProgress, unlockAfterClear, canEnterPortal } from "./progress";
export {
  DEFAULT_CHUNK_SIZE,
  flattenChunks,
  migrateDenseToChunks,
  emptyChunk,
  setChunkCell,
  getChunkBg,
  worldToChunk,
} from "./chunks";
