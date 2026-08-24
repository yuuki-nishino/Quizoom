import { useState } from "react";

export interface NicknameFormProps {
  readonly eventTitle: string;
  readonly submitting: boolean;
  readonly errorCode: string | null;
  readonly onSubmit: (nickname: string) => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  NICKNAME_TAKEN: "そのニックネームは既に使われています。別の名前を入力してください。",
  CAPACITY_REACHED: "定員に達しているため参加できません。",
  EVENT_FINISHED: "このイベントは終了しています。",
  VALIDATION: "ニックネームを正しく入力してください（1〜20文字、改行や制御文字は使用できません）。",
};

/** ニックネーム入力・送信フォーム（要件4.3, 4.4, 11.3, 11.4） */
export function NicknameForm({ eventTitle, submitting, errorCode, onSubmit }: NicknameFormProps) {
  const [nickname, setNickname] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (trimmed.length === 0 || submitting) return;
    onSubmit(trimmed);
  }

  return (
    <section aria-label="参加登録" className="quiz-phase-enter flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight text-brand-primary drop-shadow-sm">{eventTitle}</h1>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white/70 p-6 shadow-lg backdrop-blur-sm">
        <label className="block text-left text-sm font-medium text-brand-text/80">
          ニックネーム
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="ニックネームを入力"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-3 text-lg text-slate-900 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
        </label>
        <button
          type="submit"
          disabled={submitting || nickname.trim().length === 0}
          className="rounded-lg bg-brand-primary px-5 py-3 text-lg font-bold text-white shadow-md transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          参加する
        </button>
      </form>
      {errorCode && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {ERROR_MESSAGES[errorCode] ?? `エラーが発生しました（${errorCode}）。`}
        </p>
      )}
    </section>
  );
}
