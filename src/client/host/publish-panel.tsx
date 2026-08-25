import { useEffect, useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { EventDetail, HostApiClient, PublishResult } from "./api-client";
import { generateQrCodeSvg } from "../shared/qr";

export interface PublishPanelProps {
  readonly apiClient: HostApiClient;
  readonly eventId: EventId;
  readonly event: EventDetail;
  readonly onEventChange: (event: EventDetail) => void;
}

/** 公開操作とQR・参加URL取得画面（要件2.10, 4.1, 4.2） */
export function PublishPanel({ apiClient, eventId, event, onEventChange }: PublishPanelProps) {
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [joinQrSvg, setJoinQrSvg] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasNoQuestions = event.questions.length === 0;
  const alreadyPublished = event.status !== "draft";
  const [practiceModeError, setPracticeModeError] = useState<string | null>(null);
  const [practiceModeSaving, setPracticeModeSaving] = useState(false);

  async function togglePracticeMode() {
    setPracticeModeSaving(true);
    const result = await apiClient.updateEvent(eventId, { practiceMode: !event.practiceMode });
    setPracticeModeSaving(false);
    if (!result.ok) {
      setPracticeModeError(result.code);
      return;
    }
    setPracticeModeError(null);
    onEventChange({ ...event, practiceMode: result.value.practiceMode });
  }

  async function doPublish() {
    setPublishing(true);
    const result = await apiClient.publish(eventId);
    setPublishing(false);
    if (!result.ok) {
      setError(result.code);
      return;
    }
    setError(null);
    setPublishResult(result.value);
    onEventChange({ ...event, status: event.status === "draft" ? "published" : event.status });
  }

  // 公開済みイベントは再訪時に既発行の参加情報を取得する（publish は冪等なので副作用を伴わない）
  useEffect(() => {
    if (alreadyPublished) void doPublish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyPublished]);

  useEffect(() => {
    if (!publishResult) {
      setJoinQrSvg(null);
      return;
    }
    let cancelled = false;
    generateQrCodeSvg(publishResult.joinUrl).then((svg) => {
      if (!cancelled) setJoinQrSvg(svg);
    });
    return () => {
      cancelled = true;
    };
  }, [publishResult]);

  return (
    <section aria-label="公開" className="max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-900">公開</h2>
      {error && (
        <p role="alert" className="mt-2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          エラーが発生しました（{error}）。
        </p>
      )}

      <div className="mt-4 flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
        <input
          type="checkbox"
          id="practice-mode-toggle"
          checked={event.practiceMode}
          disabled={event.status === "live" || practiceModeSaving}
          onChange={togglePracticeMode}
          className="mt-1"
        />
        <label htmlFor="practice-mode-toggle" className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">テスト問題モード</span>
          <p className="mt-0.5 text-slate-600">
            有効にすると、待機状態から本編最初の設問に入る前に、採点に影響しない固定のテスト問題を1問実演できます。
            {event.status === "live" && "（開催中は変更できません）"}
          </p>
        </label>
      </div>
      {practiceModeError && (
        <p role="alert" className="mt-2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          テスト問題モードの変更に失敗しました（{practiceModeError}）。
        </p>
      )}

      {!alreadyPublished && (
        <>
          {hasNoQuestions && (
            <p role="alert" className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
              設問が1件も登録されていないため公開できません。先に設問を追加してください。
            </p>
          )}
          <button
            type="button"
            disabled={hasNoQuestions || publishing}
            onClick={doPublish}
            className="mt-4 rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            公開する
          </button>
        </>
      )}

      {publishResult && (
        <div className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="break-all text-sm text-slate-700">
            参加用URL:{" "}
            <a href={publishResult.joinUrl} className="text-indigo-700 hover:underline">
              {publishResult.joinUrl}
            </a>
          </p>
          <p className="break-all text-sm text-slate-700">
            投影用URL:{" "}
            <a href={publishResult.stageUrl} className="text-indigo-700 hover:underline">
              {publishResult.stageUrl}
            </a>
          </p>

          {joinQrSvg && (
            <div className="flex flex-wrap gap-6">
              <figure aria-label="印刷用QRコード" data-qr="printable" className="w-40" dangerouslySetInnerHTML={{ __html: joinQrSvg }} />
              <figure aria-label="投影用QRコード" data-qr="projector" className="w-40" dangerouslySetInnerHTML={{ __html: joinQrSvg }} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
