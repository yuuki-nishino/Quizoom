import { useCallback, useMemo, useReducer } from "react";
import type { EventId } from "../../shared/domain-types";
import type { HostCommand } from "../../shared/protocol";
import { useLiveChannel } from "../shared/use-live-channel";
import { buildHostWebSocketUrl } from "./ws-url";
import { hostConsoleReducer, initialHostConsoleState } from "./live-console-state";
import type { HostConsoleState } from "./live-console-state";
import type { ConnectionStatus } from "../shared/use-live-channel";

export interface UseHostConsoleResult {
  readonly state: HostConsoleState;
  readonly status: ConnectionStatus;
  send(command: HostCommand): void;
}

/** QuizSessionDO への主催者接続を確立し、受信イベントをホストコンソールの表示状態へ畳み込む */
export function useHostConsole(eventId: EventId): UseHostConsoleResult {
  const [state, dispatch] = useReducer(hostConsoleReducer, initialHostConsoleState);
  const url = useMemo(() => buildHostWebSocketUrl(eventId, window.location.origin), [eventId]);
  const { status, send } = useLiveChannel({ url, onEvent: dispatch });

  const sendCommand = useCallback((command: HostCommand) => send(command), [send]);

  return { state, status, send: sendCommand };
}
