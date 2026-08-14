import { useEffect, useReducer, useRef } from "react";

export interface ServerClock {
  /** サーバーが送信した時刻 `serverNow` と、それを受信した時点の端末時刻 `receivedAt` からオフセットを補正する */
  sync(serverNow: number, receivedAt: number): void;
  /** 端末時計に依存せず、サーバー基準での `deadlineAt` までの残り時間をミリ秒で返す。表示専用で採点には使わない */
  remainingMs(deadlineAt: number): number;
}

export function createServerClock(now: () => number = () => Date.now()): ServerClock {
  let offsetMs = 0;

  return {
    sync(serverNow, receivedAt) {
      offsetMs = serverNow - receivedAt;
    },
    remainingMs(deadlineAt) {
      const estimatedServerNow = now() + offsetMs;
      return Math.max(0, deadlineAt - estimatedServerNow);
    },
  };
}

/** コンポーネントのライフタイム内で同一の ServerClock インスタンスを保つ */
export function useServerClock(): ServerClock {
  const ref = useRef<ServerClock | null>(null);
  if (!ref.current) {
    ref.current = createServerClock();
  }
  return ref.current;
}

/**
 * `deadlineAt` までの残り時間を一定間隔で再計算し、再レンダリングを発生させる。
 * `deadlineAt` が null の間はタイマーを起動しない。
 */
export function useRemainingMs(clock: ServerClock, deadlineAt: number | null, tickMs = 200): number | null {
  const [, forceTick] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (deadlineAt === null) return;
    const id = setInterval(forceTick, tickMs);
    return () => clearInterval(id);
  }, [deadlineAt, tickMs]);

  return deadlineAt === null ? null : clock.remainingMs(deadlineAt);
}
