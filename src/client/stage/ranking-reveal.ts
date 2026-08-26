export interface RevealStep {
  /** `top`配列内でのインデックス(0 = 1位)。この順位が発表される */
  readonly index: number;
  /** 直前のステップ(なければ発表開始)からこのステップまでの遅延(ミリ秒) */
  readonly delayMs: number;
}

const DEFAULT_DELAY_MS = 600;
/** 上位3位(index 0, 1, 2)ほど間を長く取る。0番(1位)が最も長い（要件15.1, 15.2） */
const TOP3_DELAY_MS: Readonly<Record<number, number>> = { 0: 2400, 1: 1800, 2: 1400 };

function delayForIndex(index: number): number {
  return TOP3_DELAY_MS[index] ?? DEFAULT_DELAY_MS;
}

/**
 * 最終ランキングの発表スケジュールを計算する純粋関数。DOM操作・タイマーを持たず、
 * `count`件の表示対象について、最下位(index count-1)から1位(index 0)へ向かって
 * 1件ずつ発表する順序と、各ステップの遅延時間を返す（要件15.1, 15.2）。
 */
export function buildRevealSchedule(count: number): readonly RevealStep[] {
  const steps: RevealStep[] = [];
  for (let index = count - 1; index >= 0; index--) {
    steps.push({ index, delayMs: delayForIndex(index) });
  }
  return steps;
}
