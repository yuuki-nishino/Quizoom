import { err, ok } from "../../shared/domain-types";
import type { Result } from "../../shared/domain-types";
import {
  CHOICE_IMAGE_ASPECT,
  CHOICE_IMAGE_MAX_LONG_EDGE_PX,
  CHOICE_IMAGE_OUTPUT_QUALITY,
  CHOICE_IMAGE_OUTPUT_TYPE,
} from "../../shared/choice-image-spec";

export interface CropRect {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

export interface OutputSize {
  readonly width: number;
  readonly height: number;
}

const ACCEPTED_TYPES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);

/** 元画像寸法から、固定アスペクト比で中央トリミングする矩形を返す(純粋関数) */
export function computeCenterCrop(sourceWidth: number, sourceHeight: number): CropRect {
  const { width: aw, height: ah } = CHOICE_IMAGE_ASPECT;
  if (sourceWidth * ah >= sourceHeight * aw) {
    // 目標より横長(または同じ): 高さを使い切り、左右を切る
    const sh = sourceHeight;
    const sw = Math.max(1, Math.min(sourceWidth, Math.round((sh * aw) / ah)));
    return { sx: Math.floor((sourceWidth - sw) / 2), sy: 0, sw, sh };
  }
  // 目標より縦長: 幅を使い切り、上下を切る
  const sw = sourceWidth;
  const sh = Math.max(1, Math.min(sourceHeight, Math.round((sw * ah) / aw)));
  return { sx: 0, sy: Math.floor((sourceHeight - sh) / 2), sw, sh };
}

/** 縮小後の出力寸法を返す。長辺が上限を超える場合のみ縮小し、拡大はしない(純粋関数) */
export function computeOutputSize(crop: CropRect): OutputSize {
  const longEdge = Math.max(crop.sw, crop.sh);
  if (longEdge <= CHOICE_IMAGE_MAX_LONG_EDGE_PX) return { width: crop.sw, height: crop.sh };
  const scale = CHOICE_IMAGE_MAX_LONG_EDGE_PX / longEdge;
  return { width: Math.max(1, Math.round(crop.sw * scale)), height: Math.max(1, Math.round(crop.sh * scale)) };
}

export type ProcessImageError =
  | { readonly code: "UNSUPPORTED_TYPE" }
  | { readonly code: "DECODE_FAILED" }
  | { readonly code: "ENCODE_FAILED" };

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  close(): void;
}

/** ブラウザ依存の処理(デコード・canvas描画・エンコード)を差し替え可能にするための境界 */
export interface ImageCodec {
  decode(file: Blob): Promise<DecodedImage>;
  /** crop の範囲を output の大きさへ描画してエンコードする。エンコードできない場合は null */
  encode(source: DecodedImage, crop: CropRect, output: OutputSize, type: string, quality: number): Promise<Blob | null>;
}

interface BitmapImage extends DecodedImage {
  readonly bitmap: ImageBitmap;
}

/** 実ブラウザ用の実装。EXIFの向きを反映してデコードし、透過部分は白で塗りつぶしてJPEGにする */
export const browserImageCodec: ImageCodec = {
  async decode(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const image: BitmapImage = { bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    return image;
  },
  encode(source, crop, output, type, quality) {
    const { bitmap } = source as BitmapImage;
    const canvas = document.createElement("canvas");
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext("2d");
    if (!context) return Promise.resolve(null);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, output.width, output.height);
    return new Promise((resolve) => {
      // 指定形式でエンコードできないブラウザは別形式を返すため、形式が一致しない場合は失敗として扱う
      canvas.toBlob((blob) => resolve(blob && blob.type === type ? blob : null), type, quality);
    });
  },
};

/**
 * 選択された画像を、固定アスペクト比へ中央トリミングし、長辺を上限以下に縮小して、JPEGとして返す。
 * 失敗時は加工後の画像を生成せず、失敗の種類を返す(呼び出し側は当該選択肢の画像を変更しない)。
 */
export async function processChoiceImage(file: File, codec: ImageCodec = browserImageCodec): Promise<Result<Blob, ProcessImageError>> {
  if (!ACCEPTED_TYPES.has(file.type)) return err({ code: "UNSUPPORTED_TYPE" });

  let decoded: DecodedImage;
  try {
    decoded = await codec.decode(file);
  } catch {
    return err({ code: "DECODE_FAILED" });
  }

  try {
    if (decoded.width < 1 || decoded.height < 1) return err({ code: "DECODE_FAILED" });
    const crop = computeCenterCrop(decoded.width, decoded.height);
    const output = computeOutputSize(crop);
    const blob = await codec.encode(decoded, crop, output, CHOICE_IMAGE_OUTPUT_TYPE, CHOICE_IMAGE_OUTPUT_QUALITY);
    return blob ? ok(blob) : err({ code: "ENCODE_FAILED" });
  } catch {
    return err({ code: "ENCODE_FAILED" });
  } finally {
    decoded.close();
  }
}
