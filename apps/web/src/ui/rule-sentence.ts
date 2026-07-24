/**
 * Click-to-build global rule sentences.
 * Empty slots open a tabbed word picker; AND / ON insert extra holes.
 */

import type { GlobalRuleSpec, Lexicon } from "@baba/engine";
import { createDefaultLexicon, globalRuleWords, specFromWords } from "@baba/engine";

export type WordPickTab = "nouns" | "properties" | "ops";

const OPS_SUBJECT = ["and", "on", "not"] as const;
const OPS_PRED = ["and", "not"] as const;

function isOp(id: string): boolean {
  return id === "is" || id === "and" || id === "not" || id === "on";
}

/** Ensure a bare sentence has subject / is / predicate holes. */
export function ensureSentence(words: string[]): Array<string | null> {
  if (words.length === 0) return [null, "is", null];
  const tokens: Array<string | null> = words.map((w) => w || null);
  if (!tokens.includes("is")) {
    // Insert IS before last hole if missing
    tokens.splice(Math.max(1, tokens.length - 1), 0, "is");
  }
  return tokens;
}

export function tokensToSpec(tokens: Array<string | null>): GlobalRuleSpec | null {
  const words = tokens.filter((t): t is string => !!t);
  if (words.length < 3 || !words.includes("is")) return null;
  return specFromWords(words);
}

type PickerState = {
  ruleIndex: number;
  slotIndex: number;
  anchor: HTMLElement;
};

export type RuleSentenceHost = {
  root: HTMLElement;
  /** Called whenever the list of specs changes. */
  onChange: (rules: GlobalRuleSpec[]) => void;
  lexicon?: Lexicon;
};

/**
 * Mount an interactive global-rules editor into `host.root`.
 * Returns a refresh() that re-renders from the given rules array.
 */
