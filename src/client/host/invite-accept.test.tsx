import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InviteAccept } from "./invite-accept";
import { unimplementedApiClient } from "./test-fixtures";

describe("InviteAccept", () => {
  it("shows a loading state before the invite info resolves", () => {
    const markup = renderToStaticMarkup(<InviteAccept apiClient={unimplementedApiClient()} token="tok" onNavigate={() => {}} />);
    expect(markup).toContain("読み込み中");
  });
});
