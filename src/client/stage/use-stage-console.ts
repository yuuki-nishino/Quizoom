import { useMemo, useReducer } from "react";
import type { EventId } from "../../shared/domain-types";
import { useLiveChannel } from "../shared/use-live-channel";
import type { ConnectionStatus } from "../shared/use-live-channel";
import { buildStageWebSocketUrl } from "./ws-url";
import { stageReducer, initialStageState } from "./stage-state";
import type { StageState } from "./stage-state";

export interface UseStageConsoleResult {
  readonly state: StageState;
  readonly status: ConnectionStatus;
}

/** QuizSessionDO への投影(stage)接続を確立し、受信イベントを投影画面の表示状態へ畳み込む */
export function useStageConsole(eventId: EventId, token: string | null): UseStageConsoleResult {
  const [state, dispatch] = useReducer(stageReducer, initialStageState);
  const url = useMemo(() => (token ? buildStageWebSocketUrl(eventId, token, window.location.origin) : null), [eventId, token]);
  const { status } = useLiveChannel({ url, onEvent: dispatch });

  return { state, status };
}
