import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CollaboratorPanel } from "./collaborator-panel";
import { unimplementedApiClient } from "./test-fixtures";
import type { EventId } from "../../shared/domain-types";

describe("CollaboratorPanel", () => {
  it("shows only a leave action for a collaborator, with no invite form", () => {
    const markup = renderToStaticMarkup(
      <CollaboratorPanel apiClient={unimplementedApiClient()} eventId={"e1" as EventId} role="collaborator" onLeft={() => {}} />,
    );
    expect(markup).toContain("共同運営から離脱する");
    expect(markup).not.toContain("招待するメールアドレス");
  });

  it("shows the invite form and no leave action for the owner", () => {
    const markup = renderToStaticMarkup(
      <CollaboratorPanel apiClient={unimplementedApiClient()} eventId={"e1" as EventId} role="owner" onLeft={() => {}} />,
    );
    expect(markup).toContain("招待するメールアドレス");
    expect(markup).not.toContain("共同運営から離脱する");
  });
});
