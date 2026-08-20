import type { AssetId, EventId, EventStatus, OptionId, QuestionId, ThemeSettings } from "../../shared/domain-types";

// CatalogRoutes / MediaRoutes / ResultArchive の HTTP 契約に対応するクライアント側の型。
// client は server の型を直接 import しない（依存方向 shared → client / shared → server を維持するため）。

export type EventRole = "owner" | "collaborator";

export interface EventSummary {
  readonly id: EventId;
  readonly title: string;
  readonly status: EventStatus;
  readonly questionCount: number;
  readonly role: EventRole;
}

export interface CollaboratorEntry {
  readonly id: string;
  readonly status: "pending" | "accepted";
  readonly invitedEmail: string;
  readonly acceptedAt: number | null;
}

export interface InviteInfo {
  readonly eventTitle: string;
  readonly emailMatches: boolean;
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
  readonly role: EventRole;
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
  readonly body: string;
  readonly imageAssetId?: AssetId | null;
  readonly timeLimitSec: number;
  readonly explanation?: string;
  readonly options: readonly QuestionOptionInput[];
}

export interface PublishResult {
  readonly joinCode: string;
  readonly joinUrl: string;
  readonly stageToken: string;
  readonly stageUrl: string;
}

export type PreflightStatus = "ok" | "warn" | "fail";

export type PreflightCheck =
  | { readonly id: "authValid"; readonly status: PreflightStatus; readonly detail: string }
  | { readonly id: "sessionReachable"; readonly status: PreflightStatus; readonly detail: string }
  | { readonly id: "roundTripMs"; readonly status: PreflightStatus; readonly measuredMs: number }
  | { readonly id: "stageUrlReachable"; readonly status: PreflightStatus; readonly detail: string }
  | { readonly id: "questionsReady"; readonly status: PreflightStatus; readonly questionCount: number };

export interface PreflightReport {
  readonly overall: PreflightStatus;
  readonly checkedAt: number;
  readonly checks: readonly PreflightCheck[];
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

// --- HTTP 基盤 ---------------------------------------------------------------

export interface ApiOk<T> {
  readonly ok: true;
  readonly value: T;
}

export interface ApiError {
  readonly ok: false;
  readonly status: number;
  readonly code: string;
  readonly fields?: readonly string[];
}

export type ApiResult<T> = ApiOk<T> | ApiError;

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

interface RequestOptions {
  readonly method?: string;
  readonly body?: unknown;
}

async function request<T>(fetcher: Fetcher, path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const init: RequestInit = {
    method: options.method ?? "GET",
    credentials: "include",
    body: options.body !== undefined ? JSON.stringify(options.body) : null,
  };
  if (options.body !== undefined) init.headers = { "Content-Type": "application/json" };

  let response: Response;
  try {
    response = await fetcher(path, init);
  } catch {
    return { ok: false, status: 0, code: "NETWORK_ERROR" };
  }

  if (response.status === 204) {
    return { ok: true, value: undefined as T };
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    const body = (json ?? {}) as { error?: string; fields?: readonly string[] };
    const error: ApiError = { ok: false, status: response.status, code: body.error ?? "UNKNOWN", ...(body.fields ? { fields: body.fields } : {}) };
    return error;
  }

  return { ok: true, value: json as T };
}

async function requestUpload<T>(fetcher: Fetcher, path: string, formData: FormData): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetcher(path, { method: "POST", credentials: "include", body: formData });
  } catch {
    return { ok: false, status: 0, code: "NETWORK_ERROR" };
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    const body = (json ?? {}) as { error?: string };
    return { ok: false, status: response.status, code: body.error ?? "UNKNOWN" };
  }

  return { ok: true, value: json as T };
}

export interface HostApiClient {
  me(): Promise<ApiResult<{ readonly userId: string }>>;
  requestGoogleSignInUrl(callbackURL: string): Promise<ApiResult<{ readonly url: string }>>;
  signOut(): Promise<ApiResult<void>>;
  listEvents(): Promise<ApiResult<readonly EventSummary[]>>;
  getEvent(id: EventId): Promise<ApiResult<EventDetail>>;
  createEvent(input: CreateEventInput): Promise<ApiResult<EventDetail>>;
  updateEvent(id: EventId, input: UpdateEventInput): Promise<ApiResult<EventDetail>>;
  duplicateEvent(id: EventId): Promise<ApiResult<EventDetail>>;
  deleteEvent(id: EventId): Promise<ApiResult<void>>;
  upsertQuestion(eventId: EventId, input: QuestionInput, questionId?: QuestionId): Promise<ApiResult<Question>>;
  deleteQuestion(eventId: EventId, questionId: QuestionId): Promise<ApiResult<void>>;
  reorderQuestions(eventId: EventId, questionIds: readonly QuestionId[]): Promise<ApiResult<readonly Question[]>>;
  putTheme(eventId: EventId, theme: ThemeSettings): Promise<ApiResult<ThemeSettings>>;
  uploadMedia(eventId: EventId, file: File): Promise<ApiResult<{ readonly assetId: AssetId }>>;
  publish(eventId: EventId): Promise<ApiResult<PublishResult>>;
  preflight(eventId: EventId): Promise<ApiResult<PreflightReport>>;
  getResults(eventId: EventId): Promise<ApiResult<ArchivedResult>>;
  enableSharing(eventId: EventId): Promise<ApiResult<{ readonly shareCode: string; readonly shareUrl: string }>>;
  disableSharing(eventId: EventId): Promise<ApiResult<void>>;
  deleteParticipantData(eventId: EventId): Promise<ApiResult<void>>;
  inviteCollaborator(eventId: EventId, email: string): Promise<ApiResult<{ readonly inviteUrl: string }>>;
  listCollaborators(eventId: EventId): Promise<ApiResult<readonly CollaboratorEntry[]>>;
  revokeCollaborator(eventId: EventId, collaboratorId: string): Promise<ApiResult<void>>;
  cancelInvite(eventId: EventId, inviteId: string): Promise<ApiResult<void>>;
  leaveCollaboration(eventId: EventId): Promise<ApiResult<void>>;
  getInviteInfo(token: string): Promise<ApiResult<InviteInfo>>;
  acceptInvite(token: string): Promise<ApiResult<{ readonly eventId: EventId }>>;
}

