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

  if (error)
    return (
      <p role="alert" className="m-8 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
        読み込みに失敗しました（{error}）。
      </p>
    );
  if (!event) return <p className="m-8 text-slate-500">読み込み中…</p>;

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    <section aria-label="イベント編集" className="mx-auto max-w-3xl px-4 py-8">
      <button type="button" onClick={() => onNavigate({ view: "list" })} className="text-sm text-indigo-700 hover:underline">
        ← 一覧に戻る
      </button>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        {event.title}{" "}
        <small className="ml-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
          {eventStatusLabel(event.status)}
        </small>
      </h1>

      <nav aria-label="編集タブ" className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => onNavigate({ view: "editor", eventId, tab: "questions" })}
          aria-current={tab === "questions"}
          className={tabClass(tab === "questions")}
        >
          設問
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ view: "editor", eventId, tab: "theme" })}
          aria-current={tab === "theme"}
          className={tabClass(tab === "theme")}
        >
          外観
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ view: "editor", eventId, tab: "publish" })}
          aria-current={tab === "publish"}
          className={tabClass(tab === "publish")}
        >
          公開
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ view: "editor", eventId, tab: "results" })}
          aria-current={tab === "results"}
          className={tabClass(tab === "results")}
        >
          結果
        </button>
        <button type="button" onClick={() => onNavigate({ view: "preflight", eventId })} className="ml-auto rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          事前確認
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ view: "live", eventId })}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          進行画面を開く
        </button>
      </nav>

      <div className="mt-6">
        {tab === "questions" && <QuestionEditor apiClient={apiClient} eventId={eventId} event={event} onEventChange={setEvent} />}
        {tab === "theme" && <ThemeEditor apiClient={apiClient} eventId={eventId} event={event} onEventChange={setEvent} />}
        {tab === "publish" && <PublishPanel apiClient={apiClient} eventId={eventId} event={event} onEventChange={setEvent} />}
        {tab === "results" && <ResultsPanel apiClient={apiClient} eventId={eventId} />}
      </div>
    </section>
  );
}
