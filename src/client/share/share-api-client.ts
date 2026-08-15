import type { PublicResult } from "../../shared/domain-types";

export type ApiResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly status: number; readonly code: string };

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * GET /api/share/:shareCode の1回のフェッチのみで完結させる（WebSocketを使わない）。
 * 認証不要・閲覧専用。共有無効時は410、未確定/不明なコードは404が返る。
 */
export async function fetchPublicResult(
  shareCode: string,
  fetcher: Fetcher = (input, init) => fetch(input, init),
): Promise<ApiResult<PublicResult>> {
  let response: Response;
  try {
    response = await fetcher(`/api/share/${shareCode}`);
  } catch {
    return { ok: false, status: 0, code: "NETWORK_ERROR" };
  }

  if (!response.ok) {
    let code = "UNKNOWN";
    try {
      const body = (await response.json()) as { error?: string };
      code = body.error ?? "UNKNOWN";
    } catch {
      // ボディなし
    }
    return { ok: false, status: response.status, code };
  }

  return { ok: true, value: (await response.json()) as PublicResult };
}
