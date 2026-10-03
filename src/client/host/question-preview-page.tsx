import { useEffect, useReducer, useState } from "react";
import type { EventId, ThemeSettings } from "../../shared/domain-types";
import type { EventDetail, HostApiClient } from "./api-client";
import { PreviewStageFrame } from "./preview-stage-frame";
import { buildWalkthroughSteps } from "./theme-preview-walkthrough";
import { isPreviewChannelSupported, subscribeDrafts } from "./question-preview-channel";
import {
  draftToPreviewQuestion,
  PREVIEW_TIMEOUT_MS,
  previewUnavailableMessage,
  reducePreviewSession,
  type PreviewSessionState,
} from "./question-preview-state";

export type QuestionPreviewTab = "question" | "reveal";

const TABS: readonly { readonly id: QuestionPreviewTab; readonly label: string }[] = [
  { id: "question", label: "出題" },
  { id: "reveal", label: "正解発表" },
];

export interface QuestionPreviewViewProps {
  readonly eventId: EventId;
  readonly eventTitle: string;
  readonly theme: ThemeSettings;
  readonly logoImageUrl: string | null;
  readonly backgroundImageUrl: string | null;
  readonly session: PreviewSessionState;
  readonly tab: QuestionPreviewTab;
  readonly onTabChange: (tab: QuestionPreviewTab) => void;
}

/**
 * 設問単位プレビューの表示部分(要件5.4-5.6)。実際の投影画面と同じ表示コンポーネント・外観・縦横比
 * (1920×1080を縮小した16:9の枠)で、編集中の設問の出題表示と正解発表を切り替えて見せる。
 * 取得できない状態では、直前の内容を出さず理由だけを表示する(要件5.8)
 */
export function QuestionPreviewView({ eventId, eventTitle, theme, logoImageUrl, backgroundImageUrl, session, tab, onTabChange }: QuestionPreviewViewProps) {
  if (session.status === "unavailable") {
    return (
      <p role="alert" className="m-8 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        {previewUnavailableMessage(session.reason)}
      </p>
    );
  }
  if (session.status === "waiting") return <p className="m-8 text-slate-500">編集画面に接続中…</p>;

  const preview = draftToPreviewQuestion(eventId, session.draft);
  const steps = buildWalkthroughSteps(eventTitle, preview);
  const step = steps.find((s) => s.group === "投影画面" && s.label === (tab === "question" ? "出題" : "正解発表"))!;

  return (
    <section aria-label="設問プレビュー" className="mx-auto max-w-[1320px] px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900">設問プレビュー</h1>
      <p className="mt-1 text-sm text-slate-500">
        保存前の編集内容を、実際の投影画面と同じ表示で確認できます。編集画面で内容を変えると、この画面にも反映されます。
      </p>
      <div role="group" aria-label="表示する画面" className="mt-4 flex gap-2">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => onTabChange(id)}
            className={`rounded-md border px-3 py-1.5 text-sm ${tab === id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <PreviewStageFrame
        group="投影画面"
        theme={theme}
        logoImageUrl={logoImageUrl}
        backgroundImageUrl={backgroundImageUrl}
        fitViewport={step.fitViewport ?? false}
        clip
      >
        {step.render()}
      </PreviewStageFrame>
    </section>
  );
}

export interface QuestionPreviewPageProps {
  readonly apiClient: HostApiClient;
  readonly eventId: EventId;
  /** 設問編集フォームを開くたびに採番される識別子。この識別子の編集タブからの下書きだけを受け取る */
  readonly sessionKey: string;
}

/** 設問編集画面から新しいタブで開く、その設問だけの投影画面プレビュー(要件5.1)。保存データは一切書き込まない(要件5.7) */
export function QuestionPreviewPage({ apiClient, eventId, sessionKey }: QuestionPreviewPageProps) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);
  const [tab, setTab] = useState<QuestionPreviewTab>("question");
  const [session, dispatch] = useReducer(reducePreviewSession, { status: "waiting" } as PreviewSessionState);

  useEffect(() => {
    let cancelled = false;
    apiClient.getEvent(eventId).then((result) => {
      if (cancelled) return;
      if (result.ok) setEvent(result.value);
      else setEventError(result.code);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    if (!isPreviewChannelSupported()) {
      dispatch({ type: "unsupported" });
      return;
    }
    const subscriber = subscribeDrafts(eventId, sessionKey, {
      onDraft: (draft) => dispatch({ type: "draft", draft }),
      onClosed: () => dispatch({ type: "closed" }),
    });
    subscriber.requestDraft();
    const timer = window.setTimeout(() => dispatch({ type: "timeout" }), PREVIEW_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
      subscriber.close();
    };
  }, [eventId, sessionKey]);

  if (eventError)
    return (
      <p role="alert" className="m-8 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
        読み込みに失敗しました（{eventError}）。
      </p>
    );
  if (!event) return <p className="m-8 text-slate-500">読み込み中…</p>;

  return (
    <QuestionPreviewView
      eventId={eventId}
      eventTitle={event.title}
      theme={event.theme}
      logoImageUrl={event.theme.logoAssetId ? `/api/events/${eventId}/media/${event.theme.logoAssetId}` : null}
      backgroundImageUrl={event.theme.backgroundAssetId ? `/api/events/${eventId}/media/${event.theme.backgroundAssetId}` : null}
      session={session}
      tab={tab}
      onTabChange={setTab}
    />
  );
}
