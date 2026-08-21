import { useEffect, useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { HostApiClient, InviteInfo } from "./api-client";
import type { HostRoute } from "./route";

export interface InviteAcceptProps {
  readonly apiClient: HostApiClient;
  readonly token: string;
  readonly onNavigate: (route: HostRoute) => void;
}

/** 招待受諾画面(`/host/invite/:token`)。ログイン済みメールアドレスと招待先の一致を確認した上で受諾する(要件2.1-2.4) */
export function InviteAccept({ apiClient, token, onNavigate }: InviteAcceptProps) {
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.getInviteInfo(token).then((result) => {
      if (cancelled) return;
      if (result.ok) setInvite(result.value);
      else setError(result.code);
    });
    return () => {
      cancelled = true;
    };
  }, [apiClient, token]);

  async function handleAccept() {
    setAccepting(true);
    const result = await apiClient.acceptInvite(token);
    setAccepting(false);
    if (result.ok) {
      onNavigate({ view: "editor", eventId: result.value.eventId as EventId, tab: "questions" });
    } else {
      setError(result.code);
    }
  }

  if (error)
    return (
      <p role="alert" className="m-8 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
        この招待は利用できません（{error}）。
      </p>
    );
  if (!invite) return <p className="m-8 text-slate-500">読み込み中…</p>;

  return (
    <section aria-label="招待の受諾" className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-bold text-slate-900">「{invite.eventTitle}」の共同運営に招待されています</h1>

      {invite.emailMatches ? (
        <button
          type="button"
          onClick={handleAccept}
          disabled={accepting}
          className="mt-6 rounded-md bg-indigo-600 px-5 py-2.5 font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          共同運営者になる
        </button>
      ) : (
        <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          この招待は別のメールアドレス宛です。招待されたGoogleアカウントでログインし直してください。
        </p>
      )}
    </section>
  );
}
