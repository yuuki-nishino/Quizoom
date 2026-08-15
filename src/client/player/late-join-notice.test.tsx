import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LateJoinNotice } from "./late-join-notice";

describe("LateJoinNotice", () => {
  it("shows the disadvantage message and a dismiss button", () => {
    const markup = renderToStaticMarkup(<LateJoinNotice onDismiss={() => {}} />);
    expect(markup).toContain("既に出題された設問には回答できず");
    expect(markup).toContain("閉じる");
  });
});
