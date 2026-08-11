import type { AnswerRecord, Participant, ParticipantScore, OptionId, QuestionSnapshot, RankingEntry } from "./domain-types";

export function judge(answer: AnswerRecord, correctOptionId: OptionId): { readonly isCorrect: boolean } {
  return { isCorrect: answer.selectedOptionId === correctOptionId };
}

export function aggregate(
  participants: readonly Participant[],
  answers: readonly AnswerRecord[],
  questions: readonly QuestionSnapshot[],
): readonly ParticipantScore[] {
  const correctOptionByQuestion = new Map(questions.map((q) => [q.id, q.correctOptionId]));

  return participants.map((participant) => {
    let correctCount = 0;
    let totalElapsedMs = 0;

    for (const answer of answers) {
      if (answer.participantId !== participant.id) continue;
      const correctOptionId = correctOptionByQuestion.get(answer.questionId);
      if (correctOptionId === undefined || !judge(answer, correctOptionId).isCorrect) continue;
      correctCount += 1;
      totalElapsedMs += answer.elapsedMs;
    }

    return {
      participantId: participant.id,
      nickname: participant.nickname,
      correctCount,
      totalElapsedMs,
      joinedSeq: participant.joinedSeq,
    };
  });
}

export function rank(scores: readonly ParticipantScore[]): readonly RankingEntry[] {
  return [...scores]
    .sort((a, b) => {
      if (a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
      if (a.totalElapsedMs !== b.totalElapsedMs) return a.totalElapsedMs - b.totalElapsedMs;
      return a.joinedSeq - b.joinedSeq;
    })
    .map((score, index) => ({ ...score, rank: index + 1 }));
}