export function mountRuleSentenceEditor(host: RuleSentenceHost): {
  render: (rules: GlobalRuleSpec[]) => void;
  destroy: () => void;
} {
  const lexicon = host.lexicon ?? createDefaultLexicon();
  let rules: GlobalRuleSpec[] = [];
  let picker: PickerState | null = null;
  const popup = document.createElement("div");
  popup.className = "word-picker";
  popup.hidden = true;
  document.body.appendChild(popup);

  function closePicker(): void {
    picker = null;
    popup.hidden = true;
    popup.innerHTML = "";
  }

  function openPicker(ruleIndex: number, slotIndex: number, anchor: HTMLElement): void {
    picker = { ruleIndex, slotIndex, anchor };
    const tokens = ensureSentence(globalRuleWords(rules[ruleIndex]!));
    const prev = slotIndex > 0 ? tokens[slotIndex - 1] : null;
    const next = slotIndex < tokens.length - 1 ? tokens[slotIndex + 1] : null;
    const isIdx = tokens.indexOf("is");
    const onPredSide = isIdx >= 0 && slotIndex > isIdx;

    const tabs: WordPickTab[] = onPredSide
      ? ["properties", "nouns", "ops"]
      : ["nouns", "ops"];

    let active: WordPickTab = tabs[0]!;
    const rect = anchor.getBoundingClientRect();
    popup.style.left = `${Math.min(window.innerWidth - 280, Math.max(8, rect.left))}px`;
    popup.style.top = `${Math.min(window.innerHeight - 260, rect.bottom + 6)}px`;
    popup.hidden = false;

    const renderPopup = (): void => {
      popup.innerHTML = "";
      const tabRow = document.createElement("div");
      tabRow.className = "word-picker-tabs";
      for (const t of tabs) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "word-picker-tab" + (t === active ? " is-active" : "");
        b.textContent = t === "ops" ? "Ops" : t === "nouns" ? "Things" : "Verbs";
        b.addEventListener("click", () => {
          active = t;
          renderPopup();
        });
        tabRow.appendChild(b);
      }
      popup.appendChild(tabRow);

      const grid = document.createElement("div");
      grid.className = "word-picker-grid";

      let ids: string[] = [];
      if (active === "nouns") {
        ids = lexicon
          .allNouns()
          .map((n) => String(n.id))
          .filter((id) => id !== "text");
      } else if (active === "properties") {
        ids = lexicon
          .allWords()
          .filter((w) => w.wordClass === "property")
          .map((w) => String(w.id));
      } else {
        ids = [...(onPredSide ? OPS_PRED : OPS_SUBJECT)];
        // Allow picking IS only if missing
        if (!tokens.includes("is")) ids = ["is", ...ids];
      }

      // Context filter: after ON only nouns; after AND same side as AND
      if (prev === "on") {
        ids = lexicon
          .allNouns()
          .map((n) => String(n.id))
          .filter((id) => id !== "text");
      }

      for (const id of ids) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "word-picker-item";
        b.textContent = id.toUpperCase();
        b.addEventListener("click", () => {
          applyPick(id);
        });
        grid.appendChild(b);
      }

      if (tokens[slotIndex]) {
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "word-picker-item ghost";
        clear.textContent = "Clear";
        clear.addEventListener("click", () => applyPick(null));
        grid.appendChild(clear);
      }

      popup.appendChild(grid);
      void next;
    };

    const applyPick = (id: string | null): void => {
      const idx = picker!.ruleIndex;
      const slot = picker!.slotIndex;
      const tokens = ensureSentence(globalRuleWords(rules[idx]!));

      if (id === null) {
        tokens[slot] = null;
      } else if (id === "and") {
        tokens[slot] = "and";
        tokens.splice(slot + 1, 0, null);
      } else if (id === "on") {
        tokens[slot] = "on";
        tokens.splice(slot + 1, 0, null);
      } else if (id === "not") {
        tokens[slot] = "not";
        tokens.splice(slot + 1, 0, null);
      } else {
        tokens[slot] = id;
      }

      // Keep a trailing predicate hole after IS
      const isAt = tokens.indexOf("is");
      if (isAt >= 0 && isAt === tokens.length - 1) tokens.push(null);

      const spec = tokensToSpec(tokens);
      if (spec) {
        rules[idx] = spec;
      } else {
        // Keep partial as words with placeholders stripped for storage mirrors
        const partial = tokens.filter((t): t is string => !!t);
        rules[idx] = {
          words: partial.length ? partial : ["baba", "is", "you"],
          subject: partial[0] ?? "baba",
          verb: "is",
          object: partial[partial.length - 1] ?? "you",
        };
      }
      closePicker();
      host.onChange(rules.map((r) => ({ ...r, words: [...globalRuleWords(r)] })));
      render(rules);
    };

    renderPopup();
  }

  function render(next: GlobalRuleSpec[]): void {
    rules = next.map((r) => ({
      ...r,
      words: [...globalRuleWords(r)],
    }));
    host.root.innerHTML = "";

    rules.forEach((rule, ri) => {
      const row = document.createElement("div");
      row.className = "rule-sentence";

      const tokens = ensureSentence(globalRuleWords(rule));
      tokens.forEach((tok, si) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className =
          "rule-chip" +
          (tok ? (isOp(tok) ? " is-op" : "") : " is-hole") +
          (tok === "is" ? " is-is" : "");
        chip.textContent = tok ? tok.toUpperCase() : "·";
        chip.title = tok ? `Change ${tok}` : "Pick a word";
        chip.addEventListener("click", (ev) => {
          ev.stopPropagation();
          openPicker(ri, si, chip);
        });
        row.appendChild(chip);
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "rule-del";
      del.textContent = "✕";
      del.setAttribute("aria-label", "Remove rule");
      del.addEventListener("click", () => {
        rules.splice(ri, 1);
        host.onChange(rules.map((r) => ({ ...r })));
        render(rules);
      });
      row.appendChild(del);
      host.root.appendChild(row);
    });
  }

  const onDocClick = (ev: MouseEvent): void => {
    if (!picker || popup.hidden) return;
    const t = ev.target as Node;
    if (popup.contains(t)) return;
    if (picker.anchor.contains(t as Node)) return;
    closePicker();
  };
  document.addEventListener("click", onDocClick);

  return {
    render,
    destroy: () => {
      document.removeEventListener("click", onDocClick);
      closePicker();
      popup.remove();
    },
  };
}

export function emptyGlobalRule(): GlobalRuleSpec {
  return specFromWords(["baba", "is", "you"]);
}
