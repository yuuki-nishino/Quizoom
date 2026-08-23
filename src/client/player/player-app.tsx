import { useEffect, useState } from "react";
import { parsePlayerRoute } from "./route";
import { fetchJoinInfo, submitNickname } from "./join-api-client";
import type { JoinInfo } from "./join-api-client";
import { useParticipantToken } from "../shared/use-live-channel";
import { usePlayerConsole } from "./use-player-console";
import { buildPlayerMediaUrl } from "./media-url";
import { ThemeProvider } from "../shared/theme";
import { ConnectionBadge } from "../shared/connection-badge";
import { RecoveryBanner } from "../shared/recovery-banner";
import { useServerClock, useRemainingMs } from "../shared/use-server-clock";
import { currentDeadlineAt, pausedRemainingMs } from "../shared/live-phase";
import { isLateJoin } from "./late-join";
import { hasAnsweredCurrentQuestion } from "./player-state";
import { NicknameForm } from "./nickname-form";
import { WaitingScreen } from "./waiting-screen";
import { AnswerScreen } from "./answer-screen";
import { ResultScreen } from "./result-screen";
import { LateJoinNotice } from "./late-join-notice";

/** 回答画面のルート。参加登録・接続・フェーズに応じた画面切り替えを担う */
export function PlayerApp() {
  const route = parsePlayerRoute(window.location.pathname);
  const [joinInfo, setJoinInfo] = useState<JoinInfo | null>(null);
  const [joinInfoError, setJoinInfoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingNickname, setPendingNickname] = useState<string | null>(null);
  const [lateJoinDismissed, setLateJoinDismissed] = useState(false);

  useEffect(() => {
    if (!route) return;
    let cancelled = false;
    fetchJoinInfo(route.joinCode).then((result) => {
      if (cancelled) return;
      if (result.ok) setJoinInfo(result.value);
      else setJoinInfoError(result.code);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.joinCode]);

  const { token, save } = useParticipantToken(joinInfo?.eventId ?? null);

  async function handleNicknameSubmit(nickname: string) {
    if (!route) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitNickname(route.joinCode, nickname);
    setSubmitting(false);
    if (result.ok) {
      setPendingNickname(nickname);
      save(result.value.token);
    } else {
      setSubmitError(result.code);
    }
  }

  const { state, status, submission, submit, retry } = usePlayerConsole(joinInfo?.eventId ?? null, token);
  const clock = useServerClock();

  useEffect(() => {
    if (state.serverNow !== null) clock.sync(state.serverNow, Date.now());
  }, [state.serverNow, clock]);

  const deadlineAt = currentDeadlineAt(state.phase);
  const remainingMs = useRemainingMs(clock, deadlineAt);
  const frozenRemainingMs = pausedRemainingMs(state.phase);

  if (!route) {
    return (
      <p role="alert" className="flex min-h-screen items-center justify-center px-6 text-center text-red-700">
        参加用URLが無効です。QRコードを再度読み取ってください。
      </p>
    );
  }
  if (joinInfoError) {
    return (
      <p role="alert" className="flex min-h-screen items-center justify-center px-6 text-center text-red-700">
        参加できませんでした（{joinInfoError}）。
      </p>
    );
  }
  if (!joinInfo) {
    return <p className="flex min-h-screen items-center justify-center text-slate-500">読み込み中…</p>;
  }

  if (!token) {
    return (
      <ThemeProvider theme={joinInfo.theme}>
        <NicknameForm eventTitle={joinInfo.eventTitle} submitting={submitting} errorCode={submitError} onSubmit={handleNicknameSubmit} />
      </ThemeProvider>
    );
  }

  const theme = state.theme ?? joinInfo.theme;
  const nickname = state.nickname ?? pendingNickname ?? "";
  const showLateJoinNotice = isLateJoin(state.initialPhaseKind) && !lateJoinDismissed;
  const alreadyAnswered = hasAnsweredCurrentQuestion(state);
  const logoUrl = theme.logoAssetId ? buildPlayerMediaUrl(joinInfo.eventId, theme.logoAssetId, token) : null;
  const backgroundUrl = theme.backgroundAssetId ? buildPlayerMediaUrl(joinInfo.eventId, theme.backgroundAssetId, token) : null;

  return (
    <ThemeProvider theme={theme} logoImageUrl={logoUrl} backgroundImageUrl={backgroundUrl}>
      <div className="fixed top-3 right-3 z-10">
        <ConnectionBadge status={status} />
      </div>
      <div className="px-4 pt-3">
        <RecoveryBanner status={status} />
      </div>
      {showLateJoinNotice && <LateJoinNotice onDismiss={() => setLateJoinDismissed(true)} />}

      {state.phase === null ? (
        <p className="flex min-h-screen items-center justify-center text-slate-500">読み込み中…</p>
      ) : state.closedQuestion !== null ? (
        <ResultScreen personalResult={state.closedQuestion.personalResult} personalRank={state.personalRank} />
      ) : state.phase.kind === "questionClosed" ? (
        <p role="status" className="flex min-h-screen items-center justify-center px-6 text-center text-lg text-brand-text/80">
          回答受付を終了しました。正解発表をお待ちください。
        </p>
      ) : state.currentQuestion !== null && (state.phase.kind === "questionOpen" || state.phase.kind === "paused") ? (
        <AnswerScreen
          question={state.currentQuestion}
          imageUrl={
            state.currentQuestion.imageAssetId ? buildPlayerMediaUrl(joinInfo.eventId, state.currentQuestion.imageAssetId, token) : null
          }
          remainingMs={state.phase.kind === "paused" ? (frozenRemainingMs ?? 0) : (remainingMs ?? 0)}
          paused={state.phase.kind === "paused"}
          alreadyAnswered={alreadyAnswered}
          submission={submission}
          onSelect={submit}
          onRetry={retry}
        />
      ) : (
        <WaitingScreen nickname={nickname} />
      )}
    </ThemeProvider>
  );
}
