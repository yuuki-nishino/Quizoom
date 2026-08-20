import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultsPanel } from "./results-panel";
import { unimplementedApiClient } from "./test-fixtures";
import type { EventId } from "../../shared/domain-types";

describe("ResultsPanel", () => {
  it("shows a loading state before the initial fetch resolves", () => {
    const markup = renderToStaticMarkup(
      <ResultsPanel apiClient={unimplementedApiClient()} eventId={"e1" as EventId} role="owner" />,
    );
    expect(markup).toContain("読み込み中");
  });
});
