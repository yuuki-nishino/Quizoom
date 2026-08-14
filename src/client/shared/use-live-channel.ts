import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientCommand, ServerEvent } from "../../shared/protocol";
import type { EventId } from "../../shared/domain-types";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

/** ブラウザの WebSocket と互換な最小インターフェース。テストではモック実装を注入する */
export interface MinimalWebSocket {
  readonly readyState: number;
  onopen: (() => void) | null;
  onclose: ((event: { readonly code: number; readonly reason: string }) => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { readonly data: string }) => void) | null;
  send(data: string): void;
  close(): void;
}

export type WebSocketFactory = (url: string) => MinimalWebSocket;

export interface Scheduler {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

const WEB_SOCKET_OPEN = 1;

const defaultScheduler: Scheduler = {
  setTimeout: (handler, ms) => setTimeout(handler, ms) as unknown as number,
  clearTimeout: (handle) => clearTimeout(handle),
};

export interface LiveChannelOptions {
  readonly url: string;
  readonly createWebSocket: WebSocketFactory;
  readonly onEvent: (event: ServerEvent) => void;
  readonly onStatusChange?: (status: ConnectionStatus) => void;
  readonly scheduler?: Scheduler;
  readonly minBackoffMs?: number;
  readonly maxBackoffMs?: number;
}

export interface LiveChannel {
  getStatus(): ConnectionStatus;
  send(command: ClientCommand): void;
  connect(): void;
  close(): void;
  /** バックグラウンド復帰時（visibilitychange）に、切断中であれば即座に再接続を試みる */
  notifyVisible(): void;
}

/**
 * WebSocket 接続・指数バックオフ再接続を管理する。ブラウザ API に直接依存させず
 * WebSocket 生成とタイマーを注入させることで、DOM 環境なしに再接続シナリオを検証できるようにする。
 */
export function createLiveChannel(options: LiveChannelOptions): LiveChannel {
  const minBackoffMs = options.minBackoffMs ?? 500;
  const maxBackoffMs = options.maxBackoffMs ?? 10_000;
  const scheduler = options.scheduler ?? defaultScheduler;

  let status: ConnectionStatus = "closed";
  let socket: MinimalWebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectHandle: number | null = null;
  let closedByUser = true;

  function setStatus(next: ConnectionStatus): void {
    if (status === next) return;
    status = next;
    options.onStatusChange?.(next);
  }

  function clearReconnectTimer(): void {
    if (reconnectHandle !== null) {
      scheduler.clearTimeout(reconnectHandle);
      reconnectHandle = null;
    }
  }

  function openSocket(): void {
    if (closedByUser) return;
    setStatus(reconnectAttempts > 0 ? "reconnecting" : "connecting");

    const ws = options.createWebSocket(options.url);
    socket = ws;

    ws.onopen = () => {
      reconnectAttempts = 0;
      setStatus("open");
    };
    ws.onmessage = (event) => {
      options.onEvent(JSON.parse(event.data) as ServerEvent);
    };
    ws.onclose = () => {
      socket = null;
      if (closedByUser) {
        setStatus("closed");
        return;
      }
      scheduleReconnect();
    };
    ws.onerror = () => {
      ws.close();
    };
  }

  function scheduleReconnect(): void {
    clearReconnectTimer();
    const delay = Math.min(minBackoffMs * 2 ** reconnectAttempts, maxBackoffMs);
    reconnectAttempts += 1;
    setStatus("reconnecting");
    reconnectHandle = scheduler.setTimeout(() => {
      reconnectHandle = null;
      openSocket();
    }, delay);
  }

  return {
    getStatus: () => status,

    send(command) {
      if (socket && socket.readyState === WEB_SOCKET_OPEN) {
        socket.send(JSON.stringify(command));
      }
    },

    connect() {
      closedByUser = false;
      reconnectAttempts = 0;
      clearReconnectTimer();
      openSocket();
    },

    close() {
      closedByUser = true;
      clearReconnectTimer();
      socket?.close();
      socket = null;
      setStatus("closed");
    },

    notifyVisible() {
      if (closedByUser) return;
      const disconnected = !socket || socket.readyState !== WEB_SOCKET_OPEN;
      if (disconnected) {
        reconnectAttempts = 0;
        clearReconnectTimer();
        openSocket();
      }
    },
  };
}

// --- 参加者トークンの永続化（イベントIDでスコープ） -------------------------

export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function participantTokenKey(eventId: EventId): string {
  return `quizoom:participant-token:${eventId}`;
}

export function loadParticipantToken(storage: TokenStorage, eventId: EventId): string | null {
  return storage.getItem(participantTokenKey(eventId));
}

export function saveParticipantToken(storage: TokenStorage, eventId: EventId, token: string): void {
  storage.setItem(participantTokenKey(eventId), token);
}

function browserTokenStorage(): TokenStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

// --- React フック -----------------------------------------------------------

function defaultWebSocketFactory(url: string): MinimalWebSocket {
  return new WebSocket(url) as unknown as MinimalWebSocket;
}

export interface UseLiveChannelOptions {
  /** 接続先URL。null の間は接続を確立しない（例: 参加登録が未完了） */
  readonly url: string | null;
  readonly onEvent: (event: ServerEvent) => void;
  readonly createWebSocket?: WebSocketFactory;
}

export interface UseLiveChannelResult {
  readonly status: ConnectionStatus;
  send(command: ClientCommand): void;
}

export function useLiveChannel(options: UseLiveChannelOptions): UseLiveChannelResult {
  const { url, createWebSocket } = options;
  const [status, setStatus] = useState<ConnectionStatus>("closed");
  const channelRef = useRef<LiveChannel | null>(null);
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;

  useEffect(() => {
    if (!url) return;

    const channel = createLiveChannel({
      url,
      createWebSocket: createWebSocket ?? defaultWebSocketFactory,
      onStatusChange: setStatus,
      onEvent: (event) => onEventRef.current(event),
    });
    channelRef.current = channel;
    channel.connect();

    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        channel.notifyVisible();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
      channel.close();
      channelRef.current = null;
    };
  }, [url, createWebSocket]);

  const send = useCallback((command: ClientCommand) => {
    channelRef.current?.send(command);
  }, []);

  return { status, send };
}

export function useParticipantToken(eventId: EventId | null): {
  readonly token: string | null;
  save(token: string): void;
} {
  const storage = browserTokenStorage();
  const [token, setToken] = useState<string | null>(() =>
    eventId && storage ? loadParticipantToken(storage, eventId) : null,
  );

  const save = useCallback(
    (next: string) => {
      if (eventId && storage) {
        saveParticipantToken(storage, eventId, next);
      }
      setToken(next);
    },
    [eventId, storage],
  );

  return { token, save };
}
