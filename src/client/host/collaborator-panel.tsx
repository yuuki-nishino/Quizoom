import { useEffect, useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { CollaboratorEntry, EventRole, HostApiClient } from "./api-client";
import { ConfirmDialog } from "./confirm-dialog";

export interface CollaboratorPanelProps {
  readonly apiClient: HostApiClient;
  readonly eventId: EventId;
  readonly role: EventRole;
  readonly onLeft: () => void;
}

/** 共同運営者管理画面。所有者には招待・一覧・解除・招待取消を、共同運営者には離脱操作のみを提供する(要件1, 4.4, 5) */
export function CollaboratorPanel({ apiClient, eventId, role, onLeft }: CollaboratorPanelProps) {
  const [collaborators, setCollaborators] = useState<readonly CollaboratorEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  async function refresh() {
    if (role !== "owner") return;
    const result = await apiClient.listCollaborators(eventId);
    if (result.ok) {
      setCollaborators(result.value);
      setError(null);
    } else {
      setError(result.code);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient, eventId, role]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim().length === 0) return;
    setInviting(true);
    const result = await apiClient.inviteCollaborator(eventId, email.trim());
    setInviting(false);
    if (result.ok) {
      setEmail("");
      setInviteUrl(result.value.inviteUrl);
      await refresh();
    } else {
      setError(result.code);
    }
  }

  async function handleRevoke(collaboratorId: string) {
    const result = await apiClient.revokeCollaborator(eventId, collaboratorId);
    if (result.ok) await refresh();
    else setError(result.code);
  }

  async function handleCancelInvite(inviteId: string) {
    const result = await apiClient.cancelInvite(eventId, inviteId);
    if (result.ok) await refresh();
    else setError(result.code);
  }

  async function handleConfirmLeave() {
    setConfirmingLeave(false);
    const result = await apiClient.leaveCollaboration(eventId);
    if (result.ok) onLeft();
    else setError(result.code);
  }

  if (role === "collaborator") {
    return (
      <section aria-label="共同運営者" className="max-w-2xl">
        <h2 className="text-lg font-semibold text-slate-900">共同運営</h2>
        <p className="mt-2 text-sm text-slate-600">このイベントの共同運営者として参加しています。</p>
        <button
          type="button"
          onClick={() => setConfirmingLeave(true)}
          className="mt-4 rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
        >
          共同運営から離脱する
        </button>

        {confirmingLeave && (
          <ConfirmDialog
            title="共同運営から離脱しますか？"
            message="このイベントに対する進行・編集の権限を失います。"
            confirmLabel="離脱する"
            onCancel={() => setConfirmingLeave(false)}
            onConfirm={handleConfirmLeave}
          />
        )}
      </section>
    );
  }

  return (
    <section aria-label="共同運営者" className="max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-900">共同運営者</h2>

      {error && (
        <p role="alert" className="mt-2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          エラーが発生しました（{error}）。
        </p>
      )}

      <form onSubmit={handleInvite} className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex-1 min-w-48 text-sm font-medium text-slate-700">
          招待するメールアドレス
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@example.com"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </label>
        <button
          type="submit"
          disabled={inviting || email.trim().length === 0}
          className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          招待する
        </button>
      </form>

      {inviteUrl && (
        <p role="status" className="mt-3 break-all rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          招待URLを発行しました。相手に共有してください: {inviteUrl}
        </p>
      )}

      {collaborators === null ? (
        <p className="mt-6 text-slate-500">読み込み中…</p>
      ) : collaborators.length === 0 ? (
        <p className="mt-6 text-slate-500">まだ共同運営者・招待がありません。</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
          {collaborators.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="text-slate-900">{entry.invitedEmail}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {entry.status === "accepted" ? "共同運営者" : "招待中"}
              </span>
              <div className="ml-auto flex gap-2">
                {entry.status === "accepted" ? (
                  <button
                    type="button"
                    onClick={() => handleRevoke(entry.id)}
                    className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                  >
                    解除する
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCancelInvite(entry.id)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    招待を取り消す
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
