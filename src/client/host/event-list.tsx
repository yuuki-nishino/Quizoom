import { useEffect, useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { EventSummary, HostApiClient } from "./api-client";
import { eventStatusLabel } from "./format";
import { ConfirmDialog } from "./confirm-dialog";

export interface EventListProps {
  readonly apiClient: HostApiClient;
  readonly onOpenEvent: (eventId: EventId) => void;
}

/** イベント一覧・作成・複製・削除画面（要件1.3-1.8） */
export function EventList({ apiClient, onOpenEvent }: EventListProps) {
  const [events, setEvents] = useState<readonly EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EventSummary | null>(null);

  async function refresh() {
    const result = await apiClient.listEvents();
    if (result.ok) {
      setEvents(result.value);
      setError(null);
    } else {
      setError(result.code);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (newTitle.trim().length === 0) return;
    setCreating(true);
    const result = await apiClient.createEvent({ title: newTitle.trim() });
    setCreating(false);
    if (result.ok) {
      setNewTitle("");
      await refresh();
      onOpenEvent(result.value.id);
    } else {
      setError(result.code);
    }
  }

  async function handleDuplicate(id: EventId) {
    const result = await apiClient.duplicateEvent(id);
    if (result.ok) await refresh();
    else setError(result.code);
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    const result = await apiClient.deleteEvent(target.id);
    if (result.ok) await refresh();
    else setError(result.code);
  }

  return (
    <section aria-label="イベント一覧" className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">マイイベント</h1>

      <form onSubmit={handleCreate} className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex-1 min-w-48 text-sm font-medium text-slate-700">
          新しいイベント名
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="イベント名"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </label>
        <button
          type="submit"
          disabled={creating || newTitle.trim().length === 0}
          className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          作成する
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          エラーが発生しました（{error}）。再読み込みしてください。
        </p>
      )}

      {events === null ? (
        <p className="mt-6 text-slate-500">読み込み中…</p>
      ) : events.length === 0 ? (
        <p className="mt-6 text-slate-500">まだイベントがありません。上のフォームから作成してください。</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => onOpenEvent(event.id)}
                className="text-left font-medium text-indigo-700 hover:underline"
              >
                {event.title}
              </button>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {eventStatusLabel(event.status)}
              </span>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                {event.role === "owner" ? "主催" : "共同運営"}
              </span>
              <span className="text-sm text-slate-500">設問{event.questionCount}件</span>
              {event.role === "owner" && (
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDuplicate(event.id)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    複製
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(event)}
                    className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                  >
                    削除
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="イベントを削除しますか？"
          message={`「${pendingDelete.title}」を削除します。この操作は取り消せません。`}
          confirmLabel="削除する"
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </section>
  );
}
