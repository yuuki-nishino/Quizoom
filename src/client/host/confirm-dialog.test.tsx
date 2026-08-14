import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  it("renders the title, message, and a default confirm label", () => {
    const markup = renderToStaticMarkup(
      <ConfirmDialog title="削除しますか？" message="対象: サンプルイベント" onCancel={() => {}} onConfirm={() => {}} />,
    );
    expect(markup).toContain("削除しますか？");
    expect(markup).toContain("対象: サンプルイベント");
    expect(markup).toContain("実行する");
    expect(markup).toContain("キャンセル");
  });

  it("renders a custom confirm label when provided", () => {
    const markup = renderToStaticMarkup(
      <ConfirmDialog title="t" message="m" confirmLabel="削除する" onCancel={() => {}} onConfirm={() => {}} />,
    );
    expect(markup).toContain("削除する");
  });
});