export function createApiClient(fetcher: Fetcher = (input, init) => fetch(input, init)): HostApiClient {
  return {
    me: () => request(fetcher, "/api/host/me"),
    requestGoogleSignInUrl: (callbackURL) =>
      request(fetcher, "/api/auth/sign-in/social", { method: "POST", body: { provider: "google", callbackURL } }),
    signOut: () => request(fetcher, "/api/auth/sign-out", { method: "POST" }),

    listEvents: () => request(fetcher, "/api/events"),
    getEvent: (id) => request(fetcher, `/api/events/${id}`),
    createEvent: (input) => request(fetcher, "/api/events", { method: "POST", body: input }),
    updateEvent: (id, input) => request(fetcher, `/api/events/${id}`, { method: "PATCH", body: input }),
    duplicateEvent: (id) => request(fetcher, `/api/events/${id}/duplicate`, { method: "POST" }),
    deleteEvent: (id) => request(fetcher, `/api/events/${id}`, { method: "DELETE" }),

    upsertQuestion: (eventId, input, questionId) =>
      request(
        fetcher,
        questionId ? `/api/events/${eventId}/questions/${questionId}` : `/api/events/${eventId}/questions`,
        { method: questionId ? "PATCH" : "POST", body: input },
      ),
    deleteQuestion: (eventId, questionId) => request(fetcher, `/api/events/${eventId}/questions/${questionId}`, { method: "DELETE" }),
    reorderQuestions: (eventId, questionIds) =>
      request(fetcher, `/api/events/${eventId}/questions/order`, { method: "PUT", body: { questionIds } }),

    putTheme: (eventId, theme) => request(fetcher, `/api/events/${eventId}/theme`, { method: "PUT", body: theme }),
    uploadMedia: (eventId, file) => {
      const formData = new FormData();
      formData.set("file", file);
      return requestUpload(fetcher, `/api/events/${eventId}/media`, formData);
    },

    publish: (eventId) => request(fetcher, `/api/events/${eventId}/publish`, { method: "POST" }),
    preflight: (eventId) => request(fetcher, `/api/events/${eventId}/preflight`),

    getResults: (eventId) => request(fetcher, `/api/events/${eventId}/results`),
    enableSharing: (eventId) => request(fetcher, `/api/events/${eventId}/share`, { method: "POST" }),
    disableSharing: (eventId) => request(fetcher, `/api/events/${eventId}/share`, { method: "DELETE" }),
    deleteParticipantData: (eventId) => request(fetcher, `/api/events/${eventId}/participant-data`, { method: "DELETE" }),

    inviteCollaborator: (eventId, email) =>
      request(fetcher, `/api/events/${eventId}/collaborators/invite`, { method: "POST", body: { email } }),
    listCollaborators: async (eventId) => {
      const result = await request<{ collaborators: readonly CollaboratorEntry[] }>(fetcher, `/api/events/${eventId}/collaborators`);
      return result.ok ? { ok: true, value: result.value.collaborators } : result;
    },
    revokeCollaborator: (eventId, collaboratorId) =>
      request(fetcher, `/api/events/${eventId}/collaborators/${collaboratorId}`, { method: "DELETE" }),
    cancelInvite: (eventId, inviteId) =>
      request(fetcher, `/api/events/${eventId}/collaborators/invites/${inviteId}`, { method: "DELETE" }),
    leaveCollaboration: (eventId) => request(fetcher, `/api/events/${eventId}/collaborators/leave`, { method: "POST" }),
    getInviteInfo: (token) => request(fetcher, `/api/collaborators/invites/${token}`),
    acceptInvite: (token) => request(fetcher, `/api/collaborators/invites/${token}/accept`, { method: "POST" }),
  };
}
