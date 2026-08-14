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
    <section aria-label="イベント一覧">
      <h1>マイイベント</h1>

      <form onSubmit={handleCreate}>
        <label>
          新しいイベント名
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="イベント名" />
        </label>
        <button type="submit" disabled={creating || newTitle.trim().length === 0}>
          作成する
        </button>
      </form>

      {error && (
        <p role="alert">
          エラーが発生しました（{error}）。再読み込みしてください。
        </p>
      )}

      {events === null ? (
        <p>読み込み中…</p>
      ) : events.length === 0 ? (
        <p>まだイベントがありません。上のフォームから作成してください。</p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              <button type="button" onClick={() => onOpenEvent(event.id)}>
                {event.title}
              </button>
              <span> [{eventStatusLabel(event.status)}]</span>
              <span> 設問{event.questionCount}件</span>
              <button type="button" onClick={() => handleDuplicate(event.id)}>
                複製
              </button>
              <button type="button" onClick={() => setPendingDelete(event)}>
                削除
              </button>
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
