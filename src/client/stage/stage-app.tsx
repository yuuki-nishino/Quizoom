import { useEffect, useState } from "react";
import { parseStageRoute } from "./route";
import { fetchStageInfo } from "./stage-api-client";
import type { StageInfo } from "./stage-api-client";
import { useStageConsole } from "./use-stage-console";
import { buildStageMediaUrl } from "./media-url";
import { ThemeProvider } from "../shared/theme";
import { ConnectionBadge } from "../shared/connection-badge";
import { RecoveryBanner } from "../shared/recovery-banner";
import { useServerClock, useRemainingMs } from "../shared/use-server-clock";
import { currentDeadlineAt, pausedRemainingMs } from "../shared/live-phase";
import { WaitingRoom } from "./waiting-room";
import { QuestionView } from "./question-view";
import { RevealView } from "./reveal-view";
import { RankingView } from "./ranking-view";

/** 投影画面のルート。stage_token の検証・接続・フェーズに応じた画面切り替えを担う */
export function StageApp() {
  const route = parseStageRoute(window.location.pathname, window.location.search);
  const [info, setInfo] = useState<StageInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  useEffect(() => {
    if (!route?.token) return;
    let cancelled = false;
    fetchStageInfo(route.eventId, route.token).then((result) => {
      if (cancelled) return;
      if (result.ok) setInfo(result.value);
      else setInfoError(result.code);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.eventId, route?.token]);

  const { state, status } = useStageConsole(route?.eventId ?? ("" as never), route?.token ?? null);
  const clock = useServerClock();

  useEffect(() => {
    if (state.serverNow !== null) clock.sync(state.serverNow, Date.now());
  }, [state.serverNow, clock]);

  const deadlineAt = currentDeadlineAt(state.phase);
  const remainingMs = useRemainingMs(clock, deadlineAt);
  const frozenRemainingMs = pausedRemainingMs(state.phase);

  if (!route || !route.token) {
    return (
      <p role="alert" className="flex min-h-screen items-center justify-center bg-slate-900 p-8 text-center text-xl text-white">
        投影URLが無効です。主催者からQRコードまたはURLを再度取得してください。
      </p>
    );
  }
  if (infoError) {
    return (
      <p role="alert" className="flex min-h-screen items-center justify-center bg-slate-900 p-8 text-center text-xl text-white">
        投影画面を表示できませんでした（{infoError}）。
      </p>
    );
  }
  if (!info) {
    return <p className="flex min-h-screen items-center justify-center bg-slate-900 text-xl text-slate-300">読み込み中…</p>;
  }

  const theme = state.theme ?? info.theme;
  const joinUrl = info.joinCode ? `${window.location.origin}/join/${info.joinCode}` : null;
  const logoUrl = theme.logoAssetId ? buildStageMediaUrl(route.eventId, theme.logoAssetId, route.token) : null;
  const backgroundUrl = theme.backgroundAssetId ? buildStageMediaUrl(route.eventId, theme.backgroundAssetId, route.token) : null;

  return (
    <ThemeProvider theme={theme} logoImageUrl={logoUrl} backgroundImageUrl={backgroundUrl}>
      <div className="fixed top-4 right-4 z-10">
        <ConnectionBadge status={status} />
      </div>
      <div className="fixed top-16 left-4 right-4 z-10">
        <RecoveryBanner status={status} />
      </div>

      {state.ranking !== null ? (
        <RankingView entries={state.ranking} isFinal={state.isFinalRanking} />
      ) : state.closedQuestion !== null && state.currentQuestion !== null ? (
        <RevealView question={state.currentQuestion} closed={state.closedQuestion} />
      ) : state.currentQuestion !== null ? (
        <QuestionView
          question={state.currentQuestion}
          imageUrl={
            state.currentQuestion.imageAssetId ? buildStageMediaUrl(route.eventId, state.currentQuestion.imageAssetId, route.token) : null
          }
          remainingMs={state.phase?.kind === "paused" ? (frozenRemainingMs ?? 0) : (remainingMs ?? 0)}
          paused={state.phase?.kind === "paused"}
          answeredCount={state.answeredCount}
          totalCount={state.totalCount}
        />
      ) : (
        <WaitingRoom eventTitle={info.eventTitle} joinUrl={joinUrl} participantCount={state.participantCount} />
      )}
    </ThemeProvider>
  );
}
