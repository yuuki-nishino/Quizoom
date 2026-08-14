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
    <div aria-label="待機状態" className="stage-waiting-room">
      <h1>{eventTitle}</h1>
      <p>開始をお待ちください</p>
      {qrSvg && <div aria-label="参加用QRコード" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
      {joinUrl && <p>{joinUrl}</p>}
    </div>
  );
}
