import { describe, it, expect, vi } from "vitest";
import { createConfirmController } from "./confirm-controller";

describe("createConfirmController", () => {
  it("starts with no pending target", () => {
    const controller = createConfirmController(() => {});
    expect(controller.target).toBeNull();
  });

  it("does not invoke onConfirm when the request is cancelled", () => {
    const onConfirm = vi.fn();
    const controller = createConfirmController(onConfirm);

    controller.request("event-1");
    expect(controller.target).toBe("event-1");

    controller.cancel();
    expect(controller.target).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("invokes onConfirm with the requested target only after confirm()", () => {
    const onConfirm = vi.fn();
    const controller = createConfirmController(onConfirm);

    controller.request("event-1");
    expect(onConfirm).not.toHaveBeenCalled();

    controller.confirm();
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("event-1");
    expect(controller.target).toBeNull();
  });

  it("does nothing when confirm() is called with no pending request", () => {
    const onConfirm = vi.fn();
    const controller = createConfirmController(onConfirm);

    controller.confirm();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("replacing the target before confirming only confirms the latest target", () => {
    const onConfirm = vi.fn();
    const controller = createConfirmController(onConfirm);

    controller.request("event-1");
    controller.request("event-2");
    controller.confirm();

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("event-2");
  });
});
