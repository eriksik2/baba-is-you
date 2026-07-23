import type { CampaignProgress, LevelDocument } from "./types";
import { INITIAL_UNLOCKS } from "./builtin";

export function createInitialProgress(): CampaignProgress {
  return {
    completedLevels: [],
    unlockedLevels: [...INITIAL_UNLOCKS],
  };
}

export function unlockAfterClear(
  progress: CampaignProgress,
  clearedId: string,
  allLevels: readonly LevelDocument[],
): CampaignProgress {
  const completed = new Set(progress.completedLevels);
  completed.add(clearedId);

  const unlocked = new Set(progress.unlockedLevels);
  unlocked.add(clearedId);

  // Unlock any portal targets that only required this clear (or whose requires are met).
  for (const level of allLevels) {
    for (const portal of level.portals ?? []) {
      if (!portal.requires || completed.has(portal.requires)) {
        unlocked.add(portal.targetLevelId);
      }
    }
  }

  return {
    ...progress,
    completedLevels: [...completed],
    unlockedLevels: [...unlocked],
  };
}

export function canEnterPortal(
  progress: CampaignProgress,
  portal: NonNullable<LevelDocument["portals"]>[number],
): boolean {
  if (!progress.unlockedLevels.includes(portal.targetLevelId) && portal.requires) {
    // Allow entry attempt only if requirement completed — target may unlock on enter path
    if (!progress.completedLevels.includes(portal.requires)) return false;
  }
  if (portal.requires && !progress.completedLevels.includes(portal.requires)) {
    return false;
  }
  return true;
}
