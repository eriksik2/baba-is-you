import type { Lexicon } from "../lexicon";
import { createDefaultLexicon } from "../lexicon";
import { asNounId, asWordId } from "../types";
import { World } from "../world/world";
import type { LevelDocument } from "./types";
import { flattenChunks, migrateDenseToChunks, shiftEntitiesToOrigin } from "./chunks";

/** Hydrate a World from a LevelDocument (chunked or legacy dense). */
export function loadDocument(
  doc: LevelDocument,
  lexicon: Lexicon = createDefaultLexicon(),
): World {
  const chunked = migrateDenseToChunks(doc);
  const dense = flattenChunks(chunked, 0);

  const world = new World(dense.width, dense.height, lexicon);
  world.background = dense.background;
  world.areaMap = dense.areaMap;
  world.areaDefs = (chunked.areas ?? []).map((a) => ({ ...a }));
  world.globalRuleSpecs = (chunked.globalRules ?? []).map((g) => ({ ...g }));
  world.documentId = chunked.id;
  world.isOverworld = !!chunked.isOverworld;
  world.originX = dense.originX;
  world.originY = dense.originY;

  const entities = shiftEntitiesToOrigin(chunked.entities, dense.originX, dense.originY);
  for (const e of entities) {
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

  world.portals = (chunked.portals ?? []).map((p) => ({
    ...p,
    x: p.x - dense.originX,
    y: p.y - dense.originY,
  }));

  world.rebuildRules();
  return world;
}

export { rulesFromGlobalSpecs } from "./global-rules";
