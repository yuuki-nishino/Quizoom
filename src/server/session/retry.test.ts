import { describe, it, expect, vi } from "vitest";
import { retryAsync } from "./retry";

describe("retryAsync", () => {
  it("returns without retrying when the first attempt succeeds", async () => {
    const attempt = vi.fn().mockResolvedValue(undefined);
    await retryAsync(attempt, 3);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries after a transient failure and succeeds once the underlying operation recovers", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient D1 failure"))
      .mockResolvedValueOnce(undefined);

    await retryAsync(attempt, 3);

    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("gives up silently (does not throw) after exhausting all attempts", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("persistent D1 failure"));

    await expect(retryAsync(attempt, 3)).resolves.toBeUndefined();
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("defaults to 3 attempts when not specified", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("fail"));
    await retryAsync(attempt);
    expect(attempt).toHaveBeenCalledTimes(3);
  });
});
