import type { LivePhase } from "../../shared/domain-types";

/**
 * 接続直後（最初の stateSnapshot）のフェーズが lobby / ready より先へ進んでいる場合、
 * 少なくとも1問は既に出題済みであり、当該設問には回答できず順位が不利になる（要件4.9, 4.10）。
 * 判定は最初の stateSnapshot 時点のフェーズのみに基づき、以後の進行では変化しない。
 */
export function isLateJoin(initialPhaseKind: LivePhase["kind"] | null): boolean {
  return initialPhaseKind !== null && initialPhaseKind !== "lobby" && initialPhaseKind !== "ready";
}
