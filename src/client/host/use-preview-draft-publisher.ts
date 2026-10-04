import { useEffect, useRef } from "react";
import type { EventId } from "../../shared/domain-types";
import { isPreviewChannelSupported, publishDrafts, type DraftPublisher, type PreviewDraft } from "./question-preview-channel";

/**
 * 設問編集フォームの未保存の内容を、開いているプレビュータブへ公開する(要件5.2, 5.3)。
 * sessionKey が非null の間だけチャンネルを開き、プレビューからの要求に最新の下書きで応答する。
 * 下書きが変わるたびに更新を送り、sessionKey が null になる(フォームを閉じる・保存する)かアンマウントされると、
 * 閉じたことをプレビューへ通知する(要件5.8)。バックエンドへは何も保存しない(要件5.7)
 */
export function usePreviewDraftPublisher(eventId: EventId, sessionKey: string | null, draft: PreviewDraft): void {
  const latest = useRef(draft);
  latest.current = draft;
  const publisher = useRef<DraftPublisher | null>(null);

  useEffect(() => {
    if (sessionKey === null || !isPreviewChannelSupported()) return;
    const opened = publishDrafts(eventId, sessionKey, () => latest.current);
    publisher.current = opened;
    return () => {
      opened.close();
      publisher.current = null;
    };
  }, [eventId, sessionKey]);

  useEffect(() => {
    publisher.current?.push(draft);
  }, [draft]);
}
