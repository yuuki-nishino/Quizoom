import { useState } from "react";
import { CheckCircleIcon } from "../shared/icons";

/** 正解発表での表示内容。指定すると、正解の強調・不正解の減光と回答数・割合を表示する */
export interface OptionTileReveal {
  readonly isCorrect: boolean;
  readonly count: number;
  readonly pct: number;
}

export interface OptionTileViewProps {
  readonly label: string;
  readonly imageUrl: string | null;
  /** 画像の読み込みに失敗した場合に true。画像のみを隠し、テキストとレイアウトは維持する */
  readonly imageFailed: boolean;
  readonly onImageError: () => void;
  readonly reveal?: OptionTileReveal;
}

/**
 * 画像付き設問の選択肢1件(出題表示)。画像とテキストを同じ枠として対応づけて表示する(要件3.5)。
 * 画像の領域は読み込み前から flex で確保し(要件3.8)、画像は切り取らず領域内に収める。
 * テキストは行数を制限し、長文でタイルが画面外へ伸びないようにする(要件3.2, 3.3)。
 */
export function OptionTileView({ label, imageUrl, imageFailed, onImageError, reveal }: OptionTileViewProps) {
  const showImage = imageUrl !== null && !imageFailed;
  const image = showImage && (
    <div className="stage-option-image flex min-h-0 w-full flex-1 items-center justify-center">
      <img src={imageUrl} alt="" onError={onImageError} className="h-full w-full rounded-xl object-contain" />
    </div>
  );

  if (!reveal) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col items-center gap-[0.8cqh] rounded-2xl border-2 border-brand-primary/30 bg-white/95 p-[0.8cqh] shadow-lg">
        {image}
        <p className="line-clamp-2 w-full shrink-0 break-words text-center text-[max(12px,1.9cqh)] font-semibold leading-snug text-slate-800">{label}</p>
      </div>
    );
  }

  // 正解発表: 既存のテキストのみの表示と同じ強調(緑の枠・「正解」表示)。不正解は減光し、回答数・割合は常に表示する
  return (
    <div
      data-correct={reveal.isCorrect}
      className={
        reveal.isCorrect
          ? "stage-option-correct flex h-full min-h-0 min-w-0 flex-col items-center gap-[0.5cqh] rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-[0.8cqh] text-emerald-900 shadow-lg"
          : "flex h-full min-h-0 min-w-0 flex-col items-center gap-[0.5cqh] rounded-2xl border-2 border-slate-200 bg-white/80 p-[0.8cqh] text-slate-500 opacity-60 shadow"
      }
    >
      {image}
      <p className="line-clamp-2 inline-flex w-full shrink-0 items-center justify-center gap-1.5 break-words text-center text-[max(12px,1.9cqh)] font-bold leading-snug">
        {label}
        {reveal.isCorrect && (
          <>
            <CheckCircleIcon className="h-[max(14px,2.2cqh)] w-[max(14px,2.2cqh)] shrink-0 text-emerald-600" />
            <span>正解</span>
          </>
        )}
      </p>
      <p className="shrink-0 text-[max(11px,1.5cqh)] font-normal">
        {reveal.count}人（{reveal.pct}%）
      </p>
    </div>
  );
}

export interface OptionTileProps {
  readonly label: string;
  readonly imageUrl: string | null;
  readonly reveal?: OptionTileReveal;
}

/** 読み込み失敗の状態を保持して OptionTileView へ渡す */
export function OptionTile({ label, imageUrl, reveal }: OptionTileProps) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <OptionTileView
      label={label}
      imageUrl={imageUrl}
      imageFailed={imageFailed}
      onImageError={() => setImageFailed(true)}
      {...(reveal ? { reveal } : {})}
    />
  );
}
