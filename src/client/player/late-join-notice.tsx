export interface LateJoinNoticeProps {
  readonly onDismiss: () => void;
}

/** 途中参加の通知（要件4.10）。参加直後の一度きりの表示を想定し、閉じる操作を提供する */
export function LateJoinNotice({ onDismiss }: LateJoinNoticeProps) {
  return (
    <div
      role="alert"
      className="player-late-join-notice quiz-phase-enter mx-4 mt-4 flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm"
    >
      <p>途中から参加したため、既に出題された設問には回答できず、順位が不利になる場合があります。</p>
      <button
        type="button"
        onClick={onDismiss}
        className="self-end rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-transform active:scale-95 hover:bg-amber-700"
      >
        閉じる
      </button>
    </div>
  );
}
