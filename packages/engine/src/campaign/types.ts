export type Vec2 = { x: number; y: number };

export interface GlobalRuleSpec {
  subject: string; // noun id
  verb: string; // usually "is"
  object: string; // property or noun id
}

export interface AreaDef {
  id: number; // 0 reserved for "no area"
  name: string;
  color: string; // rgba for editor overlay
}

export interface LevelEntitySpec {
  kind: "object" | "text";
  /** object noun OR text word id */
  id: string;
  x: number;
  y: number;
  layer?: number;
}

export interface LevelDocument {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Applied everywhere without existing as text on the board */
  globalRules: GlobalRuleSpec[];
  areas: AreaDef[];
  /** length width*height, area id per cell (0 = none) */
  areaMap: number[];
  /** visual-only background tile keys, length width*height */
  background: string[];
  entities: LevelEntitySpec[];
  /** If true, clearing/winning is not the goal; entering portals is */
  isOverworld?: boolean;
  /** Door/portal markers linking to other levels */
  portals?: Array<{
    id: string;
    x: number;
    y: number;
    targetLevelId: string;
    /** require this level completed to enter, optional */
    requires?: string;
    /** label shown near portal */
    label?: string;
    /** if true, requires solving a harder local puzzle (special) */
    special?: boolean;
  }>;
  /** Starting YOU position hint for overworld resume */
  spawn?: Vec2;
}

export interface CampaignProgress {
  completedLevels: string[];
  unlockedLevels: string[];
  overworldPos?: Vec2;
}
