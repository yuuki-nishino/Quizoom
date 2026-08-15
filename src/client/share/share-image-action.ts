/** Web Share API（ファイル共有）が利用可能な環境かどうかを判定する */
export function canUseWebShare(nav: { readonly share?: unknown; readonly canShare?: unknown }): boolean {
  return typeof nav.share === "function" && typeof nav.canShare === "function";
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/**
 * 画像として保存する操作。Web Share API が利用可能な環境では共有シートを、
 * 非対応環境ではダウンロードを提供する（要件8.14 の「保存・共有」を1つの操作で満たす）。
 */
export async function shareOrDownloadImage(dataUrl: string, filename: string): Promise<void> {
  if (canUseWebShare(navigator)) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: blob.type || "image/png" });
      const nav = navigator as Navigator & {
        canShare(data: { files: readonly File[] }): boolean;
        share(data: { files: readonly File[]; title?: string }): Promise<void>;
      };
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: filename });
        return;
      }
    } catch {
      // 共有に失敗した場合はダウンロードへフォールバックする
    }
  }
  downloadDataUrl(dataUrl, filename);
}
