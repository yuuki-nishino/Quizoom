import type { RankingEntry } from "./domain-types";

export interface RevealBatch {
  /** 順位昇順。バッチ内での表示順を表す */
  readonly entries: readonly RankingEntry[];
}

const BATCH_SIZE = 5;
/** 上位何位までを「1人ずつの個別発表」段階として扱うか（最後のバッチが常にこの人数以下になる） */
const TOP_STAGE_SIZE = 5;

/**
 * 順位確定済み(rank昇順)の全参加者を、下位から5人単位のグループへ分割する純粋関数。
 * 最後の要素は常に上位5位（またはそれ未満の全員）のグループになる。サーバー(発表操作の
 * 妥当性検証)・クライアント(現在のグループの描画)の双方が同一の計算結果を必要とするため
 * shared配下に置く（要件15.1, 15.2）。
 */
export function buildRevealBatches(sortedEntries: readonly RankingEntry[]): readonly RevealBatch[] {
  const topCount = Math.min(TOP_STAGE_SIZE, sortedEntries.length);
  const topEntries = sortedEntries.slice(0, topCount);
  const restEntries = sortedEntries.slice(topCount);

  const reversedRest = [...restEntries].reverse();
  const batches: RevealBatch[] = [];
  for (let i = 0; i < reversedRest.length; i += BATCH_SIZE) {
    const chunk = reversedRest.slice(i, i + BATCH_SIZE).reverse();
    batches.push({ entries: chunk });
  }
  if (topEntries.length > 0) batches.push({ entries: topEntries });

  return batches;
}

/** `step`が最後のバッチ(上位5位の個別発表段階)を指しているかどうか（要件15.8） */
export function isFinalBatchStep(batches: readonly RevealBatch[], step: number): boolean {
  return batches.length > 0 && step >= batches.length - 1;
}
