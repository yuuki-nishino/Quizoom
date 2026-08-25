import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WaitingRoom } from "./waiting-room";

describe("WaitingRoom", () => {
  it("shows the event title and join URL", () => {
    const markup = renderToStaticMarkup(
      <WaitingRoom eventTitle="Quiz Night" joinUrl="https://quizoom.example.com/join/ABC123" participantCount={0} />,
    );
    expect(markup).toContain("Quiz Night");
    expect(markup).toContain("https://quizoom.example.com/join/ABC123");
  });

  it("omits the join URL text when not yet available", () => {
    const markup = renderToStaticMarkup(<WaitingRoom eventTitle="Quiz Night" joinUrl={null} participantCount={0} />);
    expect(markup).toContain("Quiz Night");
    expect(markup).not.toContain("join");
  });

  it("shows the current participant count", () => {
    const markup = renderToStaticMarkup(<WaitingRoom eventTitle="Quiz Night" joinUrl={null} participantCount={3} />);
    expect(markup).toContain("現在の参加者数");
    expect(markup).toContain(">3<");
  });

  it("explains how scoring works, without hiding the title, QR code, or participant count（要件5.1, 5.2, 5.3）", () => {
    const markup = renderToStaticMarkup(
      <WaitingRoom eventTitle="Quiz Night" joinUrl="https://quizoom.example.com/join/ABC123" participantCount={3} />,
    );
    expect(markup).toMatch(/正解数|回答時間|順位/);
    expect(markup).toContain("Quiz Night");
    expect(markup).toContain("https://quizoom.example.com/join/ABC123");
    expect(markup).toContain("現在の参加者数");
  });
});
