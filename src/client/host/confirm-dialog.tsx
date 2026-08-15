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
    <div
      className="confirm-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="confirm-dialog w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-bold text-slate-900">
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="confirm-dialog-actions mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="confirm-dialog-danger rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
