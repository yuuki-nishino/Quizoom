import type { EventId, ParticipantId, ThemeSettings } from "../../shared/domain-types";

export interface JoinInfo {
  readonly eventId: EventId;
  readonly eventTitle: string;
  readonly theme: ThemeSettings;
  readonly accepting: boolean;
}

export interface JoinResult {
  readonly token: string;
  readonly participantId: ParticipantId;
  readonly eventId: EventId;
}

export type ApiResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly status: number; readonly code: string };

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

async function parseErrorBody(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

/** GET /api/join/:joinCode。認証不要（要件4.3） */
export async function fetchJoinInfo(joinCode: string, fetcher: Fetcher = (input, init) => fetch(input, init)): Promise<ApiResult<JoinInfo>> {
  let response: Response;
  try {
    response = await fetcher(`/api/join/${joinCode}`);
  } catch {
    return { ok: false, status: 0, code: "NETWORK_ERROR" };
  }

  if (!response.ok) return { ok: false, status: response.status, code: await parseErrorBody(response) };
  return { ok: true, value: (await response.json()) as JoinInfo };
}

/** POST /api/join/:joinCode。ニックネーム送信で参加者トークンを発行する（要件4.4） */
export async function submitNickname(
  joinCode: string,
  nickname: string,
  fetcher: Fetcher = (input, init) => fetch(input, init),
): Promise<ApiResult<JoinResult>> {
  let response: Response;
  try {
    response = await fetcher(`/api/join/${joinCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
  } catch {
    return { ok: false, status: 0, code: "NETWORK_ERROR" };
  }

  if (!response.ok) return { ok: false, status: response.status, code: await parseErrorBody(response) };
  return { ok: true, value: (await response.json()) as JoinResult };
}
