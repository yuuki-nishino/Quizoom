import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import type { EventId, QuestionId } from "../../shared/domain-types";
import {
  listEvents,
  findEvent,
  createEvent,
  updateEvent,
  duplicateEvent,
  deleteEvent,
  updateStatus,
  upsertQuestion,
  deleteQuestion,
  reorderQuestions,
  countQuestions,
  putTheme,
  loadQuestionSnapshot,
  publish,
  findPublishInfo,
  THEME_PRESETS,
  DEFAULT_THEME,
} from "./repository";
import { createInvite, acceptInvite } from "../collaborators/repository";

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event_collaborator; DELETE FROM event; DELETE FROM user;",
  );
});

const OWNER = "owner-1";
const OTHER_OWNER = "owner-2";

async function seedUser(id: string, email: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1, 1)',
  )
    .bind(id, id, email)
    .run();
}

/** 指定イベントに対して受諾済みの共同運営者を1名作成し、そのuserIdを返す */
async function addAcceptedCollaborator(eventId: EventId, ownerId: string): Promise<string> {
  await seedUser(ownerId, `${ownerId}@example.com`);
  const collaboratorId = "collaborator-1";
  await seedUser(collaboratorId, "collaborator@example.com");
  const invite = await createInvite(env, eventId, "collaborator@example.com");
  if (!invite.ok) throw new Error(`setup failed: ${JSON.stringify(invite.error)}`);
  const accepted = await acceptInvite(env, invite.value.inviteToken, collaboratorId, "collaborator@example.com");
  if (!accepted.ok) throw new Error(`setup failed: ${JSON.stringify(accepted.error)}`);
  return collaboratorId;
}

