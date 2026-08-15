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
    <section aria-label="参加登録">
      <h1>{eventTitle}</h1>
      <form onSubmit={handleSubmit}>
        <label>
          ニックネーム
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="ニックネームを入力"
            autoComplete="off"
          />
        </label>
        <button type="submit" disabled={submitting || nickname.trim().length === 0}>
          参加する
        </button>
      </form>
      {errorCode && <p role="alert">{ERROR_MESSAGES[errorCode] ?? `エラーが発生しました（${errorCode}）。`}</p>}
    </section>
  );
}
