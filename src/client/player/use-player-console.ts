import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { EventId, OptionId, QuestionId } from "../../shared/domain-types";
import type { ServerEvent } from "../../shared/protocol";
import { useLiveChannel } from "../shared/use-live-channel";
import type { ConnectionStatus } from "../shared/use-live-channel";
import { buildPlayerWebSocketUrl } from "./ws-url";
import { playerReducer, initialPlayerState } from "./player-state";
import type { PlayerState } from "./player-state";
import { answerSubmissionReducer, initialAnswerSubmissionState, canSubmitAnswer } from "./answer-submission";
import type { AnswerSubmissionState } from "./answer-submission";

const SEND_TIMEOUT_MS = 5000;

export interface UsePlayerConsoleResult {
  readonly state: PlayerState;
  readonly status: ConnectionStatus;
  readonly submission: AnswerSubmissionState;
  submit(optionId: OptionId): void;
  retry(): void;
}

/**
 * QuizSessionDO への参加者接続を確立し、進行状態と回答送信の状態機械を結線する。
 * 送信は「チャネルが開いていない」または「一定時間応答がない」場合を通信失敗として扱い、
 * 再送手段を提供する（要件9.6）。
 */
export function usePlayerConsole(eventId: EventId | null, token: string | null): UsePlayerConsoleResult {
  const [state, dispatchEvent] = useReducer(playerReducer, initialPlayerState);
  const [submission, dispatchSubmission] = useReducer(answerSubmissionReducer, initialAnswerSubmissionState);
  const timeoutRef = useRef<number | null>(null);
  const pendingRef = useRef<{ readonly questionId: QuestionId; readonly optionId: OptionId } | null>(null);

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const onEvent = useCallback(
    (event: ServerEvent) => {
      dispatchEvent(event);

      if (event.type === "answerAccepted" && pendingRef.current) {
        clearPendingTimeout();
        dispatchSubmission({ type: "accepted", questionId: event.payload.questionId, optionId: event.payload.selectedOptionId });
        pendingRef.current = null;
      }
      if (event.type === "commandRejected" && pendingRef.current) {
        const { questionId } = pendingRef.current;
        clearPendingTimeout();
        dispatchSubmission({ type: "rejected", questionId, code: event.payload.code });
        pendingRef.current = null;
      }
      if (event.type === "questionOpened") {
        clearPendingTimeout();
        pendingRef.current = null;
        dispatchSubmission({ type: "reset" });
      }
    },
    [clearPendingTimeout],
  );

  const url = useMemo(() => (eventId && token ? buildPlayerWebSocketUrl(eventId, token, window.location.origin) : null), [eventId, token]);
  const { status, send } = useLiveChannel({ url, onEvent });

  useEffect(() => clearPendingTimeout, [clearPendingTimeout]);

  const submit = useCallback(
    (optionId: OptionId) => {
      const questionId = state.currentQuestion?.id;
      if (!questionId || !canSubmitAnswer(submission, questionId)) return;

      dispatchSubmission({ type: "submit", questionId, optionId });
      pendingRef.current = { questionId, optionId };

      if (status !== "open") {
        clearPendingTimeout();
        dispatchSubmission({ type: "sendFailed", questionId });
        pendingRef.current = null;
        return;
      }

      send({ type: "submitAnswer", questionId, optionId });
      clearPendingTimeout();
      timeoutRef.current = window.setTimeout(() => {
        dispatchSubmission({ type: "sendFailed", questionId });
        pendingRef.current = null;
      }, SEND_TIMEOUT_MS);
    },
    [state.currentQuestion?.id, submission, status, send, clearPendingTimeout],
  );

  const retry = useCallback(() => {
    if (submission.status !== "failed") return;
    submit(submission.optionId);
  }, [submission, submit]);

  return { state, status, submission, submit, retry };
}
