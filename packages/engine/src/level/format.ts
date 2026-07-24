/**
 * Compact level format.
 *
 * Rows of comma-separated cells. Tokens:
 * - `sheep!`  → object of noun sheep
 * - `sheep`   → text word "sheep"
 * - `is`     → text word "is"
 * - empty    → empty cell
 * - multiple tokens in one cell separated by spaces: `sheep! flag`
 *
 * This keeps levels readable in source control and easy to author by hand.
 */

import { asNounId, asWordId, type NounId, type WordId } from "../types";
import type { Lexicon } from "../lexicon";
import { createDefaultLexicon } from "../lexicon";
import { World } from "../world/world";

export interface LevelDefinition {
  readonly id: string;
  readonly name: string;
  readonly layout: string;
  readonly width?: number;
  readonly height?: number;
}

export interface ParsedCellToken {
  readonly kind: "object" | "text";
  readonly id: string;
}

export function parseCellToken(raw: string): ParsedCellToken | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (t.endsWith("!")) {
    return { kind: "object", id: t.slice(0, -1).toLowerCase() };
  }
  return { kind: "text", id: t.toLowerCase() };
}

export function parseLayout(layout: string): ParsedCellToken[][][] {
  const lines = layout
    .replace(/^\n/, "")
    .replace(/\n$/, "")
    .split("\n")
    .map((l) => l.trimEnd());

  // Allow leading indent on every line.
  const trimmed = lines.map((l) => l.replace(/^\s+/, ""));

  return trimmed.map((line) => {
    const cells = line.split(",");
    return cells.map((cell) => {
      const parts = cell.trim().split(/\s+/).filter(Boolean);
      return parts
        .map(parseCellToken)
        .filter((t): t is ParsedCellToken => t !== undefined);
    });
  });
}

export function loadLevel(
  def: LevelDefinition,
  lexicon: Lexicon = createDefaultLexicon(),
): World {
  const rows = parseLayout(def.layout);
  const height = def.height ?? rows.length;
  const width = def.width ?? Math.max(0, ...rows.map((r) => r.length));

  const world = new World(width, height, lexicon);

  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      const cell = row[x]!;
      let layer = 0;
      for (const token of cell) {
        if (token.kind === "object") {
          const noun = asNounId(token.id) as NounId;
          if (!lexicon.getNoun(noun)) {
            throw new Error(`Level ${def.id}: unknown noun object '${token.id}'`);
          }
          world.spawnObject(noun, { x, y }, layer++);
        } else {
          const wordId = asWordId(token.id) as WordId;
          if (!lexicon.getWord(wordId)) {
            throw new Error(`Level ${def.id}: unknown word '${token.id}'`);
          }
          world.spawnText(wordId, { x, y }, layer++);
        }
      }
    }
  }

  world.rebuildRules();
  return world;
}
