import type { HostCommand } from "../../shared/protocol";
import { PRACTICE_QUESTION_ID, resolveQuestion } from "../../shared/practice-question";
import {
  err,
  ok,
  type AlarmIntent,
  type LivePhase,
  type QuestionId,
  type QuestionSnapshot,
  type Result,
  type TransitionError,
} from "../../shared/domain-types";

export interface Transition {
  readonly phase: LivePhase;
  readonly alarm: AlarmIntent;
}

interface PhaseContext {
  readonly now: number;
  readonly questions: readonly QuestionSnapshot[];
  /** テスト問題モードの有効/無効（要件3.1, 3.8）。lobby→ready遷移でのみ参照する */
  readonly practiceEnabled: boolean;
}

function sortedByOrder(questions: readonly QuestionSnapshot[]): readonly QuestionSnapshot[] {
  return [...questions].sort((a, b) => a.orderIndex - b.orderIndex);
}

function findNextQuestionId(questions: readonly QuestionSnapshot[], currentQuestionId: QuestionId): QuestionId | null {
  const sorted = sortedByOrder(questions);
  const currentIndex = sorted.findIndex((q) => q.id === currentQuestionId);
  return sorted[currentIndex + 1]?.id ?? null;
}

function invalid(current: LivePhase, command: HostCommand): Result<Transition, TransitionError> {
  return err({ code: "INVALID_PHASE", current: current.kind, command: command.type });
}

export function next(current: LivePhase, command: HostCommand, context: PhaseContext): Result<Transition, TransitionError> {
  switch (current.kind) {
    case "lobby": {
      if (command.type !== "startSession") return invalid(current, command);
      const sorted = sortedByOrder(context.questions);
      const firstRealQuestionId = sorted[0]?.id ?? null;
      // テスト問題モードが有効なら、本編最初の設問の前にテスト問題を挟む（要件3.1, 3.8）
      const nextQuestionId = context.practiceEnabled ? PRACTICE_QUESTION_ID : firstRealQuestionId;
      return ok({ phase: { kind: "ready", nextQuestionId }, alarm: { kind: "noop" } });
    }

    case "ready": {
      if (command.type !== "openQuestion") return invalid(current, command);
      if (current.nextQuestionId === null) return err({ code: "NO_NEXT_QUESTION" });
      const question = resolveQuestion(current.nextQuestionId, context.questions);
      const openedAt = context.now;
      const deadlineAt = openedAt + question.timeLimitSec * 1000;
      return ok({
        phase: { kind: "questionOpen", questionId: question.id, openedAt, deadlineAt },
        alarm: { kind: "set", at: deadlineAt },
      });
    }

    case "questionOpen": {
      if (command.type === "closeQuestion") {
        return ok({
          phase: { kind: "questionClosed", questionId: current.questionId, openedAt: current.openedAt },
          alarm: { kind: "clear" },
        });
      }
      if (command.type === "pause") {
        const remainingMs = Math.max(0, current.deadlineAt - context.now);
        return ok({ phase: { kind: "paused", resumeTo: current, remainingMs }, alarm: { kind: "clear" } });
      }
      return invalid(current, command);
    }

    case "paused": {
      if (command.type !== "resume") return invalid(current, command);
      if (current.resumeTo.kind !== "questionOpen") return invalid(current, command);
      const deadlineAt = context.now + current.remainingMs;
      return ok({
        phase: {
          kind: "questionOpen",
          questionId: current.resumeTo.questionId,
          openedAt: current.resumeTo.openedAt,
          deadlineAt,
        },
        alarm: { kind: "set", at: deadlineAt },
      });
    }

    case "questionClosed": {
      if (command.type === "revealAnswer") {
        return ok({ phase: { kind: "revealed", questionId: current.questionId }, alarm: { kind: "noop" } });
      }
      if (command.type === "reopenQuestion") {
        const question = resolveQuestion(current.questionId, context.questions);
        const deadlineAt = context.now + question.timeLimitSec * 1000;
        return ok({
          phase: { kind: "questionOpen", questionId: current.questionId, openedAt: current.openedAt, deadlineAt },
          alarm: { kind: "set", at: deadlineAt },
        });
      }
      return invalid(current, command);
    }

    case "revealed": {
      if (command.type === "reopenQuestion") return err({ code: "ALREADY_REVEALED" });
      if (command.type === "nextQuestion") {
        // テスト問題の正解発表後は、次の実設問探索ではなく本編最初の設問へ明示的に進める（要件3.7）
        const nextQuestionId =
          current.questionId === PRACTICE_QUESTION_ID
            ? (sortedByOrder(context.questions)[0]?.id ?? null)
            : findNextQuestionId(context.questions, current.questionId);
        if (nextQuestionId === null) return err({ code: "NO_NEXT_QUESTION" });
        return ok({ phase: { kind: "ready", nextQuestionId }, alarm: { kind: "noop" } });
      }
      if (command.type === "showRanking") {
        const nextQuestionId = findNextQuestionId(context.questions, current.questionId);
        return ok({ phase: { kind: "interimRanking", nextQuestionId }, alarm: { kind: "noop" } });
      }
      if (command.type === "finalize") {
        return ok({ phase: { kind: "finalRanking" }, alarm: { kind: "clear" } });
      }
      return invalid(current, command);
    }

    case "interimRanking": {
      if (command.type === "nextQuestion") {
        if (current.nextQuestionId === null) return err({ code: "NO_NEXT_QUESTION" });
        return ok({ phase: { kind: "ready", nextQuestionId: current.nextQuestionId }, alarm: { kind: "noop" } });
      }
      if (command.type === "finalize") {
        return ok({ phase: { kind: "finalRanking" }, alarm: { kind: "clear" } });
      }
      return invalid(current, command);
    }

    case "finalRanking":
      return invalid(current, command);
  }
}