describe("createEvent / listEvents / findEvent", () => {
  it("creates a draft event owned by the caller", async () => {
    const created = await createEvent(env, OWNER, { title: "Wedding Quiz" });
    expect(created.title).toBe("Wedding Quiz");
    expect(created.status).toBe("draft");
    expect(created.questions).toEqual([]);
  });

  it("lists only the caller's events with question counts", async () => {
    const e1 = await createEvent(env, OWNER, { title: "Mine" });
    await createEvent(env, OTHER_OWNER, { title: "Not mine" });
    await upsertQuestion(env, e1.id, OWNER, {
      body: "2+2?",
      timeLimitSec: 30,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });

    const events = await listEvents(env, OWNER);

    expect(events).toEqual([{ id: e1.id, title: "Mine", status: "draft", questionCount: 1, role: "owner" }]);
  });

  it("returns NOT_FOUND for a missing event", async () => {
    const result = await findEvent(env, "missing" as EventId, OWNER);
    expect(result).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("returns FORBIDDEN when a different owner reads the event", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const result = await findEvent(env, created.id, OTHER_OWNER);
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("includes the default theme when none has been saved", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const result = await findEvent(env, created.id, OWNER);
    expect(result).toEqual({ ok: true, value: { ...created, theme: DEFAULT_THEME } });
  });
});

describe("updateEvent", () => {
  it("updates the given fields", async () => {
    const created = await createEvent(env, OWNER, { title: "Old title" });
    const result = await updateEvent(env, created.id, OWNER, { title: "New title" });
    expect(result).toEqual({ ok: true, value: { ...created, title: "New title" } });
  });

  it("rejects a non-owner with FORBIDDEN", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const result = await updateEvent(env, created.id, OTHER_OWNER, { title: "Hacked" });
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("deleteEvent", () => {
  it("cascades deletion of questions and options", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    await upsertQuestion(env, created.id, OWNER, {
      body: "2+2?",
      timeLimitSec: 30,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });

    const result = await deleteEvent(env, created.id, OWNER);
    expect(result).toEqual({ ok: true, value: undefined });

    const remaining = await env.DB.prepare("SELECT count(*) as n FROM question WHERE event_id = ?").bind(created.id).first<{ n: number }>();
    expect(remaining?.n).toBe(0);
  });

  it("rejects a non-owner with FORBIDDEN", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const result = await deleteEvent(env, created.id, OTHER_OWNER);
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("duplicateEvent", () => {
  it("carries over questions, options, and theme but not results", async () => {
    const created = await createEvent(env, OWNER, { title: "Original" });
    await upsertQuestion(env, created.id, OWNER, {
      body: "2+2?",
      timeLimitSec: 30,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });
    await putTheme(env, created.id, OWNER, { ...DEFAULT_THEME, primaryColor: "#123456" });
    await env.DB.prepare("INSERT INTO result (id, event_id, finalized_at) VALUES ('r1', ?, 1000)").bind(created.id).run();

    const result = await duplicateEvent(env, created.id, OWNER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.id).not.toBe(created.id);
    expect(result.value.status).toBe("draft");
    expect(result.value.questions).toHaveLength(1);
    expect(result.value.questions[0]?.body).toBe("2+2?");
    expect(result.value.theme.primaryColor).toBe("#123456");

    const results = await env.DB.prepare("SELECT count(*) as n FROM result WHERE event_id = ?").bind(result.value.id).first<{ n: number }>();
    expect(results?.n).toBe(0);
  });
});

describe("updateStatus", () => {
  it("updates status when the expected value matches", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const result = await updateStatus(env, created.id, "draft", "published");
    expect(result).toEqual({ ok: true, value: undefined });

    const row = await env.DB.prepare("SELECT status FROM event WHERE id = ?").bind(created.id).first<{ status: string }>();
    expect(row?.status).toBe("published");
  });

  it("returns STATUS_CONFLICT when the expected value does not match", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const result = await updateStatus(env, created.id, "published", "live");
    expect(result).toEqual({ ok: false, error: { code: "STATUS_CONFLICT", actual: "draft" } });
  });

  it("is idempotent when already at the next status", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    await updateStatus(env, created.id, "draft", "published");
    const result = await updateStatus(env, created.id, "draft", "published");
    expect(result).toEqual({ ok: true, value: undefined });
  });
});

describe("upsertQuestion", () => {
  it("appends a new question with saved options", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const result = await upsertQuestion(env, created.id, OWNER, {
      body: "2+2?",
      timeLimitSec: 30,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.orderIndex).toBe(0);
    expect(result.value.options).toHaveLength(2);
  });

  it("rejects when no option is marked correct", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const result = await upsertQuestion(env, created.id, OWNER, {
      body: "2+2?",
      timeLimitSec: 30,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: false },
      ],
    });
    expect(result).toEqual({ ok: false, error: { code: "VALIDATION", fields: ["correctOption"] } });
  });

  it("rejects when fewer than 2 options are given", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const result = await upsertQuestion(env, created.id, OWNER, {
      body: "2+2?",
      timeLimitSec: 30,
      options: [{ label: "4", isCorrect: true }],
    });
    expect(result).toEqual({ ok: false, error: { code: "VALIDATION", fields: ["options"] } });
  });

  it("rejects a time limit outside 5-300 seconds", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const result = await upsertQuestion(env, created.id, OWNER, {
      body: "2+2?",
      timeLimitSec: 400,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });
    expect(result).toEqual({ ok: false, error: { code: "VALIDATION", fields: ["timeLimitSec"] } });
  });

  it("updates an existing question and replaces its options", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const first = await upsertQuestion(env, created.id, OWNER, {
      body: "2+2?",
      timeLimitSec: 30,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });
    if (!first.ok) throw new Error("setup failed");

    const updated = await upsertQuestion(env, created.id, OWNER, {
      id: first.value.id,
      body: "3+3?",
      timeLimitSec: 45,
      options: [
        { label: "6", isCorrect: true },
        { label: "5", isCorrect: false },
      ],
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.id).toBe(first.value.id);
    expect(updated.value.body).toBe("3+3?");
    expect(updated.value.options).toHaveLength(2);
    expect(updated.value.options.find((o) => o.isCorrect)?.label).toBe("6");
  });

  it("rejects question changes with EVENT_LIVE while the event is live", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    await updateStatus(env, created.id, "draft", "published");
    await updateStatus(env, created.id, "published", "live");

    const result = await upsertQuestion(env, created.id, OWNER, {
      body: "2+2?",
      timeLimitSec: 30,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });
    expect(result).toEqual({ ok: false, error: { code: "EVENT_LIVE" } });
  });
});

