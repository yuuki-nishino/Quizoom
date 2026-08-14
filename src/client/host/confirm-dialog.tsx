export interface ConfirmDialogProps {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** 破壊的操作（削除・結果確定）向けの汎用確認ダイアログ。対象名称は呼び出し側が message に埋め込む */
export function ConfirmDialog({ title, message, confirmLabel = "実行する", onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="confirm-dialog-backdrop" role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className="confirm-dialog">
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" onClick={onCancel}>
            キャンセル
          </button>
          <button type="button" onClick={onConfirm} className="confirm-dialog-danger" autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
