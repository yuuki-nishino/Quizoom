import { describe, it, expect } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import type {
  AssetId,
  EventMeta,
  OptionId,
  ParticipantId,
  QuestionId,
  QuestionSnapshot,
} from "../../shared/domain-types";
import { createLiveStore } from "./live-store";
import type { QuizSessionDO } from "./quiz-session-do";

function newStub(): DurableObjectStub<QuizSessionDO> {
  const id = env.QUIZ_SESSION.newUniqueId();
  return env.QUIZ_SESSION.get(id);
}

const meta: EventMeta = {
  capacity: 50,
  status: "live",
  theme: {
    primaryColor: "#111111",
    accentColor: "#222222",
    backgroundColor: "#ffffff",
    textColor: "#000000",
    logoAssetId: null,
    backgroundAssetId: "asset-1" as AssetId,
    templateId: null,
  },
  practiceMode: false,
};

function question(id: string): QuestionSnapshot {
  return {
    id: id as QuestionId,
    orderIndex: 0,
    body: `question ${id}`,
    imageAssetId: null,
    timeLimitSec: 30,
    explanation: "explanation",
    options: [
      { id: "a" as OptionId, label: "A", orderIndex: 0 },
      { id: "b" as OptionId, label: "B", orderIndex: 1 },
    ],
    correctOptionId: "a" as OptionId,
  };
}

describe("LiveStore.load", () => {
  it("returns null before initialize", async () => {
    const stub = newStub();
    const loaded = await runInDurableObject(stub, (_instance, state) => createLiveStore(state.storage.sql).load());
    expect(loaded).toBeNull();
  });

  it("reconstructs the full session state from storage alone, across independent store instances", async () => {
    const stub = newStub();

    await runInDurableObject(stub, (_instance, state) => {
      createLiveStore(state.storage.sql).initialize(meta);
    });

    const loaded = await runInDurableObject(stub, (_instance, state) => createLiveStore(state.storage.sql).load());

    expect(loaded).toEqual({
      phase: { kind: "lobby" },
      eventMeta: meta,
      questions: null,
      startedAt: null,
      finalRevealStep: null,
    });
  });
});

describe("LiveStore.savePhase / saveEventMeta", () => {
  it("persists an updated phase, visible to a newly constructed store", async () => {
    const stub = newStub();

    await runInDurableObject(stub, (_instance, state) => {
      const store = createLiveStore(state.storage.sql);
      store.initialize(meta);
      store.savePhase({ kind: "ready", nextQuestionId: "q1" as QuestionId });
    });

    const loaded = await runInDurableObject(stub, (_instance, state) => createLiveStore(state.storage.sql).load());
    expect(loaded?.phase).toEqual({ kind: "ready", nextQuestionId: "q1" });
  });

  it("persists an updated event meta, visible to a newly constructed store", async () => {
    const stub = newStub();
    const updated: EventMeta = { ...meta, capacity: 100 };

    await runInDurableObject(stub, (_instance, state) => {
      const store = createLiveStore(state.storage.sql);
      store.initialize(meta);
      store.saveEventMeta(updated);
    });

    const loaded = await runInDurableObject(stub, (_instance, state) => createLiveStore(state.storage.sql).load());
    expect(loaded?.eventMeta).toEqual(updated);
  });

  it("persists the final reveal step, visible to a newly constructed store（要件15.1〜15.3, Issue #16フォローアップ）", async () => {
    const stub = newStub();

    await runInDurableObject(stub, (_instance, state) => {
      const store = createLiveStore(state.storage.sql);
      store.initialize(meta);
      store.saveFinalRevealStep(0);
      store.saveFinalRevealStep(2);
    });

    const loaded = await runInDurableObject(stub, (_instance, state) => createLiveStore(state.storage.sql).load());
    expect(loaded?.finalRevealStep).toBe(2);
  });
});

describe("LiveStore.freezeQuestionSnapshot", () => {
  it("freezes the question snapshot and startedAt exactly once", async () => {
    const stub = newStub();
    const questions = [question("q1"), question("q2")];

    const loaded = await runInDurableObject(stub, (_instance, state) => {
      const store = createLiveStore(state.storage.sql);
      store.initialize(meta);
      store.freezeQuestionSnapshot(questions, 1000);
      return store.load();
    });

    expect(loaded?.questions).toEqual(questions);
    expect(loaded?.startedAt).toBe(1000);
  });

  it("throws when called a second time, since the snapshot is already frozen", async () => {
    const stub = newStub();
    const questions = [question("q1")];

    await expect(
      runInDurableObject(stub, (_instance, state) => {
        const store = createLiveStore(state.storage.sql);
        store.initialize(meta);
        store.freezeQuestionSnapshot(questions, 1000);
        store.freezeQuestionSnapshot(questions, 2000);
      }),
    ).rejects.toThrow();
  });
});

