import type { CampaignProgress, LevelDocument } from "@baba/engine";
import {
  CAMPAIGN_LEVELS,
  createInitialProgress,
} from "@baba/engine";

const PROGRESS_KEY = "baba.progress.v1";
const CUSTOM_KEY = "baba.customLevels.v1";

export function loadProgress(): CampaignProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return createInitialProgress();
    const parsed = JSON.parse(raw) as CampaignProgress;
    if (!parsed.unlockedLevels?.length) return createInitialProgress();
    return parsed;
  } catch {
    return createInitialProgress();
  }
}

export function saveProgress(progress: CampaignProgress): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function resetProgress(): CampaignProgress {
  const p = createInitialProgress();
  saveProgress(p);
  return p;
}

export function loadCustomLevels(): LevelDocument[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LevelDocument[];
  } catch {
    return [];
  }
}

export function saveCustomLevel(doc: LevelDocument): void {
  const all = loadCustomLevels().filter((d) => d.id !== doc.id);
  all.unshift(doc);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(all.slice(0, 40)));
}

export function deleteCustomLevel(id: string): void {
  const all = loadCustomLevels().filter((d) => d.id !== id);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(all));
}

export function findLevel(id: string): LevelDocument | undefined {
  return (
    CAMPAIGN_LEVELS.find((l) => l.id === id) ??
    loadCustomLevels().find((l) => l.id === id)
  );
}
