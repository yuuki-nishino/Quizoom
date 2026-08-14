import { useEffect, useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { HostApiClient } from "./api-client";
import { useHostConsole } from "./use-host-console";
import { useServerClock, useRemainingMs } from "../shared/use-server-clock";
import { ConnectionBadge } from "./connection-badge";
import { RecoveryBanner } from "./recovery-banner";
import { ConfirmDialog } from "./confirm-dialog";
import { formatElapsedMs, formatRemainingSeconds } from "./format";
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

  return (
    <section aria-label="進行画面">
      <ConnectionBadge status={status} />
      <RecoveryBanner status={status} />
      {state.lastRejection && <p role="alert">操作が拒否されました: {state.lastRejection.code}</p>}

      {state.phase?.kind === "lobby" && (
        <div aria-label="参加者待機">
          <h2>参加者を待っています</h2>
          <p>現在の参加者数: {state.participantCount}人</p>
          <ul>
            {state.participantNicknames.map((nickname, i) => (
              <li key={i}>{nickname}</li>
            ))}
          </ul>
          <button type="button" disabled={!canStartSession(state.phase)} onClick={() => send({ type: "startSession" })}>
            開始する
          </button>
        </div>
      )}

      {state.phase?.kind === "ready" && (
        <div aria-label="出題待機">
          <button type="button" disabled={!canOpenQuestion(state.phase)} onClick={() => send({ type: "openQuestion" })}>
            出題する
          </button>
        </div>
      )}

      {(state.phase?.kind === "questionOpen" || state.phase?.kind === "paused") && (
        <div aria-label="出題中">
          {state.currentQuestion && <h2>{state.currentQuestion.body}</h2>}
          <p>
            残り時間:{" "}
            {state.phase.kind === "paused" ? formatRemainingSeconds(frozenRemainingMs ?? 0) : formatRemainingSeconds(remainingMs ?? 0)}秒
            {state.phase.kind === "paused" && "（一時停止中）"}
          </p>
          <p>
            回答済み {state.answeredCount} / {state.totalCount}
          </p>
          <button type="button" disabled={!canCloseQuestion(state.phase)} onClick={() => send({ type: "closeQuestion" })}>
            締め切る
          </button>
          <button type="button" disabled={!canPause(state.phase)} onClick={() => send({ type: "pause" })}>
            一時停止
          </button>
          <button type="button" disabled={!canResume(state.phase)} onClick={() => send({ type: "resume" })}>
            再開
          </button>
        </div>
      )}

      {state.phase?.kind === "questionClosed" && !revealed && (
        <div aria-label="回答受付終了">
          <p>回答受付を終了しました。正解を発表してください。</p>
          <button type="button" disabled={!canRevealAnswer(state.phase)} onClick={() => send({ type: "revealAnswer" })}>
            正解を発表する
          </button>
          <button type="button" disabled={!canReopenQuestion(state.phase)} onClick={() => send({ type: "reopenQuestion" })}>
            回答受付を再開する
          </button>
        </div>
      )}

      {revealed && !finalized && state.closedQuestion && (
        <div aria-label="正解発表">
          <p>正解: {state.closedQuestion.correctOptionId}</p>
          <ul>
            {state.closedQuestion.distribution.map((d) => (
              <li key={d.optionId}>
                {d.optionId}: {d.count}人
              </li>
            ))}
          </ul>
          <p>{state.closedQuestion.explanation}</p>

          {rankingShown && state.ranking && (
            <ol aria-label="中間ランキング">
              {state.ranking.map((entry) => (
                <li key={entry.participantId}>
                  {entry.rank}位 {entry.nickname}（正解数 {entry.correctCount} / {formatElapsedMs(entry.totalElapsedMs)}）
                </li>
              ))}
            </ol>
          )}

          <button type="button" disabled={!canShowRanking(revealed, rankingShown)} onClick={() => send({ type: "showRanking" })}>
            中間ランキングを表示
          </button>
          {canShowNextQuestion(revealed, lastQuestion) && (
            <button type="button" onClick={() => send({ type: "nextQuestion" })}>
              次の設問へ
            </button>
          )}
          <button type="button" disabled={!canFinalize(revealed)} onClick={() => setConfirmingFinalize(true)}>
            結果を確定する
          </button>
        </div>
      )}

      {finalized && (
        <div aria-label="結果確定済み">
          <p>結果を確定しました。</p>
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