describe("LiveStore.addParticipant / listParticipants / findParticipant", () => {
  it("registers a participant with a monotonically increasing joinedSeq", async () => {
    const result = await runInDurableObject(newStub(), (_instance, state) => {
      const store = createLiveStore(state.storage.sql);
      store.initialize(meta);
      const alice = store.addParticipant("alice", 100);
      const bob = store.addParticipant("bob", 200);
      return { alice, bob, participants: store.listParticipants() };
    });

    expect(result.alice.ok).toBe(true);
    expect(result.bob.ok).toBe(true);
    if (!result.alice.ok || !result.bob.ok) throw new Error("unreachable");
    expect(result.alice.value.joinedSeq).toBe(1);
    expect(result.bob.value.joinedSeq).toBe(2);
    expect(result.participants.map((p) => p.nickname)).toEqual(["alice", "bob"]);
  });

  it("rejects a duplicate nickname as NICKNAME_TAKEN without registering a second participant", async () => {
    const result = await runInDurableObject(newStub(), (_instance, state) => {
      const store = createLiveStore(state.storage.sql);
      store.initialize(meta);
      store.addParticipant("alice", 100);
      const second = store.addParticipant("alice", 150);
      return { second, participants: store.listParticipants() };
    });

    expect(result.second).toEqual({ ok: false, error: { code: "NICKNAME_TAKEN" } });
    expect(result.participants).toHaveLength(1);
  });

  it("finds a registered participant by id and returns null for an unknown id", async () => {
    const result = await runInDurableObject(newStub(), (_instance, state) => {
      const store = createLiveStore(state.storage.sql);
      store.initialize(meta);
      const alice = store.addParticipant("alice", 100);
      if (!alice.ok) throw new Error("unreachable");
      return {
        found: store.findParticipant(alice.value.id),
        missing: store.findParticipant("missing" as ParticipantId),
      };
    });

    expect(result.found?.nickname).toBe("alice");
    expect(result.missing).toBeNull();
  });
});

describe("LiveStore.recordAnswer / listAnswers / listAllAnswers / discardAnswers", () => {
  it("records a first answer and keeps it on a duplicate submission", async () => {
    const result = await runInDurableObject(newStub(), (_instance, state) => {
      const store = createLiveStore(state.storage.sql);
      store.initialize(meta);
      const alice = store.addParticipant("alice", 100);
      if (!alice.ok) throw new Error("unreachable");

      const first = store.recordAnswer({
        participantId: alice.value.id,
        questionId: "q1" as QuestionId,
        selectedOptionId: "a" as OptionId,
        elapsedMs: 500,
      });
      const second = store.recordAnswer({
        participantId: alice.value.id,
        questionId: "q1" as QuestionId,
        selectedOptionId: "b" as OptionId,
        elapsedMs: 999,
      });

      return { first, second, all: store.listAllAnswers(), forQuestion: store.listAnswers("q1" as QuestionId) };
    });

    expect(result.first.kind).toBe("recorded");
    expect(result.second).toEqual({
      kind: "alreadyAnswered",
      existing: { participantId: expect.any(String), questionId: "q1", selectedOptionId: "a", elapsedMs: 500 },
    });
    expect(result.all).toHaveLength(1);
    expect(result.forQuestion).toHaveLength(1);
  });

  it("discards answers for a question", async () => {
    const result = await runInDurableObject(newStub(), (_instance, state) => {
      const store = createLiveStore(state.storage.sql);
      store.initialize(meta);
      const alice = store.addParticipant("alice", 100);
      if (!alice.ok) throw new Error("unreachable");

      store.recordAnswer({
        participantId: alice.value.id,
        questionId: "q1" as QuestionId,
        selectedOptionId: "a" as OptionId,
        elapsedMs: 500,
      });
      store.discardAnswers("q1" as QuestionId);
      return store.listAllAnswers();
    });

    expect(result).toHaveLength(0);
  });
});
