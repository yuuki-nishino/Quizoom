import { useEffect, useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { QuestionClosedPayload, QuestionPublicView } from "../../shared/protocol";
import type { HostApiClient } from "./api-client";
import { useHostConsole } from "./use-host-console";
import { useServerClock, useRemainingMs } from "../shared/use-server-clock";
import { ConnectionBadge } from "../shared/connection-badge";
import { RecoveryBanner } from "../shared/recovery-banner";
import { ConfirmDialog } from "./confirm-dialog";
import { formatElapsedMs, formatRemainingSeconds } from "../shared/format";
import { buildOptionBreakdown } from "../shared/option-breakdown";
import { hostRoutePath } from "./route";
import { CheckCircleIcon } from "../shared/icons";
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
  isPracticeReady,
  isPracticeRevealed,
  canAdvanceFinalReveal,
  isEventFinished,
} from "./live-console-state";

export interface LiveConsoleProps {
  readonly apiClient: HostApiClient;
  readonly eventId: EventId;
}

export interface RevealSummaryProps {
  /** 再接続直後は復元されないため null になりうる（buildOptionBreakdown が代替ラベルへフォールバックする） */
  readonly question: QuestionPublicView | null;
  readonly closed: QuestionClosedPayload;
}

/**
 * 進行画面の正解発表: 正解と選択肢別の回答分布を、選択肢の文言・設問の並び順・人数と割合で表示する（要件5.6）。
 * 以前は optionId（UUID）をそのまま描画しており、主催者がどの選択肢が正解か説明できなかった（Issue #29）
 */
export function RevealSummary({ question, closed }: RevealSummaryProps) {
  const breakdown = buildOptionBreakdown(question, closed);
  const correctLabel = breakdown.find((row) => row.isCorrect)?.label ?? "";

  return (
    <>
      <p className="font-medium text-emerald-700">正解: {correctLabel}</p>
      <ul aria-label="回答分布" className="mt-2 space-y-1 text-sm">
        {breakdown.map((row) => (
          <li
            key={row.optionId}
            data-correct={row.isCorrect}
            className={
              row.isCorrect
                ? "flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-800"
                : "flex items-center gap-1.5 px-2 py-1 text-slate-600"
            }
          >
            {row.isCorrect && <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-600" />}
            <span>
              {row.label}: {row.count}人（{row.pct}%）
            </span>
          </li>
        ))}
      </ul>
    </>
  );
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

  const finished = isEventFinished(state.phase, state.revealStep);
  const revealed = state.closedQuestion !== null;
  const rankingShown = state.ranking !== null;
  const lastQuestion = isLastQuestion(state.currentQuestion?.orderIndex ?? null, totalQuestions ?? Number.POSITIVE_INFINITY);
  const practiceReady = isPracticeReady(state.phase);
  const practiceRevealed = isPracticeRevealed(state.closedQuestion?.questionId ?? null);

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
              <li key={i} className="max-w-[12rem] truncate rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700" title={nickname}>
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
          {practiceReady && (
            <p className="mb-3 text-sm text-slate-600">
              本編に入る前に、参加者が回答方法を確認できるテスト問題を実演できます（採点には反映されません）。
            </p>
          )}
          <button type="button" disabled={!canOpenQuestion(state.phase)} onClick={() => send({ type: "openQuestion" })} className={primaryButtonClass}>
            {practiceReady ? "テスト問題を出題する" : "出題する"}
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
          {practiceRevealed && (
            <p className="mb-2 inline-block rounded-full bg-slate-100 px-3 py-0.5 text-xs font-semibold text-slate-600">テスト問題</p>
          )}
          <RevealSummary question={state.currentQuestion} closed={state.closedQuestion} />
          <p className="mt-2 text-sm text-slate-600">{state.closedQuestion.explanation}</p>

          {practiceRevealed ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => send({ type: "nextQuestion" })} className={primaryButtonClass}>
                本編を開始する
              </button>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      {(finalized || finished) && (
        <FinalizedPanel
          eventId={eventId}
          finished={finished}
          canAdvance={canAdvanceFinalReveal(state.ranking, state.revealStep)}
          onAdvance={() => send({ type: "advanceFinalReveal" })}
        />
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

/**
 * 結果確定後の表示。一覧・結果への導線は、サーバーが確定を配信した(finished)後にだけ表示し、進行中や確定操作の直後には出さない(要件5.16, 5.17)。
 * 導線から離れても進行は止まらず、進行画面を開き直せば発表の操作を続けられる(要件5.19)
 */
export function FinalizedPanel({
  eventId,
  finished,
  canAdvance,
  onAdvance,
}: {
  readonly eventId: EventId;
  readonly finished: boolean;
  readonly canAdvance: boolean;
  readonly onAdvance: () => void;
}) {
  const linkClass =
    "rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";
  return (
    <div aria-label="結果確定済み" className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-6 text-center shadow-sm">
      <p className="font-medium text-emerald-800">結果を確定しました。</p>
      {canAdvance && (
        <button
          type="button"
          onClick={onAdvance}
          className="mt-4 rounded-md bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          次のグループを発表する
        </button>
      )}
      {finished && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <a href={hostRoutePath({ view: "list" })} className={linkClass}>
            イベント一覧へ戻る
          </a>
          <a href={hostRoutePath({ view: "editor", eventId, tab: "results" })} className={linkClass}>
            結果を見る
          </a>
        </div>
      )}
    </div>
  );
}
