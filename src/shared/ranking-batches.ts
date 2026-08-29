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

/**
 * 「6位以下のグループ段階」と「上位5位以内の個別発表段階」を通した単一の連番として、
 * 主催者操作(advanceFinalReveal)で到達できる最大の発表段階(1位が発表された状態)を返す
 * （要件15.3, 15.4, 15.8）。6位以下のグループ数を`restCount`とすると、上位5位グループ内は
 * 1人ずつ`restCount`件のステップに1件ずつ追加され、最後のステップ(=maxRevealStep)で1位まで
 * 発表済みになる。
 */
export function maxRevealStep(batches: readonly RevealBatch[]): number {
  if (batches.length === 0) return 0;
  const restCount = batches.length - 1;
  const topCount = batches[batches.length - 1]!.entries.length;
  return restCount + Math.max(topCount - 1, 0);
}

/** `step`が「6位以下のグループ」ではなく「上位5位以内の個別発表」段階を指しているかどうか（要件15.3, 15.8） */
export function isTopStage(batches: readonly RevealBatch[], step: number): boolean {
  if (batches.length === 0) return false;
  const restCount = batches.length - 1;
  return step >= restCount;
}

/** `isTopStage`のとき、上位5位グループのうち下位から何人発表済みかを返す（`isTopStage`でなければ0、要件15.3, 15.4） */
export function revealedTopCount(batches: readonly RevealBatch[], step: number): number {
  if (!isTopStage(batches, step)) return 0;
  const restCount = batches.length - 1;
  return step - restCount + 1;
}
