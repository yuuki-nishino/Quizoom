import { describe, it, expect } from "vitest";
import { judge, aggregate, rank } from "./scoring";
import type {
  AnswerRecord,
  OptionId,
  Participant,
  ParticipantId,
  ParticipantScore,
  QuestionId,
  QuestionSnapshot,
} from "./domain-types";

function question(id: string, orderIndex: number, correctOptionId: string): QuestionSnapshot {
  return {
    id: id as QuestionId,
    orderIndex,
    body: `question ${id}`,
    imageAssetId: null,
    timeLimitSec: 30,
    explanation: "",
    options: [
      { id: "a" as OptionId, label: "A", orderIndex: 0 },
      { id: "b" as OptionId, label: "B", orderIndex: 1 },
    ],
    correctOptionId: correctOptionId as OptionId,
  };
}

function participant(id: string, nickname: string, joinedSeq: number): Participant {
  return { id: id as ParticipantId, nickname, joinedSeq, joinedAt: 0 };
}

function answer(participantId: string, questionId: string, selectedOptionId: string, elapsedMs: number): AnswerRecord {
  return {
    participantId: participantId as ParticipantId,
    questionId: questionId as QuestionId,
    selectedOptionId: selectedOptionId as OptionId,
    elapsedMs,
  };
}

describe("judge", () => {
  it("returns isCorrect true when the selected option matches the correct option", () => {
    const result = judge(answer("p1", "q1", "a", 1000), "a" as OptionId);
    expect(result.isCorrect).toBe(true);
  });

  it("returns isCorrect false when the selected option does not match", () => {
    const result = judge(answer("p1", "q1", "b", 1000), "a" as OptionId);
    expect(result.isCorrect).toBe(false);
  });
});

describe("aggregate", () => {
  it("counts correct answers and sums elapsed time only for correct answers", () => {
    const questions = [question("q1", 0, "a"), question("q2", 1, "a")];
    const participants = [participant("p1", "Alice", 0)];
    const answers = [
      answer("p1", "q1", "a", 1000), // correct
      answer("p1", "q2", "b", 2000), // incorrect
    ];

    const [score] = aggregate(participants, answers, questions);

    expect(score).toEqual<ParticipantScore>({
      participantId: "p1" as ParticipantId,
      nickname: "Alice",
      correctCount: 1,
      totalElapsedMs: 1000,
      joinedSeq: 0,
    });
  });

  it("treats an unanswered question as contributing nothing, without special-casing", () => {
    // p1 joined before q1 closed; p2 joined mid-event and has no answer for q1 at all.
    const questions = [question("q1", 0, "a"), question("q2", 1, "a")];
    const participants = [participant("p1", "Alice", 0), participant("p2", "Bob", 1)];
    const answers = [
      answer("p1", "q1", "a", 1000),
      answer("p1", "q2", "a", 1000),
      answer("p2", "q2", "a", 500), // p2 has no answer for q1
    ];

    const scores = aggregate(participants, answers, questions);

    expect(scores).toEqual<readonly ParticipantScore[]>([
      { participantId: "p1" as ParticipantId, nickname: "Alice", correctCount: 2, totalElapsedMs: 2000, joinedSeq: 0 },
      { participantId: "p2" as ParticipantId, nickname: "Bob", correctCount: 1, totalElapsedMs: 500, joinedSeq: 1 },
    ]);
  });
});

describe("rank", () => {
  it("orders by correctCount desc, then totalElapsedMs asc, then joinedSeq asc", () => {
    const scores: readonly ParticipantScore[] = [
      { participantId: "p1" as ParticipantId, nickname: "A", correctCount: 2, totalElapsedMs: 5000, joinedSeq: 0 },
      { participantId: "p2" as ParticipantId, nickname: "B", correctCount: 3, totalElapsedMs: 9000, joinedSeq: 1 },
      { participantId: "p3" as ParticipantId, nickname: "C", correctCount: 2, totalElapsedMs: 3000, joinedSeq: 2 },
    ];

    const entries = rank(scores);

    expect(entries.map((e) => e.participantId)).toEqual(["p2", "p3", "p1"]);
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it("never produces duplicate ranks even when correctCount and totalElapsedMs tie completely", () => {
    const base: readonly ParticipantScore[] = Array.from({ length: 6 }, (_, i) => ({
      participantId: `p${i}` as ParticipantId,
      nickname: `n${i}`,
      correctCount: 4,
      totalElapsedMs: 12000,
      joinedSeq: i,
    }));

    for (let trial = 0; trial < 20; trial += 1) {
      const shuffled = [...base].sort(() => Math.random() - 0.5);
      const entries = rank(shuffled);

      const ranks = entries.map((e) => e.rank);
      expect(new Set(ranks).size).toBe(ranks.length);
      expect(ranks).toEqual([1, 2, 3, 4, 5, 6]);
      // earlier joinedSeq wins on a full tie
      expect(entries.map((e) => e.joinedSeq)).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it("keeps the mid-joiner ranked among others under the same criteria", () => {
    const scores: readonly ParticipantScore[] = [
      { participantId: "early" as ParticipantId, nickname: "Early", correctCount: 1, totalElapsedMs: 1000, joinedSeq: 0 },
      { participantId: "mid" as ParticipantId, nickname: "Mid", correctCount: 1, totalElapsedMs: 1000, joinedSeq: 5 },
    ];

    const entries = rank(scores);

    expect(entries.map((e) => e.participantId)).toEqual(["early", "mid"]);
  });
});
