import { z } from "zod";
import type { AssetId, EventId } from "../../shared/domain-types";

const assetId = () => z.string().transform((v): AssetId => v as AssetId);

/** 設問編集フォームの未保存の内容(プレビューに必要な範囲)。保存データではなく、タブ間の受け渡し専用 */
export const previewDraftSchema = z.object({
  body: z.string(),
  explanation: z.string(),
  imageAssetId: assetId().nullable(),
  options: z.array(
    z.object({
      label: z.string(),
      imageAssetId: assetId().nullable(),
      isCorrect: z.boolean(),
    }),
  ),
});
export type PreviewDraft = z.infer<typeof previewDraftSchema>;
export type PreviewDraftOption = PreviewDraft["options"][number];

/**
 * 編集タブとプレビュータブの間のメッセージ。
 * - request: プレビュー → 編集(起動時に最新の下書きを要求)
 * - draft:   編集 → プレビュー(要求への応答と、編集のたびの更新。全量置換)
 * - closed:  編集 → プレビュー(編集フォームが閉じた)
 */
export const previewChannelMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("request") }),
  z.object({ type: z.literal("draft"), draft: previewDraftSchema }),
  z.object({ type: z.literal("closed") }),
]);
export type PreviewChannelMessage = z.infer<typeof previewChannelMessageSchema>;

/** BroadcastChannel のうち使う範囲。テストでは同じ形のメモリ上の実装に差し替える */
export interface ChannelLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(data: unknown): void;
  close(): void;
}
export type ChannelFactory = (name: string) => ChannelLike;

const browserChannelFactory: ChannelFactory = (name) => {
  const channel = new BroadcastChannel(name);
  let handler: ChannelLike["onmessage"] = null;
  // BroadcastChannel の onmessage は MessageEvent を受け取る。使うのは data だけなので、狭い型のアダプタで包む
  return {
    get onmessage(): ChannelLike["onmessage"] {
      return handler;
    },
    set onmessage(next: ChannelLike["onmessage"]) {
      handler = next;
      channel.onmessage = next ? (event: MessageEvent<unknown>) => next({ data: event.data }) : null;
    },
    postMessage: (data) => channel.postMessage(data),
    close: () => channel.close(),
  };
};

/** ブラウザが BroadcastChannel に対応しているか。非対応ならプレビューを開けない旨を表示する */
export function isPreviewChannelSupported(): boolean {
  return typeof BroadcastChannel !== "undefined";
}

/** チャンネル名はイベントと編集の開始ごとの識別子で決め、複数の編集・プレビューが混ざらないようにする */
export function previewChannelName(eventId: EventId, sessionKey: string): string {
  return `quizoom:question-preview:${eventId}:${sessionKey}`;
}

export interface DraftPublisher {
  /** 最新の下書きをプレビューへ送る */
  push(draft: PreviewDraft): void;
  /** 編集が終わったことを通知してチャンネルを閉じる */
  close(): void;
}

/** 編集タブ側。プレビューからの request に最新の下書きで応答し、編集のたびに push で更新する */
export function publishDrafts(
  eventId: EventId,
  sessionKey: string,
  getLatest: () => PreviewDraft,
  factory: ChannelFactory = browserChannelFactory,
): DraftPublisher {
  const channel = factory(previewChannelName(eventId, sessionKey));
  channel.onmessage = (event) => {
    const parsed = previewChannelMessageSchema.safeParse(event.data);
    if (parsed.success && parsed.data.type === "request") {
      channel.postMessage({ type: "draft", draft: getLatest() } satisfies PreviewChannelMessage);
    }
  };
  return {
    push(draft) {
      channel.postMessage({ type: "draft", draft } satisfies PreviewChannelMessage);
    },
    close() {
      channel.postMessage({ type: "closed" } satisfies PreviewChannelMessage);
      channel.close();
    },
  };
}

export interface DraftSubscriberHandlers {
  onDraft(draft: PreviewDraft): void;
  onClosed(): void;
}

export interface DraftSubscriber {
  /** 編集タブへ最新の下書きを要求する。編集タブがなければ応答は来ない */
  requestDraft(): void;
  close(): void;
}

/** プレビュータブ側。受信したメッセージは形式を検証し、不正なものは無視する */
export function subscribeDrafts(
  eventId: EventId,
  sessionKey: string,
  handlers: DraftSubscriberHandlers,
  factory: ChannelFactory = browserChannelFactory,
): DraftSubscriber {
  const channel = factory(previewChannelName(eventId, sessionKey));
  channel.onmessage = (event) => {
    const parsed = previewChannelMessageSchema.safeParse(event.data);
    if (!parsed.success) return;
    if (parsed.data.type === "draft") handlers.onDraft(parsed.data.draft);
    else if (parsed.data.type === "closed") handlers.onClosed();
  };
  return {
    requestDraft() {
      channel.postMessage({ type: "request" } satisfies PreviewChannelMessage);
    },
    close() {
      channel.onmessage = null;
      channel.close();
    },
  };
}
