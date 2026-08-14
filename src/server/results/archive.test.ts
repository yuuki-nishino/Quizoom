import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import type { EventId, ParticipantId, QuestionId, RankingEntry } from "../../shared/domain-types";
import { save, findForOwner, deleteParticipantData, enableSharing, disableSharing, findPublicByShareCode, type JudgedAnswer } from "./archive";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM event;");
});

async function seedEvent(eventId: string, ownerId = "owner-1"): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO event (id, owner_id, title, subtitle, status, created_at) VALUES (?, ?, 'T', '', 'live', 1)",
  )
    .bind(eventId, ownerId)
    .run();
}

const ranking: readonly RankingEntry[] = [
  { participantId: "p1" as ParticipantId, nickname: "alice", correctCount: 1, totalElapsedMs: 500, joinedSeq: 1, rank: 1 },
];

const answers: readonly JudgedAnswer[] = [
  { participantId: "p1" as ParticipantId, questionId: "q1" as QuestionId, isCorrect: true, elapsedMs: 500 },
];

describe("ResultArchive.save", () => {
  it("writes the result row, ranking entries, and per-question answers", async () => {
    await seedEvent("event-1");

    const result = await save(env, "event-1" as EventId, ranking, answers);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const entry = await env.DB.prepare("SELECT id, nickname, rank, correct_count FROM result_entry WHERE result_id = ?")
      .bind(result.value)
      .first<{ id: string; nickname: string; rank: number; correct_count: number }>();
    expect(entry).toMatchObject({ nickname: "alice", rank: 1, correct_count: 1 });

    const answerRow = await env.DB.prepare("SELECT question_id, is_correct, elapsed_ms FROM result_answer WHERE result_entry_id = ?")
      .bind(entry!.id)
      .first();
    expect(answerRow).toEqual({ question_id: "q1", is_correct: 1, elapsed_ms: 500 });
  });

  it("is idempotent: re-saving the same event returns the existing result and does not duplicate rows", async () => {
    await seedEvent("event-1");

    const first = await save(env, "event-1" as EventId, ranking, answers);
    const second = await save(env, "event-1" as EventId, ranking, answers);

    expect(second).toEqual(first);

    const count = await env.DB.prepare("SELECT COUNT(*) as n FROM result WHERE event_id = ?")
      .bind("event-1")
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });
});

describe("ResultArchive.findForOwner", () => {
  it("returns NOT_FOUND when the event has no archived result", async () => {
    await seedEvent("event-1");
    const result = await findForOwner(env, "event-1" as EventId, "owner-1");
    expect(result).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("returns FORBIDDEN for a non-owner", async () => {
    await seedEvent("event-1");
    await save(env, "event-1" as EventId, ranking, answers);

    const result = await findForOwner(env, "event-1" as EventId, "someone-else");
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("returns ranking entries with per-question answers for the owner", async () => {
    await seedEvent("event-1");
    await save(env, "event-1" as EventId, ranking, answers);

    const result = await findForOwner(env, "event-1" as EventId, "owner-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.shareCode).toBeNull();
    expect(result.value.entries).toEqual([
      {
        nickname: "alice",
        rank: 1,
        correctCount: 1,
        totalElapsedMs: 500,
        answers: [{ questionId: "q1", isCorrect: true, elapsedMs: 500 }],
      },
    ]);
  });
});

describe("ResultArchive.deleteParticipantData", () => {
  it("rejects a non-owner with FORBIDDEN", async () => {
    await seedEvent("event-1");
    await save(env, "event-1" as EventId, ranking, answers);

    const result = await deleteParticipantData(env, "event-1" as EventId, "someone-else");
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("deletes the result so findForOwner no longer returns it", async () => {
    await seedEvent("event-1");
    const saved = await save(env, "event-1" as EventId, ranking, answers);
    if (!saved.ok) throw new Error("setup failed");

    const result = await deleteParticipantData(env, "event-1" as EventId, "owner-1");
    expect(result).toEqual({ ok: true, value: undefined });

    expect(await findForOwner(env, "event-1" as EventId, "owner-1")).toEqual({ ok: false, error: { code: "NOT_FOUND" } });

    const entryCount = await env.DB.prepare("SELECT COUNT(*) as n FROM result_entry WHERE result_id = ?")
      .bind(saved.value)
      .first<{ n: number }>();
    expect(entryCount?.n).toBe(0);
  });
});

describe("ResultArchive sharing", () => {
  it("rejects enableSharing on an unfinalized event with NOT_FINALIZED", async () => {
    await seedEvent("event-1");
    const result = await enableSharing(env, "event-1" as EventId, "owner-1");
    expect(result).toEqual({ ok: false, error: { code: "NOT_FINALIZED" } });
  });

  it("rejects enableSharing from a non-owner with FORBIDDEN", async () => {
    await seedEvent("event-1");
    await save(env, "event-1" as EventId, ranking, answers);

    const result = await enableSharing(env, "event-1" as EventId, "someone-else");
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("issues a share code independent of the join code, and findPublicByShareCode returns only public fields", async () => {
    await env.DB.prepare(
      "INSERT INTO event (id, owner_id, title, subtitle, status, join_code, created_at) VALUES ('event-1', 'owner-1', 'Quiz Night', '', 'finished', 'JOIN123', 1)",
    ).run();
    await save(env, "event-1" as EventId, ranking, answers);

    const enabled = await enableSharing(env, "event-1" as EventId, "owner-1");
    expect(enabled.ok).toBe(true);
    if (!enabled.ok) return;
    expect(enabled.value.shareCode).not.toBe("JOIN123");

    const publicResult = await findPublicByShareCode(env, enabled.value.shareCode);
    expect(publicResult).toEqual({
      ok: true,
      value: {
        eventTitle: "Quiz Night",
        theme: expect.objectContaining({ primaryColor: expect.any(String) }),
        finalizedAt: expect.any(Number),
        entries: [{ rank: 1, nickname: "alice", correctCount: 1, totalElapsedMs: 500 }],
      },
    });
  });

  it("returns NOT_FOUND for a share code that was never issued", async () => {
    const result = await findPublicByShareCode(env, "no-such-code");
    expect(result).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("returns SHARING_DISABLED when querying a code after disableSharing", async () => {
    await seedEvent("event-1");
    await save(env, "event-1" as EventId, ranking, answers);
    const enabled = await enableSharing(env, "event-1" as EventId, "owner-1");
    if (!enabled.ok) throw new Error("setup failed");

    const disableResult = await disableSharing(env, "event-1" as EventId, "owner-1");
    expect(disableResult).toEqual({ ok: true, value: undefined });

    const result = await findPublicByShareCode(env, enabled.value.shareCode);
    expect(result).toEqual({ ok: false, error: { code: "SHARING_DISABLED" } });
  });
});
