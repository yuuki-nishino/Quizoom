import type { EventId, OptionId, QuestionId } from "../../shared/domain-types";
import type { PreviewDraft } from "./question-preview-channel";
import type { PreviewQuestion } from "./theme-preview-walkthrough";

/** 編集タブからの最初の下書きをこの時間待っても届かなければ、編集画面が見つからないものとして扱う */
export const PREVIEW_TIMEOUT_MS = 3000;

export type PreviewUnavailableReason = "no-editor" | "closed" | "unsupported";

export type PreviewSessionState =
  | { readonly status: "waiting" }
  | { readonly status: "ready"; readonly draft: PreviewDraft }
  | { readonly status: "unavailable"; readonly reason: PreviewUnavailableReason };

export type PreviewSessionEvent =
  | { readonly type: "draft"; readonly draft: PreviewDraft }
  | { readonly type: "closed" }
  | { readonly type: "timeout" }
  | { readonly type: "unsupported" };

/**
 * プレビュータブの状態遷移(要件5.2, 5.3, 5.8)。誤った内容を出さないため、編集タブが閉じたとき・見つからないときは
 * 直前の下書きを破棄して「表示できない」状態にする。遅れて下書きが届いた場合のみ復帰する。
 */
export function reducePreviewSession(state: PreviewSessionState, event: PreviewSessionEvent): PreviewSessionState {
  switch (event.type) {
    case "draft":
      return { status: "ready", draft: event.draft };
    case "closed":
      return { status: "unavailable", reason: "closed" };
    case "timeout":
      return state.status === "waiting" ? { status: "unavailable", reason: "no-editor" } : state;
    case "unsupported":
      return { status: "unavailable", reason: "unsupported" };
  }
}

const UNAVAILABLE_MESSAGES: Readonly<Record<PreviewUnavailableReason, string>> = {
  "no-editor": "編集画面が見つかりません。設問の編集画面を開いたまま、もう一度プレビューを開いてください。",
  closed: "編集画面が閉じられました。設問の編集画面を開き直して、もう一度プレビューを開いてください。",
  unsupported: "お使いのブラウザは、編集中の内容を別タブへ受け渡す機能に対応していません。別のブラウザでお試しください。",
};

export function previewUnavailableMessage(reason: PreviewUnavailableReason): string {
  return UNAVAILABLE_MESSAGES[reason];
}

function hostMediaUrl(eventId: EventId, assetId: string): string {
  return `/api/events/${eventId}/media/${assetId}`;
}

/**
 * 未保存の下書きを、実際の投影画面のコンポーネントが描画できる形へ変換する。画像は主催者自身のセッションで
 * 読み込むため、トークンなしのホスト用メディアURLを使う。仮のIDは位置から決め、下書きが更新されても変わらない
 */
export function draftToPreviewQuestion(eventId: EventId, draft: PreviewDraft): PreviewQuestion {
  const options = draft.options.map((option, index) => ({
    id: `preview-option-${index}` as OptionId,
    label: option.label,
    orderIndex: index,
    imageAssetId: option.imageAssetId,
  }));
  const correctIndex = draft.options.findIndex((o) => o.isCorrect);
  const correctOptionId = options[correctIndex === -1 ? 0 : correctIndex]!.id;

  const optionImageUrls = Object.fromEntries(
    options.flatMap((option) => (option.imageAssetId ? [[option.id, hostMediaUrl(eventId, option.imageAssetId)] as const] : [])),
  );

  return {
    question: {
      id: "preview-question" as QuestionId,
      orderIndex: 0,
      body: draft.body,
      imageAssetId: draft.imageAssetId,
      options,
    },
    correctOptionId,
    imageUrl: draft.imageAssetId ? hostMediaUrl(eventId, draft.imageAssetId) : null,
    optionImageUrls,
    explanation: draft.explanation,
  };
}
