import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WaitingScreen } from "./waiting-screen";

describe("WaitingScreen", () => {
  it("shows the nickname and a waiting message", () => {
    const markup = renderToStaticMarkup(<WaitingScreen nickname="alice" />);
    expect(markup).toContain("alice");
    expect(markup).toContain("開始をお待ちください");
  });
});
