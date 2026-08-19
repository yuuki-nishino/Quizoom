import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";

async function seedEventWithQuestion() {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO event (id, owner_id, title, status, created_at) VALUES ('e1','u1','Test Event','draft', 1000)",
    ),
    env.DB.prepare(
      "INSERT INTO question (id, event_id, order_index, body, time_limit_sec) VALUES ('q1','e1',0,'2+2?',30)",
    ),
    env.DB.prepare(
      "INSERT INTO option (id, question_id, label, is_correct, order_index) VALUES ('o1','q1','3',0,0)",
    ),
    env.DB.prepare(
      "INSERT INTO option (id, question_id, label, is_correct, order_index) VALUES ('o2','q1','4',1,1)",
    ),
  ]);
}

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event_collaborator; DELETE FROM event;",
  );
});

describe("D1 schema constraints", () => {
  it("rejects a second correct option for the same question", async () => {
    await seedEventWithQuestion();
    await expect(
      env.DB.prepare(
        "INSERT INTO option (id, question_id, label, is_correct, order_index) VALUES ('o3','q1','5',1,2)",
      ).run(),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("rejects a time_limit_sec outside 5-300", async () => {
    await seedEventWithQuestion();
    await expect(
      env.DB.prepare(
        "INSERT INTO question (id, event_id, order_index, body, time_limit_sec) VALUES ('q2','e1',1,'too long',400)",
      ).run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("rejects a duplicate join_code across events", async () => {
    await env.DB.prepare(
      "INSERT INTO event (id, owner_id, title, status, join_code, created_at) VALUES ('e2','u1','A','draft','ABC123',1)",
    ).run();
    await expect(
      env.DB.prepare(
        "INSERT INTO event (id, owner_id, title, status, join_code, created_at) VALUES ('e3','u1','B','draft','ABC123',2)",
      ).run(),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("cascades question and option deletion when the owning event is deleted", async () => {
    await seedEventWithQuestion();
    await env.DB.prepare("DELETE FROM event WHERE id = 'e1'").run();

    const questions = await env.DB.prepare("SELECT count(*) as n FROM question WHERE event_id = 'e1'").first<{ n: number }>();
    const options = await env.DB.prepare("SELECT count(*) as n FROM option WHERE question_id = 'q1'").first<{ n: number }>();

    expect(questions?.n).toBe(0);
    expect(options?.n).toBe(0);
  });

  it("rejects a second unresolved invite to the same email for the same event", async () => {
    await env.DB.prepare(
      "INSERT INTO event (id, owner_id, title, status, created_at) VALUES ('e1','u1','Test Event','draft', 1000)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO event_collaborator (id, event_id, invited_email, invite_token, status, created_at) VALUES ('c1','e1','friend@example.com','tok1','pending', 1000)",
    ).run();

    await expect(
      env.DB.prepare(
        "INSERT INTO event_collaborator (id, event_id, invited_email, invite_token, status, created_at) VALUES ('c2','e1','friend@example.com','tok2','pending', 1001)",
      ).run(),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("cascades event_collaborator deletion when the owning event is deleted", async () => {
    await env.DB.prepare(
      "INSERT INTO event (id, owner_id, title, status, created_at) VALUES ('e1','u1','Test Event','draft', 1000)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO event_collaborator (id, event_id, invited_email, invite_token, status, created_at) VALUES ('c1','e1','friend@example.com','tok1','pending', 1000)",
    ).run();

    await env.DB.prepare("DELETE FROM event WHERE id = 'e1'").run();

    const collaborators = await env.DB.prepare("SELECT count(*) as n FROM event_collaborator WHERE event_id = 'e1'").first<{
      n: number;
    }>();
    expect(collaborators?.n).toBe(0);
  });
});
