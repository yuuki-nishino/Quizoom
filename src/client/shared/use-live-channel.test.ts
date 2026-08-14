import { describe, it, expect, vi } from "vitest";
import { createLiveChannel, loadParticipantToken, saveParticipantToken } from "./use-live-channel";
import type { MinimalWebSocket, Scheduler, WebSocketFactory } from "./use-live-channel";
import type { ServerEvent } from "../../shared/protocol";
import type { EventId } from "../../shared/domain-types";

class FakeWebSocket implements MinimalWebSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: { readonly code: number; readonly reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { readonly data: string }) => void) | null = null;
  readonly send = vi.fn();
  closed = false;

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  serverClose(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: "abnormal" });
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
}

function fakeScheduler(): {
  readonly scheduler: Scheduler;
  flushNext(): void;
  pendingCount(): number;
  pendingDelay(): number | undefined;
} {
  const timers: { handler: () => void; ms: number; handle: number }[] = [];
  let nextHandle = 1;
  return {
    scheduler: {
      setTimeout(handler, ms) {
        const handle = nextHandle++;
        timers.push({ handler, ms, handle });
        return handle;
      },
      clearTimeout(handle) {
        const idx = timers.findIndex((t) => t.handle === handle);
        if (idx !== -1) timers.splice(idx, 1);
      },
    },
    flushNext() {
      const timer = timers.shift();
      timer?.handler();
    },
    pendingCount: () => timers.length,
    pendingDelay: () => timers[0]?.ms,
  };
}

function setup() {
  const sockets: FakeWebSocket[] = [];
  const createWebSocket: WebSocketFactory = () => {
    const ws = new FakeWebSocket();
    sockets.push(ws);
    return ws;
  };
  const timers = fakeScheduler();
  const events: ServerEvent[] = [];
  const statuses: string[] = [];

  const channel = createLiveChannel({
    url: "wss://example.test/connect",
    createWebSocket,
    scheduler: timers.scheduler,
    minBackoffMs: 500,
    maxBackoffMs: 4000,
    onEvent: (event) => events.push(event),
    onStatusChange: (status) => statuses.push(status),
  });

  return { channel, sockets, timers, events, statuses };
}

describe("createLiveChannel", () => {
  it("transitions connecting -> open when the socket opens", () => {
    const { channel, sockets, statuses } = setup();

    channel.connect();
    expect(statuses).toEqual(["connecting"]);
    expect(sockets).toHaveLength(1);

    sockets[0]!.open();
    expect(statuses).toEqual(["connecting", "open"]);
    expect(channel.getStatus()).toBe("open");
  });

  it("forwards parsed messages via onEvent", () => {
    const { channel, sockets, events } = setup();
    channel.connect();
    sockets[0]!.open();

    sockets[0]!.onmessage?.({ data: JSON.stringify({ type: "participantJoined", payload: { participantCount: 1, nickname: "a" } }) });

    expect(events).toEqual([{ type: "participantJoined", payload: { participantCount: 1, nickname: "a" } }]);
  });

  it("only sends over an open socket", () => {
    const { channel, sockets } = setup();
    channel.connect();

    channel.send({ type: "resync" });
    expect(sockets[0]!.send).not.toHaveBeenCalled();

    sockets[0]!.open();
    channel.send({ type: "resync" });
    expect(sockets[0]!.send).toHaveBeenCalledWith(JSON.stringify({ type: "resync" }));
  });

  it("reconnects with exponential backoff after a server-initiated close, and resets state via a fresh socket", () => {
    const { channel, sockets, timers, statuses } = setup();
    channel.connect();
    sockets[0]!.open();

    sockets[0]!.serverClose();
    expect(channel.getStatus()).toBe("reconnecting");
    expect(timers.pendingDelay()).toBe(500);

    timers.flushNext();
    expect(sockets).toHaveLength(2);
    expect(statuses.at(-1)).toBe("reconnecting");

    sockets[1]!.serverClose();
    expect(timers.pendingDelay()).toBe(1000);

    timers.flushNext();
    sockets[2]!.serverClose();
    expect(timers.pendingDelay()).toBe(2000);
  });

  it("caps backoff delay at maxBackoffMs", () => {
    const { channel, sockets, timers } = setup();
    channel.connect();
    sockets[0]!.open();

    for (let i = 0; i < 5; i += 1) {
      sockets.at(-1)!.serverClose();
      timers.flushNext();
    }

    sockets.at(-1)!.serverClose();
    expect(timers.pendingDelay()).toBe(4000);
  });

  it("does not schedule a reconnect after a user-initiated close", () => {
    const { channel, sockets, timers } = setup();
    channel.connect();
    sockets[0]!.open();

    channel.close();
    expect(channel.getStatus()).toBe("closed");
    expect(sockets[0]!.closed).toBe(true);
    expect(timers.pendingCount()).toBe(0);
  });

  it("reconnects immediately on notifyVisible while reconnecting, bypassing the pending backoff timer", () => {
    const { channel, sockets, timers } = setup();
    channel.connect();
    sockets[0]!.open();
    sockets[0]!.serverClose();
    expect(timers.pendingCount()).toBe(1);

    channel.notifyVisible();
    expect(sockets).toHaveLength(2);
    expect(timers.pendingCount()).toBe(0);
  });

  it("does not reconnect on notifyVisible while already open", () => {
    const { channel, sockets } = setup();
    channel.connect();
    sockets[0]!.open();

    channel.notifyVisible();
    expect(sockets).toHaveLength(1);
  });
});

describe("participant token storage", () => {
  function memoryStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
    const map = new Map<string, string>();
    return {
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => {
        map.set(key, value);
      },
    };
  }

  it("round-trips a token scoped by eventId", () => {
    const storage = memoryStorage();
    const eventId = "event-1" as EventId;

    expect(loadParticipantToken(storage, eventId)).toBeNull();
    saveParticipantToken(storage, eventId, "token-abc");
    expect(loadParticipantToken(storage, eventId)).toBe("token-abc");
  });

  it("keeps tokens for different events independent", () => {
    const storage = memoryStorage();
    const eventA = "event-a" as EventId;
    const eventB = "event-b" as EventId;

    saveParticipantToken(storage, eventA, "token-a");
    saveParticipantToken(storage, eventB, "token-b");

    expect(loadParticipantToken(storage, eventA)).toBe("token-a");
    expect(loadParticipantToken(storage, eventB)).toBe("token-b");
  });
});
