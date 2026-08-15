import type { PublicResult, PublicTheme } from "../../shared/domain-types";
import { formatElapsedMs } from "../shared/format";

export interface RankingImageRow {
  readonly rank: number;
  readonly nickname: string;
  readonly detail: string;
  readonly y: number;
}

export interface RankingImageLayout {
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly subtitle: string;
  readonly theme: PublicTheme;
  readonly rows: readonly RankingImageRow[];
}

export const RANKING_IMAGE_WIDTH = 720;
const HEADER_HEIGHT = 120;
const ROW_HEIGHT = 64;
const BOTTOM_PADDING = 32;
export const DEFAULT_RANKING_IMAGE_TOP_N = 5;

/**
 * ランキング画像のレイアウトを算出する純粋関数。画像化の対象は上位者に限定する
 * （要件: 参加者数が多い場合の可読性維持。ページ本体では全員を表示する）。
 */
export function computeRankingImageLayout(result: PublicResult, topN: number = DEFAULT_RANKING_IMAGE_TOP_N): RankingImageLayout {
  const top = [...result.entries].sort((a, b) => a.rank - b.rank).slice(0, topN);
  const rows: readonly RankingImageRow[] = top.map((entry, index) => ({
    rank: entry.rank,
    nickname: entry.nickname,
    detail: `正解数 ${entry.correctCount} / ${formatElapsedMs(entry.totalElapsedMs)}`,
    y: HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2,
  }));

  return {
    width: RANKING_IMAGE_WIDTH,
    height: HEADER_HEIGHT + rows.length * ROW_HEIGHT + BOTTOM_PADDING,
    title: result.eventTitle,
    subtitle: "最終ランキング",
    theme: result.theme,
    rows,
  };
}
