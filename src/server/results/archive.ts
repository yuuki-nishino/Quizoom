import { err, ok } from "../../shared/domain-types";
import type { EventId, ParticipantId, PublicResult, QuestionId, RankingEntry, Result, ResultId } from "../../shared/domain-types";
import type { Env } from "../env";
import { DEFAULT_THEME } from "../catalog/repository";

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

export interface ArchivedResultAnswer {
  readonly questionId: QuestionId;
  readonly isCorrect: boolean;
  readonly elapsedMs: number;
}

export interface ArchivedResultEntry {
  readonly nickname: string;
  readonly rank: number;
  readonly correctCount: number;
  readonly totalElapsedMs: number;
  readonly answers: readonly ArchivedResultAnswer[];
}

export interface ArchivedResult {
  readonly finalizedAt: number;
  readonly shareCode: string | null;
  readonly entries: readonly ArchivedResultEntry[];
}

function newId(): string {
  return crypto.randomUUID();
}

async function requireOwnedEvent(env: Env, eventId: EventId, ownerId: string): Promise<Result<true, ArchiveError>> {
  const row = await env.DB.prepare("SELECT owner_id FROM event WHERE id = ?").bind(eventId).first<{ owner_id: string }>();
  if (!row) return err({ code: "NOT_FOUND" });
  if (row.owner_id !== ownerId) return err({ code: "FORBIDDEN" });
  return ok(true);
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

export async function findForOwner(env: Env, eventId: EventId, ownerId: string): Promise<Result<ArchivedResult, ArchiveError>> {
  const owned = await requireOwnedEvent(env, eventId, ownerId);
  if (!owned.ok) return owned;

  const resultRow = await env.DB.prepare("SELECT id, finalized_at, share_code FROM result WHERE event_id = ?")
    .bind(eventId)
    .first<{ id: string; finalized_at: number; share_code: string | null }>();
  if (!resultRow) return err({ code: "NOT_FOUND" });

  const { results: entryRows } = await env.DB.prepare(
    "SELECT id, nickname, rank, correct_count, total_elapsed_ms FROM result_entry WHERE result_id = ? ORDER BY rank ASC",
  )
    .bind(resultRow.id)
    .all<{ id: string; nickname: string; rank: number; correct_count: number; total_elapsed_ms: number }>();

  const { results: answerRows } = await env.DB.prepare(
    "SELECT result_entry_id, question_id, is_correct, elapsed_ms FROM result_answer WHERE result_entry_id IN (SELECT id FROM result_entry WHERE result_id = ?)",
  )
    .bind(resultRow.id)
    .all<{ result_entry_id: string; question_id: string; is_correct: number; elapsed_ms: number }>();

  const entries: readonly ArchivedResultEntry[] = entryRows.map((row) => ({
    nickname: row.nickname,
    rank: row.rank,
    correctCount: row.correct_count,
    totalElapsedMs: row.total_elapsed_ms,
    answers: answerRows
      .filter((a) => a.result_entry_id === row.id)
      .map((a) => ({ questionId: a.question_id as QuestionId, isCorrect: a.is_correct === 1, elapsedMs: a.elapsed_ms })),
  }));

  return ok({ finalizedAt: resultRow.finalized_at, shareCode: resultRow.share_code, entries });
}

/** 参加者情報・回答履歴・共有設定を全て削除する。復元不能（要件10.3）で、result 行ごと削除するため共有も同時に無効化される */
export async function deleteParticipantData(env: Env, eventId: EventId, ownerId: string): Promise<Result<void, ArchiveError>> {
  const owned = await requireOwnedEvent(env, eventId, ownerId);
  if (!owned.ok) return owned;

  await env.DB.prepare("DELETE FROM result WHERE event_id = ?").bind(eventId).run();
  return ok(undefined);
}

/** 推測困難な識別子を join_code とは独立に採番する */
function randomShareCode(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function enableSharing(env: Env, eventId: EventId, ownerId: string): Promise<Result<{ shareCode: string }, ArchiveError>> {
  const owned = await requireOwnedEvent(env, eventId, ownerId);
  if (!owned.ok) return owned;

  const resultRow = await env.DB.prepare("SELECT id, share_code FROM result WHERE event_id = ?")
    .bind(eventId)
    .first<{ id: string; share_code: string | null }>();
  if (!resultRow) return err({ code: "NOT_FINALIZED" });

  // 再有効化時は既発行のコードを再利用する（共有URLを主催者が使い回せるようにするため）
  const shareCode = resultRow.share_code ?? randomShareCode();
  await env.DB.prepare("UPDATE result SET share_code = ?, share_enabled = 1 WHERE id = ?").bind(shareCode, resultRow.id).run();
  return ok({ shareCode });
}

export async function disableSharing(env: Env, eventId: EventId, ownerId: string): Promise<Result<void, ArchiveError>> {
  const owned = await requireOwnedEvent(env, eventId, ownerId);
  if (!owned.ok) return owned;

  // share_code は値を残したまま share_enabled のみ落とす。旧URLへのアクセスを
  // 「存在しない」（404）ではなく「無効化済み」（410）として区別できるようにするため
  await env.DB.prepare("UPDATE result SET share_enabled = 0 WHERE event_id = ?").bind(eventId).run();
  return ok(undefined);
}

interface PublicResultRow {
  readonly id: string;
  readonly finalized_at: number;
  readonly share_enabled: number;
  readonly event_title: string;
  readonly primary_color: string | null;
  readonly accent_color: string | null;
  readonly background_color: string | null;
  readonly text_color: string | null;
}

export async function findPublicByShareCode(env: Env, shareCode: string): Promise<Result<PublicResult, ArchiveError>> {
  const row = await env.DB.prepare(
    `SELECT r.id, r.finalized_at, r.share_enabled, e.title AS event_title,
            t.primary_color, t.accent_color, t.background_color, t.text_color
     FROM result r
     JOIN event e ON e.id = r.event_id
     LEFT JOIN theme t ON t.event_id = e.id
     WHERE r.share_code = ?`,
  )
    .bind(shareCode)
    .first<PublicResultRow>();
  if (!row) return err({ code: "NOT_FOUND" });
  if (row.share_enabled !== 1) return err({ code: "SHARING_DISABLED" });

  const { results: entryRows } = await env.DB.prepare(
    "SELECT nickname, rank, correct_count, total_elapsed_ms FROM result_entry WHERE result_id = ? ORDER BY rank ASC",
  )
    .bind(row.id)
    .all<{ nickname: string; rank: number; correct_count: number; total_elapsed_ms: number }>();

  return ok({
    eventTitle: row.event_title,
    theme: {
      primaryColor: row.primary_color ?? DEFAULT_THEME.primaryColor,
      accentColor: row.accent_color ?? DEFAULT_THEME.accentColor,
      backgroundColor: row.background_color ?? DEFAULT_THEME.backgroundColor,
      textColor: row.text_color ?? DEFAULT_THEME.textColor,
    },
    finalizedAt: row.finalized_at,
    entries: entryRows.map((e) => ({
      rank: e.rank,
      nickname: e.nickname,
      correctCount: e.correct_count,
      totalElapsedMs: e.total_elapsed_ms,
    })),
  });
}
