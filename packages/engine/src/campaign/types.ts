/**
 * Chunk-based level documents: levels have no fixed width/height.
 * Space is composed of CHUNK_SIZE×CHUNK_SIZE tiles assembled at load time.
 */

export type Vec2 = { x: number; y: number };

export interface GlobalRuleSpec {
  /**
   * Full sentence as lexicon word ids, e.g. ["baba","and","rock","is","you"].
   * Preferred — supports AND / ON / NOT.
   */
  words?: string[];
  /** @deprecated Simple triple — converted to words when `words` is absent. */
  subject: string;
  verb: string;
  object: string;
}

/** Normalize a global rule to an ordered word-id list. */
export function globalRuleWords(spec: GlobalRuleSpec): string[] {
  if (spec.words && spec.words.length > 0) {
    return spec.words.map((w) => w.trim().toLowerCase()).filter(Boolean);
  }
  return [spec.subject, spec.verb, spec.object]
    .map((w) => String(w ?? "").trim().toLowerCase())
    .filter(Boolean);
}

/** Build a GlobalRuleSpec from word ids (keeps subject/verb/object mirrors when possible). */
export function specFromWords(words: string[]): GlobalRuleSpec {
  const w = words.map((x) => x.trim().toLowerCase()).filter(Boolean);
  const isIdx = w.indexOf("is");
  const subject = isIdx > 0 ? w[0]! : (w[0] ?? "baba");
  const verb = isIdx >= 0 ? "is" : (w[1] ?? "is");
  const object = isIdx >= 0 && isIdx < w.length - 1 ? w[w.length - 1]! : (w[2] ?? "you");
  return { words: w, subject, verb, object };
}

export interface AreaDef {
  id: number;
  name: string;
  color: string;
  /** Optional camera override while YOU stands in this area. */
  camera?: LevelCameraSettings;
}

export type CameraMode = "follow" | "fixed";

/** Per-level (or per-area) play camera. */
export interface LevelCameraSettings {
  mode: CameraMode;
  /** CSS pixels per cell. */
  zoom: number;
  /** Fixed mode: world-space center (cell units). */
  x?: number;
  y?: number;
}

export const DEFAULT_CAMERA: LevelCameraSettings = {
  mode: "follow",
  zoom: 48,
};

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
  /** Puzzle exit: YOU stepping here sets status to won. */
  exit?: boolean;
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
  /** Play camera for this level (areas may override). */
  camera?: LevelCameraSettings;
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
