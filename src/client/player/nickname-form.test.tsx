import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NicknameForm } from "./nickname-form";

describe("NicknameForm", () => {
  it("shows the event title and a disabled submit button when nickname is empty", () => {
    const markup = renderToStaticMarkup(
      <NicknameForm eventTitle="Quiz Night" submitting={false} errorCode={null} onSubmit={() => {}} />,
    );
    expect(markup).toContain("Quiz Night");
    expect(markup).toContain("参加する");
    expect(markup).toContain("disabled=\"\"");
  });

  it("shows a Japanese message for a known error code", () => {
    const markup = renderToStaticMarkup(
      <NicknameForm eventTitle="Quiz Night" submitting={false} errorCode="NICKNAME_TAKEN" onSubmit={() => {}} />,
    );
    expect(markup).toContain("既に使われています");
  });

  it("falls back to a generic message for an unknown error code", () => {
    const markup = renderToStaticMarkup(
      <NicknameForm eventTitle="Quiz Night" submitting={false} errorCode="WEIRD_CODE" onSubmit={() => {}} />,
    );
    expect(markup).toContain("WEIRD_CODE");
  });
});
