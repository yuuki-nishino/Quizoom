import { err, ok } from "../../shared/domain-types";
import type {
  AnswerOutcome,
  AnswerRecord,
  EventMeta,
  JoinRejection,
  LivePhase,
  Participant,
  ParticipantId,
  QuestionId,
  QuestionSnapshot,
  Result,
  SessionState,
} from "../../shared/domain-types";

export interface LiveStore {
  load(): SessionState | null;
  initialize(meta: EventMeta): void;
  savePhase(phase: LivePhase): void;
  saveEventMeta(meta: EventMeta): void;
  freezeQuestionSnapshot(questions: readonly QuestionSnapshot[], startedAt: number): void;

  addParticipant(nickname: string, now: number): Result<Participant, JoinRejection>;
  listParticipants(): readonly Participant[];
  findParticipant(participantId: ParticipantId): Participant | null;

  recordAnswer(input: AnswerRecord): AnswerOutcome;
  listAnswers(questionId: QuestionId): readonly AnswerRecord[];
  listAllAnswers(): readonly AnswerRecord[];
  discardAnswers(questionId: QuestionId): void;
}

interface SessionStateRow extends Record<string, SqlStorageValue> {
  readonly phase_json: string;
  readonly event_meta_json: string;
  readonly question_snapshot_json: string | null;
  readonly started_at: number | null;
}

interface ParticipantRow extends Record<string, SqlStorageValue> {
  readonly id: string;
  readonly nickname: string;
  readonly joined_seq: number;
  readonly joined_at: number;
}

interface AnswerRow extends Record<string, SqlStorageValue> {
  readonly participant_id: string;
  readonly question_id: string;
  readonly option_id: string;
  readonly elapsed_ms: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS session_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  phase_json TEXT NOT NULL,
  event_meta_json TEXT NOT NULL,
  question_snapshot_json TEXT,
  started_at INTEGER
);

CREATE TABLE IF NOT EXISTS participant (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE,
  joined_seq INTEGER NOT NULL,
  joined_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS answer (
  participant_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  is_correct INTEGER,
  PRIMARY KEY (participant_id, question_id)
);
`;

export function createLiveStore(sql: SqlStorage): LiveStore {
  sql.exec(SCHEMA);

  return {
    load(): SessionState | null {
      const row = sql.exec<SessionStateRow>("SELECT * FROM session_state WHERE id = 1").toArray()[0];
      if (!row) return null;
      return {
        phase: JSON.parse(row.phase_json) as LivePhase,
        eventMeta: JSON.parse(row.event_meta_json) as EventMeta,
        questions: row.question_snapshot_json ? (JSON.parse(row.question_snapshot_json) as QuestionSnapshot[]) : null,
        startedAt: row.started_at,
      };
    },

    initialize(meta: EventMeta): void {
      const phase: LivePhase = { kind: "lobby" };
      sql.exec(
        "INSERT OR REPLACE INTO session_state (id, phase_json, event_meta_json, question_snapshot_json, started_at) VALUES (1, ?, ?, NULL, NULL)",
        JSON.stringify(phase),
        JSON.stringify(meta),
      );
    },

    savePhase(phase: LivePhase): void {
      sql.exec("UPDATE session_state SET phase_json = ? WHERE id = 1", JSON.stringify(phase));
    },

    saveEventMeta(meta: EventMeta): void {
      sql.exec("UPDATE session_state SET event_meta_json = ? WHERE id = 1", JSON.stringify(meta));
    },

    freezeQuestionSnapshot(questions: readonly QuestionSnapshot[], startedAt: number): void {
      const row = sql.exec<SessionStateRow>("SELECT question_snapshot_json FROM session_state WHERE id = 1").toArray()[0];
      if (row?.question_snapshot_json != null) {
        throw new Error("question snapshot is already frozen");
      }
      sql.exec(
        "UPDATE session_state SET question_snapshot_json = ?, started_at = ? WHERE id = 1",
        JSON.stringify(questions),
        startedAt,
      );
    },

    addParticipant(nickname: string, now: number): Result<Participant, JoinRejection> {
      const existing = sql.exec("SELECT 1 FROM participant WHERE nickname = ?", nickname).toArray();
      if (existing.length > 0) return err({ code: "NICKNAME_TAKEN" });

      const nextSeqRow = sql
        .exec<Record<string, SqlStorageValue> & { next_seq: number }>(
          "SELECT COALESCE(MAX(joined_seq), 0) + 1 AS next_seq FROM participant",
        )
        .one();
      const id = crypto.randomUUID() as ParticipantId;
      const joinedSeq = nextSeqRow.next_seq;

      sql.exec(
        "INSERT INTO participant (id, nickname, joined_seq, joined_at) VALUES (?, ?, ?, ?)",
        id,
        nickname,
        joinedSeq,
        now,
      );

      return ok({ id, nickname, joinedSeq, joinedAt: now });
    },

    listParticipants(): readonly Participant[] {
      return sql
        .exec<ParticipantRow>("SELECT * FROM participant ORDER BY joined_seq ASC")
        .toArray()
        .map(rowToParticipant);
    },

    findParticipant(participantId: ParticipantId): Participant | null {
      const row = sql.exec<ParticipantRow>("SELECT * FROM participant WHERE id = ?", participantId).toArray()[0];
      return row ? rowToParticipant(row) : null;
    },

    recordAnswer(input: AnswerRecord): AnswerOutcome {
      const existing = sql
        .exec<AnswerRow>(
          "SELECT * FROM answer WHERE participant_id = ? AND question_id = ?",
          input.participantId,
          input.questionId,
        )
        .toArray()[0];
      if (existing) {
        return { kind: "alreadyAnswered", existing: rowToAnswerRecord(existing) };
      }

      sql.exec(
        "INSERT INTO answer (participant_id, question_id, option_id, elapsed_ms) VALUES (?, ?, ?, ?)",
        input.participantId,
        input.questionId,
        input.selectedOptionId,
        input.elapsedMs,
      );

      return { kind: "recorded", record: input };
    },

    listAnswers(questionId: QuestionId): readonly AnswerRecord[] {
      return sql
        .exec<AnswerRow>("SELECT * FROM answer WHERE question_id = ?", questionId)
        .toArray()
        .map(rowToAnswerRecord);
    },

    listAllAnswers(): readonly AnswerRecord[] {
      return sql.exec<AnswerRow>("SELECT * FROM answer").toArray().map(rowToAnswerRecord);
    },

    discardAnswers(questionId: QuestionId): void {
      sql.exec("DELETE FROM answer WHERE question_id = ?", questionId);
    },
  };
}

function rowToParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id as ParticipantId,
    nickname: row.nickname,
    joinedSeq: row.joined_seq,
    joinedAt: row.joined_at,
  };
}

function rowToAnswerRecord(row: AnswerRow): AnswerRecord {
  return {
    participantId: row.participant_id as ParticipantId,
    questionId: row.question_id as QuestionId,
    selectedOptionId: row.option_id as AnswerRecord["selectedOptionId"],
    elapsedMs: row.elapsed_ms,
  };
}
