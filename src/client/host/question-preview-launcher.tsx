import type { AssetId, EventId } from "../../shared/domain-types";
import { hostRoutePath } from "./route";
import type { PreviewDraft } from "./question-preview-channel";
import { optionCountForFormat, type QuestionFormat, type QuestionFormOption } from "./question-validation";

export interface PreviewableForm {
  readonly body: string;
  readonly explanation: string;
  readonly imageAssetId: AssetId | null;
  readonly format: QuestionFormat;
  readonly options: readonly QuestionFormOption[];
}

/** 編集フォームの未保存の内容を、プレビューへ渡す下書きに変換する。現在の形式(二択/四択)で表示される選択肢だけを含める */
export function formToPreviewDraft(form: PreviewableForm): PreviewDraft {
  return {
    body: form.body,
    explanation: form.explanation,
    imageAssetId: form.imageAssetId,
    options: form.options.slice(0, optionCountForFormat(form.format)).map((option) => ({
      label: option.label,
      imageAssetId: option.imageAssetId,
      isCorrect: option.isCorrect,
    })),
  };
}

/** 編集フォームを開くたびに採番する識別子。この識別子のプレビューだけが、その編集の下書きを受け取る */
export function newPreviewSessionKey(): string {
  return crypto.randomUUID();
}

export interface QuestionPreviewLauncherProps {
  readonly eventId: EventId;
  readonly sessionKey: string;
  /** ブラウザが BroadcastChannel に対応しているか */
  readonly supported: boolean;
}

const buttonClass = "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50";

/** その設問だけの投影画面プレビューを、新しいタブで開く導線(要件5.1) */
export function QuestionPreviewLauncher({ eventId, sessionKey, supported }: QuestionPreviewLauncherProps) {
  if (!supported) {
    return (
      <span className="inline-flex items-center gap-2">
        <button type="button" disabled className={`${buttonClass} cursor-not-allowed opacity-40`}>
          プレビューを開く
        </button>
        <span className="text-xs text-slate-500">お使いのブラウザは、編集中の内容を別タブへ渡す機能に対応していません。</span>
      </span>
    );
  }
  return (
    <a
      href={hostRoutePath({ view: "question-preview", eventId, sessionKey })}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClass}
    >
      プレビューを開く
    </a>
  );
}
