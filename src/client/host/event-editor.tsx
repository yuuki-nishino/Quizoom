import { useEffect, useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { EventDetail, HostApiClient } from "./api-client";
import { eventStatusLabel } from "./format";
import { QuestionEditor } from "./question-editor";
import { ThemeEditor } from "./theme-editor";
import { PublishPanel } from "./publish-panel";
import { ResultsPanel } from "./results-panel";
import type { HostRoute } from "./route";

export interface EventEditorProps {
  readonly apiClient: HostApiClient;
  readonly eventId: EventId;
  readonly tab: "questions" | "theme" | "publish" | "results";
  readonly onNavigate: (route: HostRoute) => void;
}

/** 準備フェーズのイベント編集画面。設問・外観・公開・結果の各タブを束ねるシェル */
export function EventEditor({ apiClient, eventId, tab, onNavigate }: EventEditorProps) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient.getEvent(eventId).then((result) => {
      if (cancelled) return;
      if (result.ok) setEvent(result.value);
      else setError(result.code);
    });
    return () => {
      cancelled = true;
    };
  }, [apiClient, eventId]);

  if (error) return <p role="alert">読み込みに失敗しました（{error}）。</p>;
  if (!event) return <p>読み込み中…</p>;

  return (
    <section aria-label="イベント編集">
      <button type="button" onClick={() => onNavigate({ view: "list" })}>
        一覧に戻る
      </button>
      <h1>
        {event.title} <small>[{eventStatusLabel(event.status)}]</small>
      </h1>

      <nav aria-label="編集タブ">
        <button type="button" onClick={() => onNavigate({ view: "editor", eventId, tab: "questions" })} aria-current={tab === "questions"}>
          設問
        </button>
        <button type="button" onClick={() => onNavigate({ view: "editor", eventId, tab: "theme" })} aria-current={tab === "theme"}>
          外観
        </button>
        <button type="button" onClick={() => onNavigate({ view: "editor", eventId, tab: "publish" })} aria-current={tab === "publish"}>
          公開
        </button>
        <button type="button" onClick={() => onNavigate({ view: "editor", eventId, tab: "results" })} aria-current={tab === "results"}>
          結果
        </button>
        <button type="button" onClick={() => onNavigate({ view: "preflight", eventId })}>
          事前確認
        </button>
        <button type="button" onClick={() => onNavigate({ view: "live", eventId })}>
          進行画面を開く
        </button>
      </nav>

      {tab === "questions" && <QuestionEditor apiClient={apiClient} eventId={eventId} event={event} onEventChange={setEvent} />}
      {tab === "theme" && <ThemeEditor apiClient={apiClient} eventId={eventId} event={event} onEventChange={setEvent} />}
      {tab === "publish" && <PublishPanel apiClient={apiClient} eventId={eventId} event={event} onEventChange={setEvent} />}
      {tab === "results" && <ResultsPanel apiClient={apiClient} eventId={eventId} />}
    </section>
  );
}