describe("deleteQuestion / reorderQuestions / countQuestions", () => {
  it("counts questions for an event", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    expect(await countQuestions(env, created.id)).toBe(0);
    await upsertQuestion(env, created.id, OWNER, {
      body: "2+2?",
      timeLimitSec: 30,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });
    expect(await countQuestions(env, created.id)).toBe(1);
  });

  it("deletes a question and its options", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const question = await upsertQuestion(env, created.id, OWNER, {
      body: "2+2?",
      timeLimitSec: 30,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });
    if (!question.ok) throw new Error("setup failed");

    const result = await deleteQuestion(env, created.id, OWNER, question.value.id);
    expect(result).toEqual({ ok: true, value: undefined });
    expect(await countQuestions(env, created.id)).toBe(0);
  });

  it("persists a new order for reorderQuestions", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const q1 = await upsertQuestion(env, created.id, OWNER, {
      body: "Q1",
      timeLimitSec: 30,
      options: [
        { label: "a", isCorrect: true },
        { label: "b", isCorrect: false },
      ],
    });
    const q2 = await upsertQuestion(env, created.id, OWNER, {
      body: "Q2",
      timeLimitSec: 30,
      options: [
        { label: "a", isCorrect: true },
        { label: "b", isCorrect: false },
      ],
    });
    if (!q1.ok || !q2.ok) throw new Error("setup failed");

    const result = await reorderQuestions(env, created.id, OWNER, [q2.value.id, q1.value.id]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((q) => q.id)).toEqual([q2.value.id, q1.value.id]);
    expect(result.value.map((q) => q.orderIndex)).toEqual([0, 1]);
  });

  it("rejects reorder and delete with EVENT_LIVE while the event is live", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const question = await upsertQuestion(env, created.id, OWNER, {
      body: "Q1",
      timeLimitSec: 30,
      options: [
        { label: "a", isCorrect: true },
        { label: "b", isCorrect: false },
      ],
    });
    if (!question.ok) throw new Error("setup failed");
    await updateStatus(env, created.id, "draft", "published");
    await updateStatus(env, created.id, "published", "live");

    expect(await deleteQuestion(env, created.id, OWNER, question.value.id)).toEqual({
      ok: false,
      error: { code: "EVENT_LIVE" },
    });
    expect(await reorderQuestions(env, created.id, OWNER, [question.value.id])).toEqual({
      ok: false,
      error: { code: "EVENT_LIVE" },
    });
  });
});

describe("putTheme", () => {
  it("round-trips through findEvent", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const theme = { ...DEFAULT_THEME, primaryColor: "#ff0000", accentColor: "#00ff00" };

    const saved = await putTheme(env, created.id, OWNER, theme);
    expect(saved).toEqual({ ok: true, value: theme });

    const found = await findEvent(env, created.id, OWNER);
    expect(found.ok && found.value.theme).toEqual(theme);
  });

  it("is allowed even while the event is live", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    await updateStatus(env, created.id, "draft", "published");
    await updateStatus(env, created.id, "published", "live");

    const result = await putTheme(env, created.id, OWNER, { ...DEFAULT_THEME, primaryColor: "#abcdef" });
    expect(result.ok).toBe(true);
  });

  it("overwrites all four custom colors when a preset is applied", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    await putTheme(env, created.id, OWNER, { ...DEFAULT_THEME, primaryColor: "#111111", accentColor: "#222222" });

    const preset = THEME_PRESETS[0]!;
    await putTheme(env, created.id, OWNER, preset);

    const found = await findEvent(env, created.id, OWNER);
    expect(found.ok && found.value.theme).toEqual(preset);
  });
});

