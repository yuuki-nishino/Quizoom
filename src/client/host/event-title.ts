/** イベント名の入力値を保存用に整える。前後の空白を除去し、空なら null（保存不可） */
export function normalizeEventTitle(input: string): string | null {
  const trimmed = input.trim();
  return trimmed.length === 0 ? null : trimmed;
}
