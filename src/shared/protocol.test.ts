import { describe, it, expect } from "vitest";
import { clientCommandSchema, hostCommandSchema, type ServerEvent } from "./protocol";

describe("clientCommandSchema", () => {
  it("accepts a valid host command", () => {
    const result = clientCommandSchema.safeParse({ type: "openQuestion" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid submitAnswer command and coerces ids", () => {
    const result = clientCommandSchema.safeParse({
      type: "submitAnswer",
      questionId: "q1",
      optionId: "o1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown command type", () => {
    const result = clientCommandSchema.safeParse({ type: "hackTheMainframe" });
    expect(result.success).toBe(false);
  });

  it("rejects submitAnswer missing required fields", () => {
    const result = clientCommandSchema.safeParse({ type: "submitAnswer" });
    expect(result.success).toBe(false);
  });

  it("rejects submitAnswer and resync from the host-only schema", () => {
    expect(hostCommandSchema.safeParse({ type: "submitAnswer", questionId: "q1", optionId: "o1" }).success).toBe(false);
    expect(hostCommandSchema.safeParse({ type: "resync" }).success).toBe(false);
  });

  it("accepts advanceFinalReveal as a host command（要件15.3, Issue #16フォローアップ）", () => {
    expect(hostCommandSchema.safeParse({ type: "advanceFinalReveal" }).success).toBe(true);
  });
});

describe("ServerEvent type", () => {
  it("is usable as a single source of truth via an exhaustive switch", () => {
    function describe(event: ServerEvent): string {
      switch (event.type) {
        case "stateSnapshot":
          return "snapshot";
        case "participantJoined":
          return "joined";
        case "questionOpened":
          return "opened";
        case "progressUpdated":
          return "progress";
        case "answerAccepted":
          return "accepted";
        case "questionClosed":
          return "closed";
        case "rankingUpdated":
          return "ranking";
        case "personalRank":
          return "personal";
        case "themeUpdated":
          return "theme";
        case "commandRejected":
          return "rejected";
      }
    }

    const event: ServerEvent = { type: "commandRejected", payload: { code: "INVALID_PHASE", message: "" } };
    expect(describe(event)).toBe("rejected");
  });
});
