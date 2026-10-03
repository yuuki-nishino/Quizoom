import type { AssetId, Result } from "../../shared/domain-types";
import type { ApiResult } from "./api-client";
import type { ProcessImageError } from "./choice-image-processor";
import type { QuestionFormOption } from "./question-validation";

export type OptionImageError = ProcessImageError["code"] | "PAYLOAD_TOO_LARGE" | "UPLOAD_FAILED";

/** 画像加工とアップロードの境界。実際の実装(加工=ブラウザcanvas、アップロード=ホストAPI)は呼び出し側が渡す */
export interface OptionImageDeps {
  process(file: File): Promise<Result<Blob, ProcessImageError>>;
  upload(file: File): Promise<ApiResult<{ readonly assetId: AssetId }>>;
}

export type PrepareOptionImageResult =
  | { readonly ok: true; readonly assetId: AssetId }
  | { readonly ok: false; readonly error: OptionImageError };

/**
 * 選択された画像を加工(4:3・縮小・JPEG化)してからアップロードし、assetId を返す。
 * 加工に失敗した場合はアップロードせず、サーバーが拒否した場合もその種類を返す。
 * いずれの失敗でも呼び出し側は当該選択肢の画像を変更しない(要件2.5, 2.6, 2.7)。
 */
export async function prepareOptionImage(file: File, deps: OptionImageDeps): Promise<PrepareOptionImageResult> {
  const processed = await deps.process(file);
  if (!processed.ok) return { ok: false, error: processed.error.code };

  const upload = await deps.upload(new File([processed.value], "option.jpg", { type: processed.value.type }));
  if (upload.ok) return { ok: true, assetId: upload.value.assetId };
  if (upload.code === "PAYLOAD_TOO_LARGE") return { ok: false, error: "PAYLOAD_TOO_LARGE" };
  if (upload.code === "UNSUPPORTED_MEDIA_TYPE") return { ok: false, error: "UNSUPPORTED_TYPE" };
  return { ok: false, error: "UPLOAD_FAILED" };
}

/** 指定した選択肢の画像を設定(差し替え)する。他の選択肢・テキスト・正解指定は変えない */
export function setOptionImage(options: readonly QuestionFormOption[], index: number, assetId: AssetId): readonly QuestionFormOption[] {
  return options.map((option, i) => (i === index ? { ...option, imageAssetId: assetId } : option));
}

/** 指定した選択肢の画像を削除する。テキストと正解指定は保持する */
export function clearOptionImage(options: readonly QuestionFormOption[], index: number): readonly QuestionFormOption[] {
  return options.map((option, i) => (i === index ? { ...option, imageAssetId: null } : option));
}

const MESSAGES: Readonly<Record<OptionImageError, string>> = {
  UNSUPPORTED_TYPE: "この形式の画像は使えません。JPEG・PNG・WebPの画像を選択してください。",
  DECODE_FAILED: "画像を読み込めませんでした。別の画像を選択してください。",
  ENCODE_FAILED: "画像の加工に失敗しました。別の画像を選択してください。",
  PAYLOAD_TOO_LARGE: "画像のサイズが上限を超えています。より小さい画像を選択してください。",
  UPLOAD_FAILED: "画像のアップロードに失敗しました。通信状況を確認して、もう一度お試しください。",
};

export function optionImageErrorMessage(error: OptionImageError): string {
  return MESSAGES[error];
}
