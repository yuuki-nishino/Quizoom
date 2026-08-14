import { toString as qrcodeToString } from "qrcode";

/**
 * 参加用URLをSVGマークアップとしてQRコード化する。ラスタ画像(canvas/PNG)ではなくSVGを選ぶことで、
 * 印刷用・投影用のいずれでも拡大時ににじまない同一の生成物を1つの経路で提供する（要件4.2）。
 */
export async function generateQrCodeSvg(text: string): Promise<string> {
  return qrcodeToString(text, { type: "svg", margin: 1 });
}
