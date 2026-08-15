import { useEffect, useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { HostApiClient } from "./api-client";
import { useHostConsole } from "./use-host-console";
import { useServerClock, useRemainingMs } from "../shared/use-server-clock";
import { ConnectionBadge } from "../shared/connection-badge";
import { RecoveryBanner } from "../shared/recovery-banner";
import { ConfirmDialog } from "./confirm-dialog";
import { formatElapsedMs, formatRemainingSeconds } from "../shared/format";
import {
  canStartSession,
  canOpenQuestion,
  canCloseQuestion,
  canPause,
  canResume,
  canReopenQuestion,
  canRevealAnswer,
  canShowRanking,
  canFinalize,
  canShowNextQuestion,
  isLastQuestion,
  currentDeadlineAt,
  pausedRemainingMs,
} from "./live-console-state";

export interface LiveConsoleProps {
  readonly apiClient: HostApiClient;
  readonly eventId: EventId;
}

/** 進行画面: 参加者待機・出題・正解発表・ランキング・結果確定を1画面で扱う（要件5, 9.5, 11.5, 11.6） */
export function LiveConsole({ apiClient, eventId }: LiveConsoleProps) {
  const { state, status, send } = useHostConsole(eventId);
  const clock = useServerClock();
  const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [finalized, setFinalized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.getEvent(eventId).then((result) => {
      if (!cancelled && result.ok) setTotalQuestions(result.value.questions.length);
    });
    return () => {
      cancelled = true;
    };
  }, [apiClient, eventId]);

  useEffect(() => {
    if (state.serverNow !== null) clock.sync(state.serverNow, Date.now());
  }, [state.serverNow, clock]);

  const deadlineAt = currentDeadlineAt(state.phase);
  const remainingMs = useRemainingMs(clock, deadlineAt);
  const frozenRemainingMs = pausedRemainingMs(state.phase);

  const revealed = state.closedQuestion !== null;
  const rankingShown = state.ranking !== null;
  const lastQuestion = isLastQuestion(state.currentQuestion?.orderIndex ?? null, totalQuestions ?? Number.POSITIVE_INFINITY);

  function handleConfirmFinalize() {
    setConfirmingFinalize(false);
    setFinalized(true);
    send({ type: "finalize" });
  }

  const primaryButtonClass =
    "rounded-md bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300";
  const secondaryButtonClass =
    "rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
  const dangerButtonClass =
    "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300";

  return (
    <section aria-label="進行画面" className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">進行画面</h1>
        <ConnectionBadge status={status} />
      </div>
      <div className="mt-3">
        <RecoveryBanner status={status} />
      </div>
      {state.lastRejection && (
        <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          操作が拒否されました: {state.lastRejection.code}
        </p>
      )}

      {state.phase?.kind === "lobby" && (
        <div aria-label="参加者待機" className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">参加者を待っています</h2>
          <p className="mt-1 text-slate-600">現在の参加者数: {state.participantCount}人</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {state.participantNicknames.map((nickname, i) => (
              <li key={i} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {nickname}
              </li>
            ))}
          </ul>
          <button type="button" disabled={!canStartSession(state.phase)} onClick={() => send({ type: "startSession" })} className={`mt-5 ${primaryButtonClass}`}>
            開始する
          </button>
        </div>
      )}

      {state.phase?.kind === "ready" && (
        <div aria-label="出題待機" className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <button type="button" disabled={!canOpenQuestion(state.phase)} onClick={() => send({ type: "openQuestion" })} className={primaryButtonClass}>
            出題する
          </button>
        </div>
      )}

      {(state.phase?.kind === "questionOpen" || state.phase?.kind === "paused") && (
        <div aria-label="出題中" className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {state.currentQuestion && <h2 className="text-lg font-semibold text-slate-900">{state.currentQuestion.body}</h2>}
          <p className="mt-2 text-3xl font-bold tabular-nums text-indigo-700">
            {state.phase.kind === "paused" ? formatRemainingSeconds(frozenRemainingMs ?? 0) : formatRemainingSeconds(remainingMs ?? 0)}
            <span className="ml-1 text-base font-normal text-slate-500">秒</span>
            {state.phase.kind === "paused" && <span className="ml-2 text-base font-normal text-amber-600">（一時停止中）</span>}
          </p>
          <p className="mt-1 text-slate-600">
            回答済み {state.answeredCount} / {state.totalCount}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={!canCloseQuestion(state.phase)} onClick={() => send({ type: "closeQuestion" })} className={primaryButtonClass}>
              締め切る
            </button>
            <button type="button" disabled={!canPause(state.phase)} onClick={() => send({ type: "pause" })} className={secondaryButtonClass}>
              一時停止
            </button>
            <button type="button" disabled={!canResume(state.phase)} onClick={() => send({ type: "resume" })} className={secondaryButtonClass}>
              再開
            </button>
          </div>
        </div>
      )}

      {state.phase?.kind === "questionClosed" && !revealed && (
        <div aria-label="回答受付終了" className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-slate-700">回答受付を終了しました。正解を発表してください。</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={!canRevealAnswer(state.phase)} onClick={() => send({ type: "revealAnswer" })} className={primaryButtonClass}>
              正解を発表する
            </button>
            <button type="button" disabled={!canReopenQuestion(state.phase)} onClick={() => send({ type: "reopenQuestion" })} className={secondaryButtonClass}>
              回答受付を再開する
            </button>
          </div>
        </div>
      )}

      {revealed && !finalized && state.closedQuestion && (
        <div aria-label="正解発表" className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="font-medium text-emerald-700">正解: {state.closedQuestion.correctOptionId}</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {state.closedQuestion.distribution.map((d) => (
              <li key={d.optionId}>
                {d.optionId}: {d.count}人
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-slate-600">{state.closedQuestion.explanation}</p>

          {rankingShown && state.ranking && (
            <ol aria-label="中間ランキング" className="mt-4 space-y-1 rounded-md bg-slate-50 p-3 text-sm">
              {state.ranking.map((entry) => (
                <li key={entry.participantId} className="text-slate-800">
                  {entry.rank}位 {entry.nickname}（正解数 {entry.correctCount} / {formatElapsedMs(entry.totalElapsedMs)}）
                </li>
              ))}
            </ol>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" disabled={!canShowRanking(revealed, rankingShown)} onClick={() => send({ type: "showRanking" })} className={secondaryButtonClass}>
              中間ランキングを表示
            </button>
            {canShowNextQuestion(revealed, lastQuestion) && (
              <button type="button" onClick={() => send({ type: "nextQuestion" })} className={primaryButtonClass}>
                次の設問へ
              </button>
            )}
            <button type="button" disabled={!canFinalize(revealed)} onClick={() => setConfirmingFinalize(true)} className={dangerButtonClass}>
              結果を確定する
            </button>
          </div>
        </div>
      )}

      {finalized && (
        <div aria-label="結果確定済み" className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-6 text-center shadow-sm">
          <p className="font-medium text-emerald-800">結果を確定しました。</p>
        </div>
      )}

      {confirmingFinalize && (
        <ConfirmDialog
          title="結果を確定しますか？"
          message="最終ランキングを確定し、投影画面へ配信します。この操作は取り消せません。"
          confirmLabel="確定する"
          onCancel={() => setConfirmingFinalize(false)}
          onConfirm={handleConfirmFinalize}
        />
      )}
    </section>
  );
}
