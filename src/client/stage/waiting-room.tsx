import { useEffect, useState } from "react";
import { generateQrCodeSvg } from "../shared/qr";

export interface WaitingRoomProps {
  readonly eventTitle: string;
  readonly joinUrl: string | null;
  readonly participantCount: number;
}

/** 待機状態: イベントタイトルと参加用QRコード、現在の参加者数を表示する（要件6.1, 6.9） */
export function WaitingRoom({ eventTitle, joinUrl, participantCount }: WaitingRoomProps) {
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  useEffect(() => {
    if (!joinUrl) {
      setQrSvg(null);
      return;
    }
    let cancelled = false;
    generateQrCodeSvg(joinUrl).then((svg) => {
      if (!cancelled) setQrSvg(svg);
    });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  return (
    <div
      aria-label="待機状態"
      className="stage-waiting-room quiz-phase-enter flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-8 text-center"
    >
      <h1 className="font-display text-5xl font-extrabold tracking-tight text-brand-primary drop-shadow-sm sm:text-6xl">{eventTitle}</h1>
      <p className="text-2xl font-medium text-brand-text/80">開始をお待ちください</p>
      <p aria-label="現在の参加者数" className="text-xl text-brand-text/80">
        現在の参加者数: <span className="font-bold text-brand-primary">{participantCount}</span>人
      </p>
      <p className="max-w-xl text-base text-brand-text/70">
        選択式のクイズに答えて、正解数と回答時間で最終順位が決まります。
      </p>
      {qrSvg && (
        <div
          aria-label="参加用QRコード"
          className="w-72 rounded-3xl border-4 border-brand-accent/30 bg-white p-6 shadow-2xl [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
      )}
      {joinUrl && <p className="text-lg text-brand-text/60">{joinUrl}</p>}
    </div>
  );
}
