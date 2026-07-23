import type { Lexicon } from "../lexicon";
import { createDefaultLexicon } from "../lexicon";
import { asNounId, asWordId } from "../types";
import { World } from "../world/world";
import type { LevelCameraSettings, LevelDocument } from "./types";
import { DEFAULT_CAMERA } from "./types";
import {
  cropDense,
  flattenChunks,
  migrateDenseToChunks,
  shiftEntitiesToOrigin,
} from "./chunks";

/** Effective play camera: area override beats level default. */
export function resolveCamera(
  levelCamera: LevelCameraSettings | undefined,
  areas: { id: number; camera?: LevelCameraSettings }[],
  areaId: number,
): LevelCameraSettings {
  const area = areas.find((a) => a.id === areaId);
  if (area?.camera) {
    return { ...DEFAULT_CAMERA, ...area.camera };
  }
  return { ...DEFAULT_CAMERA, ...(levelCamera ?? {}) };
}

/** Hydrate a World from a LevelDocument (chunked or legacy dense). */
export function loadDocument(
  doc: LevelDocument,
  lexicon: Lexicon = createDefaultLexicon(),
): World {
  // Dense authoring pads out to full chunks — crop back to authored size.
  const cropW =
    !doc.chunks?.length && typeof doc.width === "number" ? doc.width : undefined;
  const cropH =
    !doc.chunks?.length && typeof doc.height === "number" ? doc.height : undefined;

  const chunked = migrateDenseToChunks(doc);
  let dense = flattenChunks(chunked, 0);
  if (cropW !== undefined && cropH !== undefined) {
    dense = cropDense(dense, dense.originX, dense.originY, cropW, cropH);
  }

  const world = new World(dense.width, dense.height, lexicon);
  world.background = dense.background;
  world.areaMap = dense.areaMap;
  world.areaDefs = (chunked.areas ?? []).map((a) => ({
    ...a,
    ...(a.camera ? { camera: { ...a.camera } } : {}),
  }));
  world.globalRuleSpecs = (chunked.globalRules ?? []).map((g) => ({ ...g }));
  world.documentId = chunked.id;
  world.isOverworld = !!chunked.isOverworld;
  world.originX = dense.originX;
  world.originY = dense.originY;
  world.camera = { ...DEFAULT_CAMERA, ...(chunked.camera ?? {}) };

  const entities = shiftEntitiesToOrigin(chunked.entities, dense.originX, dense.originY);
  for (const e of entities) {
    if (e.x < 0 || e.y < 0 || e.x >= world.width || e.y >= world.height) continue;
    if (e.kind === "object") {
      const noun = asNounId(e.id);
      if (!lexicon.getNoun(noun)) {
        throw new Error(`Level ${doc.id}: unknown noun '${e.id}'`);
      }
      world.spawnObject(noun, { x: e.x, y: e.y }, e.layer ?? 0);
    } else {
      const wordId = asWordId(e.id);
      if (!lexicon.getWord(wordId)) {
        throw new Error(`Level ${doc.id}: unknown word '${e.id}'`);
      }
      world.spawnText(wordId, { x: e.x, y: e.y }, e.layer ?? 1);
    }
  }

  world.portals = (chunked.portals ?? [])
    .map((p) => ({
      ...p,
      x: p.x - dense.originX,
      y: p.y - dense.originY,
    }))
    .filter((p) => p.x >= 0 && p.y >= 0 && p.x < world.width && p.y < world.height);

  world.rebuildRules();
  return world;
}

export { rulesFromGlobalSpecs } from "./global-rules";
