import { useEffect, useState } from "react";
import { parseShareRoute } from "./route";
import { fetchPublicResult } from "./share-api-client";
import type { PublicResult } from "../../shared/domain-types";
import { ThemeProvider } from "../shared/theme";
import { RankingList } from "./ranking-list";
import { computeRankingImageLayout } from "./ranking-image-layout";
import { generateRankingImageDataUrl } from "./ranking-image";
import { shareOrDownloadImage } from "./share-image-action";

const ERROR_MESSAGES: Record<string, string> = {
  SHARING_DISABLED: "この結果の共有は終了しています。",
  NOT_FOUND: "指定された共有ページが見つかりません。",
};

/** 結果共有ページのルート。認証不要・WebSocketを使わない単発フェッチで完結する（要件8.12, 8.14, 10.8） */
export function ShareApp() {
  const route = parseShareRoute(window.location.pathname);
  const [result, setResult] = useState<PublicResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingImage, setSavingImage] = useState(false);

  useEffect(() => {
    if (!route) return;
    let cancelled = false;
    fetchPublicResult(route.shareCode).then((res) => {
      if (cancelled) return;
      if (res.ok) setResult(res.value);
      else setError(res.code);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.shareCode]);

  async function handleSaveImage() {
    if (!result) return;
    setSavingImage(true);
    const layout = computeRankingImageLayout(result);
    const dataUrl = generateRankingImageDataUrl(layout);
    if (dataUrl) {
      await shareOrDownloadImage(dataUrl, `${result.eventTitle}-ranking.png`);
    }
    setSavingImage(false);
  }

  if (!route) {
    return <p role="alert">共有URLが無効です。</p>;
  }
  if (error) {
    return <p role="alert">{ERROR_MESSAGES[error] ?? `エラーが発生しました（${error}）。`}</p>;
  }
  if (!result) {
    return <p>読み込み中…</p>;
  }

  return (
    <ThemeProvider theme={result.theme}>
      <section aria-label="結果共有">
        <h1>{result.eventTitle}</h1>
        <h2>最終ランキング</h2>
        <RankingList entries={result.entries} />
        <button type="button" disabled={savingImage} onClick={handleSaveImage}>
          画像として保存
        </button>
      </section>
    </ThemeProvider>
  );
}
