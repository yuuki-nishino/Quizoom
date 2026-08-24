import { useEffect, useState } from "react";
import type { EventId, OptionId } from "../../shared/domain-types";
import type { QuestionPublicView } from "../../shared/protocol";
import type { EventDetail, HostApiClient, Question } from "./api-client";
import { ThemePreviewWalkthrough, type PreviewQuestion } from "./theme-preview-walkthrough";

export interface ThemePreviewPageProps {
  readonly apiClient: HostApiClient;
  readonly eventId: EventId;
}

/** ホスト自身のセッションCookieで完結するため、投影/回答用のトークン付きURLと異なりトークンは不要 */
function hostMediaUrl(eventId: EventId, assetId: string): string {
  return `/api/events/${eventId}/media/${assetId}`;
}

function mapQuestionToPreview(eventId: EventId, question: Question): PreviewQuestion {
  const publicView: QuestionPublicView = {
    id: question.id,
    orderIndex: question.orderIndex,
    body: question.body,
    imageAssetId: question.imageAssetId,
    options: question.options.map(({ id, label, orderIndex }) => ({ id, label, orderIndex })),
  };
  const correctOptionId: OptionId = question.options.find((o) => o.isCorrect)?.id ?? question.options[0]!.id;
  const imageUrl = question.imageAssetId ? hostMediaUrl(eventId, question.imageAssetId) : null;

  return { question: publicView, correctOptionId, imageUrl };
}

export function toPreviewQuestion(eventId: EventId, event: EventDetail): PreviewQuestion | null {
  const question = event.questions[0];
  return question ? mapQuestionToPreview(eventId, question) : null;
}

/** イベントに登録された全設問をプレビュー用にマッピングする（要件3.14）。順序は登録順のまま保つ */
export function toPreviewQuestions(eventId: EventId, event: EventDetail): readonly PreviewQuestion[] {
  return event.questions.map((question) => mapQuestionToPreview(eventId, question));
}

/**
 * 「プレビューを開く」から別タブで開くフルページのプレビュー(要件3.5, 3.8)。
 * 主催者自身のセッションCookieでイベントを取得し直すため、常に保存済みの最新の外観・設問(画像含む)を表示する
 */
export function ThemePreviewPage({ apiClient, eventId }: ThemePreviewPageProps) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (error)
    return (
      <p role="alert" className="m-8 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
        読み込みに失敗しました（{error}）。
      </p>
    );
  if (!event) return <p className="m-8 text-slate-500">読み込み中…</p>;

  return (
    <section aria-label="プレビュー(別タブ)" className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-bold text-slate-900">{event.title} のプレビュー</h1>
      <p className="mt-1 text-sm text-slate-500">保存済みの外観設定と、登録済みの設問(画像を含む)を実画面と同じコンポーネントで表示しています。「プレビューする設問」から確認したい設問を選べます。</p>
      <ThemePreviewWalkthrough
        eventTitle={event.title}
        theme={event.theme}
        logoImageUrl={event.theme.logoAssetId ? hostMediaUrl(eventId, event.theme.logoAssetId) : null}
        backgroundImageUrl={event.theme.backgroundAssetId ? hostMediaUrl(eventId, event.theme.backgroundAssetId) : null}
        questions={toPreviewQuestions(eventId, event)}
      />
    </section>
  );
}
