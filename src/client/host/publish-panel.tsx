import { useEffect, useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { EventDetail, HostApiClient, PublishResult } from "./api-client";
import { generateQrCodeSvg } from "./qr";

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
    <section aria-label="公開">
      <h2>公開</h2>
      {error && <p role="alert">エラーが発生しました（{error}）。</p>}

      {!alreadyPublished && (
        <>
          {hasNoQuestions && <p role="alert">設問が1件も登録されていないため公開できません。先に設問を追加してください。</p>}
          <button type="button" disabled={hasNoQuestions || publishing} onClick={doPublish}>
            公開する
          </button>
        </>
      )}

      {publishResult && (
        <div>
          <p>
            参加用URL: <a href={publishResult.joinUrl}>{publishResult.joinUrl}</a>
          </p>
          <p>
            投影用URL: <a href={publishResult.stageUrl}>{publishResult.stageUrl}</a>
          </p>

          {joinQrSvg && (
            <>
              <figure aria-label="印刷用QRコード" data-qr="printable" dangerouslySetInnerHTML={{ __html: joinQrSvg }} />
              <figure aria-label="投影用QRコード" data-qr="projector" dangerouslySetInnerHTML={{ __html: joinQrSvg }} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
