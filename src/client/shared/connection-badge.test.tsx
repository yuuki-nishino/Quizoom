import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectionBadge } from "./connection-badge";
import type { ConnectionStatus } from "./use-live-channel";

describe("ConnectionBadge", () => {
  it.each<[ConnectionStatus, string]>([
    ["connecting", "接続中"],
    ["open", "接続済み"],
    ["reconnecting", "再接続中"],
    ["closed", "切断されました"],
  ])("renders a Japanese label for status=%s", (status, expectedText) => {
    const markup = renderToStaticMarkup(<ConnectionBadge status={status} />);
    expect(markup).toContain(expectedText);
  });

  it("uses the ok tone only when open", () => {
    expect(renderToStaticMarkup(<ConnectionBadge status="open" />)).toContain("connection-badge--ok");
    expect(renderToStaticMarkup(<ConnectionBadge status="closed" />)).toContain("connection-badge--danger");
    expect(renderToStaticMarkup(<ConnectionBadge status="reconnecting" />)).toContain("connection-badge--warn");
  });
});
