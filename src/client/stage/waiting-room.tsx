import { useEffect, useState } from "react";
import { generateQrCodeSvg } from "../shared/qr";

export interface WaitingRoomProps {
  readonly eventTitle: string;
  readonly joinUrl: string | null;
}

/** 待機状態: イベントタイトルと参加用QRコードを表示する（要件6.1） */
export function WaitingRoom({ eventTitle, joinUrl }: WaitingRoomProps) {
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
    <div aria-label="待機状態" className="stage-waiting-room flex min-h-screen flex-col items-center justify-center gap-6 px-8 text-center">
      <h1 className="text-5xl font-extrabold text-brand-primary">{eventTitle}</h1>
      <p className="text-2xl text-brand-text/80">開始をお待ちください</p>
      {qrSvg && (
        <div aria-label="参加用QRコード" className="w-72 rounded-2xl bg-white p-6 shadow-xl [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      )}
      {joinUrl && <p className="text-lg text-brand-text/60">{joinUrl}</p>}
    </div>
  );
}
