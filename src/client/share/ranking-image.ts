import type { RankingImageLayout } from "./ranking-image-layout";

/** CanvasRenderingContext2D の部分集合。実物・フェイクの双方を注入可能にしてテストする */
export interface DrawingContext {
  fillStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
}

/**
 * ランキング画像を描画する。サーバー処理を伴わずクライアント側のCanvas描画のみで完結させる。
 * ロゴ・背景画像は使用せず、配色のみで当日の見た目との連続性を担保する。
 */
export function drawRankingImage(ctx: DrawingContext, layout: RankingImageLayout): void {
  ctx.fillStyle = layout.theme.backgroundColor;
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = layout.theme.textColor;
  ctx.font = "bold 32px sans-serif";
  ctx.fillText(layout.title, layout.width / 2, 48);

  ctx.font = "20px sans-serif";
  ctx.fillText(layout.subtitle, layout.width / 2, 88);

  ctx.textAlign = "left";
  for (const row of layout.rows) {
    ctx.fillStyle = layout.theme.accentColor;
    ctx.font = "bold 24px sans-serif";
    ctx.fillText(`${row.rank}位`, 32, row.y - 10);

    ctx.fillStyle = layout.theme.textColor;
    ctx.font = "22px sans-serif";
    ctx.fillText(row.nickname, 120, row.y - 10);

    ctx.font = "16px sans-serif";
    ctx.fillText(row.detail, 120, row.y + 14);
  }
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): DrawingContext | null;
  toDataURL(type?: string): string;
}

export type CanvasFactory = (width: number, height: number) => CanvasLike;

function defaultCanvasFactory(width: number, height: number): CanvasLike {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas as unknown as CanvasLike;
}

/** レイアウトからPNGのdata URLを生成する。2Dコンテキストが取得できない環境では null を返す */
export function generateRankingImageDataUrl(layout: RankingImageLayout, canvasFactory: CanvasFactory = defaultCanvasFactory): string | null {
  const canvas = canvasFactory(layout.width, layout.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  drawRankingImage(ctx, layout);
  return canvas.toDataURL("image/png");
}
