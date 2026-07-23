// Types
export type {
  EntityId,
  NounId,
  PropertyId,
  OperatorId,
  WordId,
  Direction,
  Vec2,
  GameStatus,
  Axis,
} from "./types";
export {
  vec2,
  addVec,
  eqVec,
  DIRECTION_DELTA,
  asEntityId,
  asNounId,
  asPropertyId,
  asOperatorId,
  asWordId,
} from "./types";

// Entity / world
export { EntityStore } from "./entity/store";
export type { EntityKind, EntityRecord } from "./entity/store";
export { Grid, World } from "./world";
export type { TextData } from "./world";

// Lexicon
export { Lexicon, createDefaultLexicon } from "./lexicon";
export type { WordClass, WordDefinition, NounDefinition } from "./lexicon";

// Rules
export {
  parseRules,
  buildRuleSet,
  nounHasProperty,
  createFeature,
  featureKey,
} from "./rules";
export type {
  Feature,
  NounRef,
  PredicateTarget,
  RuleSet,
  TextTile,
  ParseContext,
} from "./rules";

// Properties
export {
  PropertyRegistry,
  createDefaultProperties,
} from "./properties";
export type { PropertyHandler, PropertyContext } from "./properties";

// Systems
export {
  tryMove,
  moveAllYou,
  stepToward,
  applyTransforms,
  resolveOverlaps,
} from "./systems";
export type { MoveResult } from "./systems";

// Turn / session
export {
  TurnPipeline,
  GameSession,
  createDefaultPipeline,
} from "./turn";
export type { PlayerIntent, TurnPhase, TurnContext, TurnResult } from "./turn";

// History / events / levels
export { HistoryStack } from "./history/stack";
export { EventBus } from "./events/bus";
export type { GameEventMap } from "./events/bus";
export {
  loadLevel,
  parseLayout,
  parseCellToken,
  LEVEL_0_BABA_IS_YOU,
  LEVEL_TINY_SMOKE,
  BUILTIN_LEVELS,
} from "./level";
export type { LevelDefinition, ParsedCellToken } from "./level";

// Campaign / areas / documents
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
  CAMPAIGN_LEVELS,
  INITIAL_UNLOCKS,
  loadDocument,
  rulesFromGlobalSpecs,
  createInitialProgress,
  unlockAfterClear,
  canEnterPortal,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CAMERA,
  flattenChunks,
  migrateDenseToChunks,
  setChunkCell,
  resolveCamera,
} from "./campaign";
export type {
  GlobalRuleSpec,
  AreaDef,
  LevelEntitySpec,
  LevelDocument,
  CampaignProgress,
  BgTile,
  Rect,
  CameraMode,
  LevelCameraSettings,
} from "./campaign";
