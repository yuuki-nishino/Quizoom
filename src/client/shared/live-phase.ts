import type { LivePhase } from "../../shared/domain-types";

/** questionOpen フェーズの締切時刻。stateSnapshot(pause/resume含む)とquestionOpenedの双方から一貫して導出する */
export function currentDeadlineAt(phase: LivePhase | null): number | null {
  return phase?.kind === "questionOpen" ? phase.deadlineAt : null;
}

/** 一時停止中の凍結された残り時間。表示はこの値を優先し、クロック計算を行わない */
export function pausedRemainingMs(phase: LivePhase | null): number | null {
  return phase?.kind === "paused" ? phase.remainingMs : null;
}
