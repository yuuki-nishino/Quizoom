import type { EventId } from "../../shared/domain-types";
import type { QuestionFormOption } from "./question-validation";

export interface QuestionOptionFieldsProps {
  readonly eventId: EventId;
  /** 形式(二択/四択)に対応する、表示対象の選択肢 */
  readonly options: readonly QuestionFormOption[];
  /** 選択肢の位置ごとの画像エラー文言 */
  readonly errors: Readonly<Record<number, string>>;
  readonly uploadingIndexes: readonly number[];
  /** テキストが空の選択肢の位置(画像の有無にかかわらず入力必須) */
  readonly emptyLabelIndexes: readonly number[];
  readonly disabled: boolean;
  readonly onLabelChange: (index: number, label: string) => void;
  readonly onSelectCorrect: (index: number) => void;
  readonly onPickImage: (index: number, file: File | undefined) => void;
  readonly onRemoveImage: (index: number) => void;
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
const imageButtonClass =
  "cursor-pointer rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40";

/** 主催者自身のセッションで画像を読み込むためトークンは不要(プレビューと同じ) */
function hostMediaUrl(eventId: EventId, assetId: string): string {
  return `/api/events/${eventId}/media/${assetId}`;
}

/**
 * 設問フォームの選択肢欄。選択肢ごとにテキスト・正解指定・画像(選択/差し替え/削除/その場での確認)を持つ。
 * 画像を添付していても選択肢のテキストは必須で、空の選択肢は入力を促す。
 */
export function QuestionOptionFields({
  eventId,
  options,
  errors,
  uploadingIndexes,
  emptyLabelIndexes,
  disabled,
  onLabelChange,
  onSelectCorrect,
  onPickImage,
  onRemoveImage,
}: QuestionOptionFieldsProps) {
  return (
    <div className="mt-1 space-y-3">
      {options.map((option, index) => {
        const uploading = uploadingIndexes.includes(index);
        const labelEmpty = emptyLabelIndexes.includes(index);
        const error = errors[index];
        return (
          <div key={index} className="rounded-md border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="correct-option"
                checked={option.isCorrect}
                disabled={disabled}
                onChange={() => onSelectCorrect(index)}
                aria-label={`選択肢${index + 1}を正解にする`}
              />
              <input
                type="text"
                value={option.label}
                disabled={disabled}
                onChange={(e) => onLabelChange(index, e.target.value)}
                placeholder={`選択肢${index + 1}`}
                aria-invalid={labelEmpty ? "true" : undefined}
                className={`${inputClass} flex-1 ${labelEmpty ? "border-red-400" : ""}`}
              />
            </div>
            {labelEmpty && (
              <p role="alert" className="mt-1 text-sm text-red-700">
                選択肢{index + 1}のテキストを入力してください(画像を添付する場合も必須です)
              </p>
            )}

            <div className="mt-2 flex items-center gap-3">
              {option.imageAssetId && (
                <img
                  src={hostMediaUrl(eventId, option.imageAssetId)}
                  alt={`選択肢${index + 1}の画像`}
                  className="aspect-[4/3] h-20 rounded-md border border-slate-200 object-cover"
                />
              )}
              <label className={imageButtonClass}>
                {option.imageAssetId ? "画像を差し替え" : "画像を追加"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={disabled || uploading}
                  onChange={(e) => {
                    onPickImage(index, e.target.files?.[0]);
                    // 同じファイルを選び直しても change が発火するよう、選択状態をリセットする
                    e.target.value = "";
                  }}
                  className="sr-only"
                />
              </label>
              {option.imageAssetId && (
                <button
                  type="button"
                  disabled={disabled || uploading}
                  onClick={() => onRemoveImage(index)}
                  className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  画像を削除
                </button>
              )}
              {uploading && <span className="text-xs text-slate-500">アップロード中…</span>}
            </div>
            {error && (
              <p role="alert" className="mt-1 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
