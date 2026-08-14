import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventList } from "./event-list";
import { unimplementedApiClient } from "./test-fixtures";

describe("EventList", () => {
  it("shows a loading state before the initial fetch resolves", () => {
    const markup = renderToStaticMarkup(<EventList apiClient={unimplementedApiClient()} onOpenEvent={() => {}} />);
    expect(markup).toContain("読み込み中");
    expect(markup).toContain("マイイベント");
  });
});
