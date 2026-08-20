import { err, ok } from "../../shared/domain-types";
import type {
  AssetId,
  EventId,
  EventStatus,
  OptionId,
  QuestionId,
  QuestionSnapshot,
  Result,
  ThemeSettings,
} from "../../shared/domain-types";
import type { Env } from "../env";
import { checkEventAccess } from "../auth/guard";
import { listAccessibleEventIds } from "../collaborators/repository";

export type CatalogError =
  | { readonly code: "NOT_FOUND" }
  | { readonly code: "FORBIDDEN" }
  | { readonly code: "EVENT_LIVE" }
  | { readonly code: "VALIDATION"; readonly fields: readonly string[] }
  | { readonly code: "STATUS_CONFLICT"; readonly actual: EventStatus }
  | { readonly code: "NO_QUESTIONS" };

/** publish 時に capacity が未指定のイベントへ適用する既定の参加者上限（要件4.6） */
export const DEFAULT_CAPACITY = 500;

export interface EventSummary {
  readonly id: EventId;
  readonly title: string;
  readonly status: EventStatus;
  readonly questionCount: number;
  readonly role: "owner" | "collaborator";
}

export interface QuestionOption {
  readonly id: OptionId;
  readonly label: string;
  readonly isCorrect: boolean;
  readonly orderIndex: number;
}

export interface Question {
  readonly id: QuestionId;
  readonly orderIndex: number;
  readonly body: string;
  readonly imageAssetId: AssetId | null;
  readonly timeLimitSec: number;
  readonly explanation: string;
  readonly options: readonly QuestionOption[];
}

export interface EventDetail {
  readonly id: EventId;
  readonly title: string;
  readonly subtitle: string;
  readonly status: EventStatus;
  readonly capacity: number | null;
  readonly createdAt: number;
  readonly questions: readonly Question[];
  readonly theme: ThemeSettings;
  readonly role: "owner" | "collaborator";
}

export interface CreateEventInput {
  readonly title: string;
  readonly subtitle?: string;
  readonly capacity?: number | null;
}

export interface UpdateEventInput {
  readonly title?: string;
  readonly subtitle?: string;
  readonly capacity?: number | null;
}

export interface QuestionOptionInput {
  readonly label: string;
  readonly isCorrect: boolean;
}

export interface QuestionInput {
  readonly id?: QuestionId;
  readonly body: string;
  readonly imageAssetId?: AssetId | null;
  readonly timeLimitSec: number;
  readonly explanation?: string;
  readonly options: readonly QuestionOptionInput[];
}

export const DEFAULT_THEME: ThemeSettings = {
  primaryColor: "#4338ca",
  accentColor: "#f59e0b",
  backgroundColor: "#ffffff",
  textColor: "#111827",
  logoAssetId: null,
  backgroundAssetId: null,
};

export const THEME_PRESETS: readonly ThemeSettings[] = [
  {
    primaryColor: "#be123c",
    accentColor: "#fbbf24",
    backgroundColor: "#fff1f2",
    textColor: "#1f2937",
    logoAssetId: null,
    backgroundAssetId: null,
  },
  {
    primaryColor: "#065f46",
    accentColor: "#d97706",
    backgroundColor: "#ecfdf5",
    textColor: "#111827",
    logoAssetId: null,
    backgroundAssetId: null,
  },
  {
    primaryColor: "#1e3a8a",
    accentColor: "#38bdf8",
    backgroundColor: "#eff6ff",
    textColor: "#0f172a",
    logoAssetId: null,
    backgroundAssetId: null,
  },
];

function newId(): string {
  return crypto.randomUUID();
}

interface EventRow {
  readonly id: string;
  readonly owner_id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: EventStatus;
  readonly join_code: string | null;
  readonly stage_token: string | null;
  readonly capacity: number | null;
  readonly created_at: number;
}

interface QuestionRow {
  readonly id: string;
  readonly order_index: number;
  readonly body: string;
  readonly image_asset_id: string | null;
  readonly time_limit_sec: number;
  readonly explanation: string;
}

