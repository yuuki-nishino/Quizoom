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
    return (
      <p role="alert" className="flex min-h-screen items-center justify-center px-6 text-center text-red-700">
        共有URLが無効です。
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className="flex min-h-screen items-center justify-center px-6 text-center text-red-700">
        {ERROR_MESSAGES[error] ?? `エラーが発生しました（${error}）。`}
      </p>
    );
  }
  if (!result) {
    return <p className="flex min-h-screen items-center justify-center text-slate-500">読み込み中…</p>;
  }

  return (
    <ThemeProvider theme={result.theme}>
      <section aria-label="結果共有" className="flex min-h-screen flex-col items-center gap-2 px-6 py-10 text-center">
        <h1 className="text-2xl font-bold text-brand-primary">{result.eventTitle}</h1>
        <h2 className="text-lg font-semibold text-brand-text/80">最終ランキング</h2>
        <RankingList entries={result.entries} />
        <button
          type="button"
          disabled={savingImage}
          onClick={handleSaveImage}
          className="mt-6 rounded-lg bg-brand-primary px-5 py-2.5 font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          画像として保存
        </button>
      </section>
    </ThemeProvider>
  );
}
