/**
 * Chunk-based level documents: levels have no fixed width/height.
 * Space is composed of CHUNK_SIZE×CHUNK_SIZE tiles assembled at load time.
 */

export type Vec2 = { x: number; y: number };

export interface GlobalRuleSpec {
  subject: string;
  verb: string;
  object: string;
}

export interface AreaDef {
  id: number;
  name: string;
  color: string;
}

export interface LevelEntitySpec {
  kind: "object" | "text";
  id: string;
  /** World-space cell coordinates (not chunk-local). */
  x: number;
  y: number;
  layer?: number;
}

export interface LevelChunk {
  /** Chunk grid coordinate (chunk 0,0 covers world cells [0, CHUNK_SIZE)). */
  cx: number;
  cy: number;
  /** length chunkSize², row-major local */
  background: string[];
  /** length chunkSize² */
  areaMap: number[];
}

export interface LevelPortal {
  id: string;
  x: number;
  y: number;
  targetLevelId: string;
  requires?: string;
  label?: string;
  special?: boolean;
}

export interface LevelDocument {
  id: string;
  name: string;
  /** Preferred storage. If omitted, width/height dense fields are migrated. */
  chunkSize?: number;
  chunks?: LevelChunk[];
  globalRules: GlobalRuleSpec[];
  areas: AreaDef[];
  entities: LevelEntitySpec[];
  isOverworld?: boolean;
  portals?: LevelPortal[];
  spawn?: Vec2;
  /** @deprecated Dense authoring helpers — converted to chunks on load. */
  width?: number;
  height?: number;
  background?: string[];
  areaMap?: number[];
}

export interface CampaignProgress {
  completedLevels: string[];
  unlockedLevels: string[];
  overworldPos?: Vec2;
}

export const DEFAULT_CHUNK_SIZE = 16;