interface OptionRow {
  readonly id: string;
  readonly question_id: string;
  readonly label: string;
  readonly is_correct: number;
  readonly order_index: number;
}

interface ThemeRow {
  readonly primary_color: string;
  readonly accent_color: string;
  readonly background_color: string;
  readonly text_color: string;
  readonly logo_asset_id: string | null;
  readonly background_asset_id: string | null;
}

function toTheme(row: ThemeRow | null): ThemeSettings {
  if (!row) return DEFAULT_THEME;
  return {
    primaryColor: row.primary_color,
    accentColor: row.accent_color,
    backgroundColor: row.background_color,
    textColor: row.text_color,
    logoAssetId: (row.logo_asset_id as AssetId) ?? null,
    backgroundAssetId: (row.background_asset_id as AssetId) ?? null,
  };
}

async function loadQuestions(env: Env, eventId: EventId): Promise<readonly Question[]> {
  const { results: questionRows } = await env.DB.prepare(
    "SELECT id, order_index, body, image_asset_id, time_limit_sec, explanation FROM question WHERE event_id = ? ORDER BY order_index",
  )
    .bind(eventId)
    .all<QuestionRow>();

  const { results: optionRows } = await env.DB.prepare(
    "SELECT o.id, o.question_id, o.label, o.is_correct, o.order_index FROM option o JOIN question q ON q.id = o.question_id WHERE q.event_id = ? ORDER BY o.order_index",
  )
    .bind(eventId)
    .all<OptionRow>();

  return questionRows.map((q) => ({
    id: q.id as QuestionId,
    orderIndex: q.order_index,
    body: q.body,
    imageAssetId: (q.image_asset_id as AssetId) ?? null,
    timeLimitSec: q.time_limit_sec,
    explanation: q.explanation,
    options: optionRows
      .filter((o) => o.question_id === q.id)
      .map((o) => ({
        id: o.id as OptionId,
        label: o.label,
        isCorrect: o.is_correct === 1,
        orderIndex: o.order_index,
      })),
  }));
}

export async function loadQuestionSnapshot(env: Env, eventId: EventId): Promise<readonly QuestionSnapshot[]> {
  const questions = await loadQuestions(env, eventId);
  return questions.map((question) => {
    const correctOption = question.options.find((option) => option.isCorrect)!;
    return {
      id: question.id,
      orderIndex: question.orderIndex,
      body: question.body,
      imageAssetId: question.imageAssetId,
      timeLimitSec: question.timeLimitSec,
      explanation: question.explanation,
      options: question.options.map((option) => ({ id: option.id, label: option.label, orderIndex: option.orderIndex })),
      correctOptionId: correctOption.id,
    };
  });
}

async function toEventDetail(env: Env, row: EventRow, role: "owner" | "collaborator"): Promise<EventDetail> {
  const [questions, themeRow] = await Promise.all([
    loadQuestions(env, row.id as EventId),
    env.DB.prepare("SELECT * FROM theme WHERE event_id = ?").bind(row.id).first<ThemeRow>(),
  ]);
  return {
    id: row.id as EventId,
    title: row.title,
    subtitle: row.subtitle,
    status: row.status,
    capacity: row.capacity,
    createdAt: row.created_at,
    questions,
    theme: toTheme(themeRow),
    role,
  };
}

async function findEventRow(env: Env, eventId: EventId): Promise<EventRow | null> {
  return env.DB.prepare("SELECT * FROM event WHERE id = ?").bind(eventId).first<EventRow>();
}

/** 所有者のみを許可する。イベント削除・複製など、共同運営者には委譲しない操作向け */
async function requireOwnedEvent(env: Env, eventId: EventId, ownerId: string): Promise<Result<EventRow, CatalogError>> {
  const row = await findEventRow(env, eventId);
  if (!row) return err({ code: "NOT_FOUND" });
  if (row.owner_id !== ownerId) return err({ code: "FORBIDDEN" });
  return ok(row);
}

