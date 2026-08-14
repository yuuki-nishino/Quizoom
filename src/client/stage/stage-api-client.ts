import type { EventId, ThemeSettings } from "../../shared/domain-types";

export interface StageInfo {
  readonly eventTitle: string;
  readonly joinCode: string | null;
  readonly theme: ThemeSettings;
}

export type ApiResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly status: number; readonly code: string };

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** GET /api/stage/:eventId?token=... 認証不要・stage_token の一致のみで参照できる（要件6.1） */
export async function fetchStageInfo(
  eventId: EventId,
  token: string,
  fetcher: Fetcher = (input, init) => fetch(input, init),
): Promise<ApiResult<StageInfo>> {
  let response: Response;
  try {
    response = await fetcher(`/api/stage/${eventId}?token=${encodeURIComponent(token)}`);
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

  return { ok: true, value: json as StageInfo };
}
