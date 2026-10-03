import type { AssetId } from "./domain-types";

/**
 * 選択肢画像の仕様値(Issue #36)。クライアントの画像加工と投影画面の表示が同じ値を参照する。
 * 値を変えると既存の保存済み画像の見え方に影響するため、変更時は表示側の確認が必要。
 */
export const CHOICE_IMAGE_ASPECT = { width: 4, height: 3 } as const;
export const CHOICE_IMAGE_MAX_LONG_EDGE_PX = 800;
export const CHOICE_IMAGE_OUTPUT_TYPE = "image/jpeg" as const;
export const CHOICE_IMAGE_OUTPUT_QUALITY = 0.85;

/** いずれかの選択肢が画像を持つときtrue。投影画面のフィットレイアウトへの切替条件 */
export function hasChoiceImages(options: readonly { readonly imageAssetId: AssetId | null }[]): boolean {
  return options.some((option) => option.imageAssetId !== null);
}
