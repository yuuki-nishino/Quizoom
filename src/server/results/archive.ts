import { ok } from "../../shared/domain-types";
import type { EventId, ParticipantId, QuestionId, RankingEntry, Result, ResultId } from "../../shared/domain-types";
import type { Env } from "../env";

export type ArchiveError =
  | { readonly code: "NOT_FOUND" }
  | { readonly code: "FORBIDDEN" }
  | { readonly code: "NOT_FINALIZED" }
  | { readonly code: "SHARING_DISABLED" };

export interface JudgedAnswer {
  readonly participantId: ParticipantId;
  readonly questionId: QuestionId;
  readonly isCorrect: boolean;
  readonly elapsedMs: number;
}

function newId(): string {
  return crypto.randomUUID();
}

export async function save(
  env: Env,
  eventId: EventId,
  ranking: readonly RankingEntry[],
  answers: readonly JudgedAnswer[],
): Promise<Result<ResultId, ArchiveError>> {
  const existing = await env.DB.prepare("SELECT id FROM result WHERE event_id = ?").bind(eventId).first<{ id: string }>();
  if (existing) return ok(existing.id as ResultId);

  const resultId = newId();
  const statements = [
    env.DB.prepare("INSERT INTO result (id, event_id, finalized_at) VALUES (?, ?, ?)").bind(resultId, eventId, Date.now()),
  ];

  const entryIdByParticipant = new Map<ParticipantId, string>();
  for (const entry of ranking) {
    const entryId = newId();
    entryIdByParticipant.set(entry.participantId, entryId);
    statements.push(
      env.DB.prepare(
        "INSERT INTO result_entry (id, result_id, nickname, rank, correct_count, total_elapsed_ms, joined_seq) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(entryId, resultId, entry.nickname, entry.rank, entry.correctCount, entry.totalElapsedMs, entry.joinedSeq),
    );
  }

  for (const answer of answers) {
    const entryId = entryIdByParticipant.get(answer.participantId);
    if (!entryId) continue;
    statements.push(
      env.DB.prepare(
        "INSERT INTO result_answer (result_entry_id, question_id, is_correct, elapsed_ms) VALUES (?, ?, ?, ?)",
      ).bind(entryId, answer.questionId, answer.isCorrect ? 1 : 0, answer.elapsedMs),
    );
  }

  await env.DB.batch(statements);
  return ok(resultId as ResultId);
}
