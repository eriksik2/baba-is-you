export type {
  Vec2,
  GlobalRuleSpec,
  AreaDef,
  LevelEntitySpec,
  LevelDocument,
  CampaignProgress,
  CameraMode,
  LevelCameraSettings,
  LevelPortal,
  LevelChunk,
} from "./types";
export { DEFAULT_CAMERA, globalRuleWords, specFromWords } from "./types";

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
  LEVEL_JUNGLE_1,
  LEVEL_JUNGLE_2,
  DEV_WORLD,
  CAMPAIGN_LEVELS,
  INITIAL_UNLOCKS,
} from "./builtin";
export type { BgTile, Rect } from "./builtin";

export { loadDocument, rulesFromGlobalSpecs, resolveCamera } from "./loader";
export { createInitialProgress, unlockAfterClear, canEnterPortal } from "./progress";
export {
  DEFAULT_CHUNK_SIZE,
  flattenChunks,
  migrateDenseToChunks,
  cropDense,
  emptyChunk,
  setChunkCell,
  getChunkBg,
  worldToChunk,
} from "./chunks";