describe("loadQuestionSnapshot", () => {
  it("returns ordered questions with their correct option id resolved", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    await upsertQuestion(env, created.id, OWNER, {
      body: "Second question",
      timeLimitSec: 20,
      explanation: "because 4",
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });
    await upsertQuestion(env, created.id, OWNER, {
      body: "First question",
      timeLimitSec: 30,
      options: [
        { label: "Paris", isCorrect: true },
        { label: "Lyon", isCorrect: false },
      ],
    });

    const snapshot = await loadQuestionSnapshot(env, created.id);

    expect(snapshot).toHaveLength(2);
    expect(snapshot.map((q) => q.body)).toEqual(["Second question", "First question"]);

    const second = snapshot[0]!;
    const correctOption = second.options.find((o) => o.label === "4")!;
    expect(second.correctOptionId).toBe(correctOption.id);
    expect(second.explanation).toBe("because 4");
    expect(second.timeLimitSec).toBe(20);
    expect(second.options.map((o) => o.label)).toEqual(["3", "4"]);
  });

  it("returns an empty array for an event without questions", async () => {
    const created = await createEvent(env, OWNER, { title: "Empty" });
    const snapshot = await loadQuestionSnapshot(env, created.id);
    expect(snapshot).toEqual([]);
  });
});

describe("publish", () => {
  it("rejects publishing an event with no questions with NO_QUESTIONS", async () => {
    const created = await createEvent(env, OWNER, { title: "Empty" });
    const result = await publish(env, created.id, OWNER);
    expect(result).toEqual({ ok: false, error: { code: "NO_QUESTIONS" } });
  });

  it("issues a join code and stage token, and updates status to published", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    await upsertQuestion(env, created.id, OWNER, {
      body: "2+2?",
      timeLimitSec: 30,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });

    const result = await publish(env, created.id, OWNER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.joinCode).toHaveLength(10);
    expect(result.value.stageToken.length).toBeGreaterThan(0);

    const info = await findPublishInfo(env, created.id, OWNER);
    expect(info).toEqual({
      ok: true,
      value: { status: "published", joinCode: result.value.joinCode, stageToken: result.value.stageToken },
    });
  });

  it("is idempotent: re-publishing an already-published event returns the same codes", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    await upsertQuestion(env, created.id, OWNER, {
      body: "2+2?",
      timeLimitSec: 30,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });

    const first = await publish(env, created.id, OWNER);
    const second = await publish(env, created.id, OWNER);
    expect(first).toEqual(second);
  });

  it("rejects a non-owner with FORBIDDEN", async () => {
    const created = await createEvent(env, OWNER, { title: "Mine" });
    const result = await publish(env, created.id, OTHER_OWNER);
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("collaborator access", () => {
  it("shows the collaborator's own event list with role 'collaborator'", async () => {
    const created = await createEvent(env, OWNER, { title: "Shared" });
    const collaboratorId = await addAcceptedCollaborator(created.id, OWNER);

    const events = await listEvents(env, collaboratorId);
    expect(events).toEqual([{ id: created.id, title: "Shared", status: "draft", questionCount: 0, role: "collaborator" }]);
  });

  it("lets a collaborator add questions, change the theme, and publish", async () => {
    const created = await createEvent(env, OWNER, { title: "Shared" });
    const collaboratorId = await addAcceptedCollaborator(created.id, OWNER);

    const question = await upsertQuestion(env, created.id, collaboratorId, {
      body: "2+2?",
      timeLimitSec: 30,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });
    expect(question.ok).toBe(true);

    const theme = await putTheme(env, created.id, collaboratorId, { ...DEFAULT_THEME, primaryColor: "#abcdef" });
    expect(theme.ok).toBe(true);

    const published = await publish(env, created.id, collaboratorId);
    expect(published.ok).toBe(true);
  });

  it("rejects a collaborator attempting to delete the event with FORBIDDEN", async () => {
    const created = await createEvent(env, OWNER, { title: "Shared" });
    const collaboratorId = await addAcceptedCollaborator(created.id, OWNER);

    const result = await deleteEvent(env, created.id, collaboratorId);
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("rejects a collaborator attempting to duplicate the event with FORBIDDEN", async () => {
    const created = await createEvent(env, OWNER, { title: "Shared" });
    const collaboratorId = await addAcceptedCollaborator(created.id, OWNER);

    const result = await duplicateEvent(env, created.id, collaboratorId);
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });
});
