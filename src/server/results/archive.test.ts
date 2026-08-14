import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import type { EventId, ParticipantId, QuestionId, RankingEntry } from "../../shared/domain-types";
import { save, type JudgedAnswer } from "./archive";

async function seedEvent(eventId: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO event (id, owner_id, title, subtitle, status, created_at) VALUES (?, 'owner-1', 'T', '', 'live', 1)",
  )
    .bind(eventId)
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