/**
 * 所有者または受諾済み共同運営者を許可する。認可判定そのものは Auth Guard の
 * checkEventAccess に委譲し、event_collaborator テーブルへは直接クエリしない。
 */
async function requireAccessibleEvent(
  env: Env,
  eventId: EventId,
  userId: string,
): Promise<Result<{ readonly row: EventRow; readonly role: "owner" | "collaborator" }, CatalogError>> {
  // NOT_FOUND / FORBIDDEN の区別はカタログドメイン自身の既存の関心事であり、
  // checkEventAccess(要件10.4に沿って両者を区別せずFORBIDDENへ統一している)より先に判定する
  const row = await findEventRow(env, eventId);
  if (!row) return err({ code: "NOT_FOUND" });

  const access = await checkEventAccess(env, eventId, userId);
  if (!access.ok) return err({ code: "FORBIDDEN" });

  return ok({ row, role: access.value });
}

function toSummary(r: { id: string; title: string; status: EventStatus; question_count: number }, role: "owner" | "collaborator"): EventSummary {
  return { id: r.id as EventId, title: r.title, status: r.status, questionCount: r.question_count, role };
}

/** 所有イベントに加え、受諾済みの共同運営イベントも合成して返す（要件3.1の前提: 共同運営者が招待元イベントへ辿り着けるようにする） */
export async function listEvents(env: Env, userId: string): Promise<readonly EventSummary[]> {
  const { results: ownedRows } = await env.DB.prepare(
    "SELECT e.id, e.title, e.status, COUNT(q.id) as question_count FROM event e LEFT JOIN question q ON q.event_id = e.id WHERE e.owner_id = ? GROUP BY e.id ORDER BY e.created_at DESC",
  )
    .bind(userId)
    .all<{ id: string; title: string; status: EventStatus; question_count: number }>();

  const collaboratorEventIds = await listAccessibleEventIds(env, userId);
  let collaboratorRows: readonly { id: string; title: string; status: EventStatus; question_count: number }[] = [];
  if (collaboratorEventIds.length > 0) {
    const placeholders = collaboratorEventIds.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT e.id, e.title, e.status, COUNT(q.id) as question_count FROM event e LEFT JOIN question q ON q.event_id = e.id WHERE e.id IN (${placeholders}) GROUP BY e.id ORDER BY e.created_at DESC`,
    )
      .bind(...collaboratorEventIds)
      .all<{ id: string; title: string; status: EventStatus; question_count: number }>();
    collaboratorRows = results;
  }

  return [...ownedRows.map((r) => toSummary(r, "owner")), ...collaboratorRows.map((r) => toSummary(r, "collaborator"))];
}

export async function findEvent(env: Env, eventId: EventId, userId: string): Promise<Result<EventDetail, CatalogError>> {
  const accessible = await requireAccessibleEvent(env, eventId, userId);
  if (!accessible.ok) return accessible;
  return ok(await toEventDetail(env, accessible.value.row, accessible.value.role));
}

export async function createEvent(env: Env, ownerId: string, input: CreateEventInput): Promise<EventDetail> {
  const id = newId();
  const createdAt = Date.now();
  await env.DB.prepare(
    "INSERT INTO event (id, owner_id, title, subtitle, status, capacity, created_at) VALUES (?, ?, ?, ?, 'draft', ?, ?)",
  )
    .bind(id, ownerId, input.title, input.subtitle ?? "", input.capacity ?? null, createdAt)
    .run();

  return {
    id: id as EventId,
    title: input.title,
    subtitle: input.subtitle ?? "",
    status: "draft",
    capacity: input.capacity ?? null,
    createdAt,
    questions: [],
    theme: DEFAULT_THEME,
    role: "owner",
  };
}

export async function updateEvent(
  env: Env,
  eventId: EventId,
  userId: string,
  input: UpdateEventInput,
): Promise<Result<EventDetail, CatalogError>> {
  const accessible = await requireAccessibleEvent(env, eventId, userId);
  if (!accessible.ok) return accessible;
  const owned = accessible.value.row;

  await env.DB.prepare("UPDATE event SET title = ?, subtitle = ?, capacity = ? WHERE id = ?")
    .bind(
      input.title ?? owned.title,
      input.subtitle ?? owned.subtitle,
      input.capacity !== undefined ? input.capacity : owned.capacity,
      eventId,
    )
    .run();

  const updated = await findEventRow(env, eventId);
  return ok(await toEventDetail(env, updated!, accessible.value.role));
}

export async function duplicateEvent(env: Env, eventId: EventId, ownerId: string): Promise<Result<EventDetail, CatalogError>> {
  const owned = await requireOwnedEvent(env, eventId, ownerId);
  if (!owned.ok) return owned;

  const [questions, themeRow] = await Promise.all([
    loadQuestions(env, eventId),
    env.DB.prepare("SELECT * FROM theme WHERE event_id = ?").bind(eventId).first<ThemeRow>(),
  ]);

  const newEventId = newId();
  const createdAt = Date.now();
  const statements = [
    env.DB.prepare(
      "INSERT INTO event (id, owner_id, title, subtitle, status, capacity, created_at) VALUES (?, ?, ?, ?, 'draft', ?, ?)",
    ).bind(newEventId, ownerId, owned.value.title, owned.value.subtitle, owned.value.capacity, createdAt),
  ];

  for (const question of questions) {
    const newQuestionId = newId();
    statements.push(
      env.DB.prepare(
        "INSERT INTO question (id, event_id, order_index, body, image_asset_id, time_limit_sec, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(newQuestionId, newEventId, question.orderIndex, question.body, question.imageAssetId, question.timeLimitSec, question.explanation),
    );
    for (const option of question.options) {
      statements.push(
        env.DB.prepare(
          "INSERT INTO option (id, question_id, label, is_correct, order_index) VALUES (?, ?, ?, ?, ?)",
        ).bind(newId(), newQuestionId, option.label, option.isCorrect ? 1 : 0, option.orderIndex),
      );
    }
  }

  if (themeRow) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO theme (event_id, primary_color, accent_color, background_color, text_color, logo_asset_id, background_asset_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        newEventId,
        themeRow.primary_color,
        themeRow.accent_color,
        themeRow.background_color,
        themeRow.text_color,
        themeRow.logo_asset_id,
        themeRow.background_asset_id,
      ),
    );
  }

  await env.DB.batch(statements);

  const created = await findEventRow(env, newEventId as EventId);
  return ok(await toEventDetail(env, created!, "owner"));
}

export async function deleteEvent(env: Env, eventId: EventId, ownerId: string): Promise<Result<void, CatalogError>> {
  const owned = await requireOwnedEvent(env, eventId, ownerId);
  if (!owned.ok) return owned;

  await env.DB.prepare("DELETE FROM event WHERE id = ?").bind(eventId).run();
  return ok(undefined);
}

export async function updateStatus(
  env: Env,
  eventId: EventId,
  expected: EventStatus,
  next: EventStatus,
): Promise<Result<void, CatalogError>> {
  const row = await findEventRow(env, eventId);
  if (!row) return err({ code: "NOT_FOUND" });
  if (row.status === next) return ok(undefined);
  if (row.status !== expected) return err({ code: "STATUS_CONFLICT", actual: row.status });

  await env.DB.prepare("UPDATE event SET status = ? WHERE id = ? AND status = ?").bind(next, eventId, expected).run();
  return ok(undefined);
}

export async function countQuestions(env: Env, eventId: EventId): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) as n FROM question WHERE event_id = ?").bind(eventId).first<{ n: number }>();
  return row?.n ?? 0;
}

function validateQuestionInput(input: QuestionInput): readonly string[] {
  const fields: string[] = [];
  if (input.options.length < 2 || input.options.length > 4) fields.push("options");
  if (input.options.filter((o) => o.isCorrect).length !== 1) fields.push("correctOption");
  if (input.timeLimitSec < 5 || input.timeLimitSec > 300) fields.push("timeLimitSec");
  return fields;
}

export async function upsertQuestion(
  env: Env,
  eventId: EventId,
  userId: string,
  input: QuestionInput,
): Promise<Result<Question, CatalogError>> {
  const accessible = await requireAccessibleEvent(env, eventId, userId);
  if (!accessible.ok) return accessible;
  if (accessible.value.row.status === "live") return err({ code: "EVENT_LIVE" });

  const fields = validateQuestionInput(input);
  if (fields.length > 0) return err({ code: "VALIDATION", fields });

  const questionId = input.id ?? (newId() as QuestionId);
  const orderIndex =
    input.id !== undefined
      ? (await env.DB.prepare("SELECT order_index FROM question WHERE id = ?").bind(input.id).first<{ order_index: number }>())
          ?.order_index ?? 0
      : await countQuestions(env, eventId);

  const statements = [
    env.DB.prepare(
      "INSERT INTO question (id, event_id, order_index, body, image_asset_id, time_limit_sec, explanation) VALUES (?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET body = excluded.body, image_asset_id = excluded.image_asset_id, time_limit_sec = excluded.time_limit_sec, explanation = excluded.explanation",
    ).bind(questionId, eventId, orderIndex, input.body, input.imageAssetId ?? null, input.timeLimitSec, input.explanation ?? ""),
    env.DB.prepare("DELETE FROM option WHERE question_id = ?").bind(questionId),
  ];
  input.options.forEach((option, index) => {
    statements.push(
      env.DB.prepare("INSERT INTO option (id, question_id, label, is_correct, order_index) VALUES (?, ?, ?, ?, ?)").bind(
        newId(),
        questionId,
        option.label,
        option.isCorrect ? 1 : 0,
        index,
      ),
    );
  });

  await env.DB.batch(statements);

  const [question] = await loadQuestions(env, eventId).then((qs) => qs.filter((q) => q.id === questionId));
  return ok(question!);
}

export async function deleteQuestion(
  env: Env,
  eventId: EventId,
  userId: string,
  questionId: QuestionId,
): Promise<Result<void, CatalogError>> {
  const accessible = await requireAccessibleEvent(env, eventId, userId);
  if (!accessible.ok) return accessible;
  if (accessible.value.row.status === "live") return err({ code: "EVENT_LIVE" });

  await env.DB.prepare("DELETE FROM question WHERE id = ? AND event_id = ?").bind(questionId, eventId).run();
  return ok(undefined);
}

export async function reorderQuestions(
  env: Env,
  eventId: EventId,
  userId: string,
  order: readonly QuestionId[],
): Promise<Result<readonly Question[], CatalogError>> {
  const accessible = await requireAccessibleEvent(env, eventId, userId);
  if (!accessible.ok) return accessible;
  if (accessible.value.row.status === "live") return err({ code: "EVENT_LIVE" });

  // (event_id, order_index) の UNIQUE 制約はバッチ内でも即時検証されるため、
  // 一旦負の値へ退避してから最終値を設定し、入れ替え時の一時的な衝突を避ける。
  await env.DB.batch([
    ...order.map((questionId, index) =>
      env.DB.prepare("UPDATE question SET order_index = ? WHERE id = ? AND event_id = ?").bind(-(index + 1), questionId, eventId),
    ),
    ...order.map((questionId, index) =>
      env.DB.prepare("UPDATE question SET order_index = ? WHERE id = ? AND event_id = ?").bind(index, questionId, eventId),
    ),
  ]);

  return ok(await loadQuestions(env, eventId));
}

export async function putTheme(
  env: Env,
  eventId: EventId,
  userId: string,
  theme: ThemeSettings,
): Promise<Result<ThemeSettings, CatalogError>> {
  const accessible = await requireAccessibleEvent(env, eventId, userId);
  if (!accessible.ok) return accessible;

  await env.DB.prepare(
    "INSERT INTO theme (event_id, primary_color, accent_color, background_color, text_color, logo_asset_id, background_asset_id) VALUES (?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(event_id) DO UPDATE SET primary_color = excluded.primary_color, accent_color = excluded.accent_color, background_color = excluded.background_color, text_color = excluded.text_color, logo_asset_id = excluded.logo_asset_id, background_asset_id = excluded.background_asset_id",
  )
    .bind(eventId, theme.primaryColor, theme.accentColor, theme.backgroundColor, theme.textColor, theme.logoAssetId, theme.backgroundAssetId)
    .run();

  return ok(theme);
}

export interface PublishInfo {
  readonly status: EventStatus;
  readonly joinCode: string | null;
  readonly stageToken: string | null;
}

export async function findPublishInfo(env: Env, eventId: EventId, userId: string): Promise<Result<PublishInfo, CatalogError>> {
  const accessible = await requireAccessibleEvent(env, eventId, userId);
  if (!accessible.ok) return accessible;
  const owned = accessible.value.row;
  return ok({ status: owned.status, joinCode: owned.join_code, stageToken: owned.stage_token });
}

export interface JoinCodeLookup {
  readonly id: EventId;
  readonly title: string;
  readonly status: EventStatus;
}

/** JoinRoutes 専用。join_code から所有者不問でイベントを引く（参加者は主催者アカウントを持たないため） */
export async function findEventByJoinCode(env: Env, joinCode: string): Promise<JoinCodeLookup | null> {
  const row = await env.DB.prepare("SELECT id, title, status FROM event WHERE join_code = ?")
    .bind(joinCode)
    .first<{ id: string; title: string; status: EventStatus }>();
  if (!row) return null;
  return { id: row.id as EventId, title: row.title, status: row.status };
}

export async function findThemeSettings(env: Env, eventId: EventId): Promise<ThemeSettings> {
  const themeRow = await env.DB.prepare("SELECT * FROM theme WHERE event_id = ?").bind(eventId).first<ThemeRow>();
  return toTheme(themeRow);
}

export interface StageTokenLookup {
  readonly title: string;
  readonly joinCode: string | null;
}

type StageTokenError = { readonly code: "NOT_FOUND" } | { readonly code: "FORBIDDEN" };

/** StageRoutes（投影画面）専用。stage_token の一致を認可の根拠とする所有者不問の参照 */
export async function findEventByStageToken(
  env: Env,
  eventId: EventId,
  stageToken: string,
): Promise<Result<StageTokenLookup, StageTokenError>> {
  const row = await env.DB.prepare("SELECT title, join_code, stage_token FROM event WHERE id = ?")
    .bind(eventId)
    .first<{ title: string; join_code: string | null; stage_token: string | null }>();
  if (!row) return err({ code: "NOT_FOUND" });
  if (!row.stage_token || row.stage_token !== stageToken) return err({ code: "FORBIDDEN" });
  return ok({ title: row.title, joinCode: row.join_code });
}

export interface PublishResult {
  readonly joinCode: string;
  readonly stageToken: string;
}

/** 推測困難な識別子を生成する。参加用コードは英数字（紛らわしい文字を除く）で構成する */
function randomJoinCode(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function publish(env: Env, eventId: EventId, userId: string): Promise<Result<PublishResult, CatalogError>> {
  const accessible = await requireAccessibleEvent(env, eventId, userId);
  if (!accessible.ok) return accessible;
  const owned = accessible.value.row;

  // 再実行は冪等: 既に公開済みなら発行済みの参加情報をそのまま返す
  if (owned.status !== "draft") {
    return ok({ joinCode: owned.join_code ?? "", stageToken: owned.stage_token ?? "" });
  }

  const questionCount = await countQuestions(env, eventId);
  if (questionCount === 0) return err({ code: "NO_QUESTIONS" });

  const joinCode = randomJoinCode(10);
  const stageToken = crypto.randomUUID();

  await env.DB.prepare("UPDATE event SET status = 'published', join_code = ?, stage_token = ? WHERE id = ? AND status = 'draft'")
    .bind(joinCode, stageToken, eventId)
    .run();

  return ok({ joinCode, stageToken });
}
