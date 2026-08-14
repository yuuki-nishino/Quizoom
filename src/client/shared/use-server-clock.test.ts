import { describe, it, expect } from "vitest";
import { createServerClock } from "./use-server-clock";

describe("createServerClock", () => {
  it("returns the raw remaining time when the device clock matches the server clock", () => {
    let deviceNow = 1_000;
    const clock = createServerClock(() => deviceNow);

    clock.sync(1_000, 1_000);
    deviceNow = 3_000;

    expect(clock.remainingMs(5_000)).toBe(2_000);
  });

  it("compensates for a device clock that is skewed ahead of the server", () => {
    // 端末時計はサーバーより10秒進んでいる
    const skewMs = 10_000;
    let deviceNow = 1_000 + skewMs;
    const clock = createServerClock(() => deviceNow);

    clock.sync(1_000, deviceNow);
    deviceNow = 3_000 + skewMs;

    expect(clock.remainingMs(5_000)).toBe(2_000);
  });

  it("compensates for a device clock that is skewed behind the server", () => {
    const skewMs = -7_000;
    let deviceNow = 1_000 + skewMs;
    const clock = createServerClock(() => deviceNow);

    clock.sync(1_000, deviceNow);
    deviceNow = 4_500 + skewMs;

    expect(clock.remainingMs(5_000)).toBe(500);
  });

  it("clamps remaining time to zero once the deadline has passed", () => {
    let deviceNow = 0;
    const clock = createServerClock(() => deviceNow);

    clock.sync(0, 0);
    deviceNow = 10_000;

    expect(clock.remainingMs(5_000)).toBe(0);
  });

  it("re-syncing updates the offset used by subsequent remainingMs calls", () => {
    let deviceNow = 0;
    const clock = createServerClock(() => deviceNow);

    clock.sync(0, 0);
    clock.sync(2_000, 0);
    deviceNow = 1_000;

    expect(clock.remainingMs(10_000)).toBe(7_000);
  });
});
