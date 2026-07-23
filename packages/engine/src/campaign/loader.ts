import type { Lexicon } from "../lexicon";
import { createDefaultLexicon } from "../lexicon";
import { asNounId, asWordId } from "../types";
import { World } from "../world/world";
import type { LevelDocument } from "./types";

/** Hydrate a World from a LevelDocument (areas, background, globals, entities). */
export function loadDocument(
  doc: LevelDocument,
  lexicon: Lexicon = createDefaultLexicon(),
): World {
  const world = new World(doc.width, doc.height, lexicon);
  world.background = [...doc.background];
  world.areaMap = [...doc.areaMap];
  world.areaDefs = doc.areas.map((a) => ({ ...a }));
  world.globalRuleSpecs = doc.globalRules.map((g) => ({ ...g }));
  world.documentId = doc.id;
  world.isOverworld = !!doc.isOverworld;
  world.portals = (doc.portals ?? []).map((p) => ({ ...p }));

  for (const e of doc.entities) {
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

  world.rebuildRules();
  return world;
}

export { rulesFromGlobalSpecs } from "./global-rules";
