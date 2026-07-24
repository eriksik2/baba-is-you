export { tryMove, tryEnterCell, moveAllYou, applyPullChain, applyStickyFollow, applySlide, stepToward, stickySeedsFrom, STICKY_OFFSETS } from "./movement";
export type { MoveResult, StickyVacancy } from "./movement";
export { applyTransforms, resolveOverlaps } from "./effects";
export { destroyWithEffects } from "./destroy";
export {
  applyGas,
  applyDynamic,
  applyLife,
  applyFlux,
  syncPhysicsBodies,
  applyDynamicImpulse,
  accelerateDynamicYou,
  confusedDirection,
  reverseDirection,
} from "./dev-behaviors";
