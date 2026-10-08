import { useState } from "react";
import { normalizeEventTitle } from "./event-title";

export interface EventRenameFormProps {
  readonly initialTitle: string;
  /** 保存を実行する。成功時は true、失敗時は false（フォームは開いたまま） */
  readonly onSave: (title: string) => Promise<boolean>;
  readonly onCancel: () => void;
}

/** イベント名のインライン変更フォーム（Issue #43）。一覧と編集画面で共用する */
export function EventRenameForm({
  initialTitle,
  onSave,
  onCancel,
}: EventRenameFormProps) {
  const [value, setValue] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const normalized = normalizeEventTitle(value);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (normalized === null) return;
    if (normalized === initialTitle) {
      onCancel();
      return;
    }
    setSaving(true);
    setFailed(false);
    const ok = await onSave(normalized);
    setSaving(false);
    if (!ok) setFailed(true);
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="イベント名の変更"
      className="flex flex-1 flex-wrap items-center gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="イベント名"
        autoFocus
        className="min-w-48 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-base font-normal text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
      <button
        type="submit"
        disabled={saving || normalized === null}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        保存
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-normal text-slate-700 hover:bg-slate-50"
      >
        キャンセル
      </button>
      {failed && (
        <p role="alert" className="w-full text-sm font-normal text-red-700">
          名前を変更できませんでした。もう一度お試しください。
        </p>
      )}
    </form>
  );
}
