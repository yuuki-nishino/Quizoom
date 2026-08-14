/**
 * 破壊的操作（結果確定・データ削除・イベント削除）の確認状態を管理する純粋なコントローラー。
 * キャンセル時に対象操作が一切実行されないことを、DOM なしで検証可能にする。
 */
export interface ConfirmController<T> {
  readonly target: T | null;
  request(target: T): void;
  cancel(): void;
  confirm(): void;
}

export function createConfirmController<T>(onConfirm: (target: T) => void): ConfirmController<T> {
  let target: T | null = null;

  return {
    get target() {
      return target;
    },
    request(next) {
      target = next;
    },
    cancel() {
      target = null;
    },
    confirm() {
      if (target === null) return;
      const confirmed = target;
      target = null;
      onConfirm(confirmed);
    },
  };
}
