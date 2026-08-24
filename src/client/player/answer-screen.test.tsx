import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnswerScreen } from "./answer-screen";
import type { QuestionPublicView } from "../../shared/protocol";
import type { AnswerSubmissionState } from "./answer-submission";
import type { OptionId, QuestionId } from "../../shared/domain-types";

const question: QuestionPublicView = {
  id: "q1" as QuestionId,
  orderIndex: 0,
  body: "日本の首都は？",
  imageAssetId: null,
  options: [
    { id: "o1" as OptionId, label: "大阪", orderIndex: 0 },
    { id: "o2" as OptionId, label: "東京", orderIndex: 1 },
  ],
};

const idle: AnswerSubmissionState = { status: "idle" };

describe("AnswerScreen", () => {
  it("shows the question body, remaining seconds, and enabled tappable options when idle", () => {
    const markup = renderToStaticMarkup(
      <AnswerScreen question={question} imageUrl={null} remainingMs={7400} paused={false} alreadyAnswered={false} submission={idle} onSelect={() => {}} onRetry={() => {}} />,
    );
    expect(markup).toContain("日本の首都は？");
    expect(markup).toContain("8秒");
    expect(markup).toContain("東京");
    expect(markup).not.toContain('disabled=""');
  });

  it("indicates the paused state", () => {
    const markup = renderToStaticMarkup(
      <AnswerScreen question={question} imageUrl={null} remainingMs={5000} paused={true} alreadyAnswered={false} submission={idle} onSelect={() => {}} onRetry={() => {}} />,
    );
    expect(markup).toContain("一時停止中");
  });

  it("disables all options and shows a sending indicator while pending", () => {
    const pending: AnswerSubmissionState = { status: "pending", questionId: "q1" as QuestionId, optionId: "o2" as OptionId };
    const markup = renderToStaticMarkup(
      <AnswerScreen question={question} imageUrl={null} remainingMs={5000} paused={false} alreadyAnswered={false} submission={pending} onSelect={() => {}} onRetry={() => {}} />,
    );
    expect(markup).toContain("送信中");
    expect(markup.match(/disabled=""/g)?.length).toBe(2);
  });

  it("shows an accepted confirmation with the chosen label once accepted", () => {
    const accepted: AnswerSubmissionState = { status: "accepted", questionId: "q1" as QuestionId, optionId: "o2" as OptionId };
    const markup = renderToStaticMarkup(
      <AnswerScreen question={question} imageUrl={null} remainingMs={5000} paused={false} alreadyAnswered={false} submission={accepted} onSelect={() => {}} onRetry={() => {}} />,
    );
    expect(markup).toContain("回答を受け付けました（東京）");
    expect(markup).toContain("<svg");
  });

  it("locks the options and shows a generic accepted message when already answered from a prior connection", () => {
    const markup = renderToStaticMarkup(
      <AnswerScreen question={question} imageUrl={null} remainingMs={5000} paused={false} alreadyAnswered={true} submission={idle} onSelect={() => {}} onRetry={() => {}} />,
    );
    expect(markup).toContain("回答を受け付けました");
    expect(markup.match(/disabled=""/g)?.length).toBe(2);
  });

  it("shows the ANSWER_WINDOW_CLOSED message when rejected for a late submission", () => {
    const rejected: AnswerSubmissionState = {
      status: "rejected",
      questionId: "q1" as QuestionId,
      optionId: "o1" as OptionId,
      code: "ANSWER_WINDOW_CLOSED",
    };
    const markup = renderToStaticMarkup(
      <AnswerScreen question={question} imageUrl={null} remainingMs={0} paused={false} alreadyAnswered={false} submission={rejected} onSelect={() => {}} onRetry={() => {}} />,
    );
    expect(markup).toContain("受付が終了しているため");
  });

  it("shows a retry button and failure message when the send failed, and keeps options disabled until retried", () => {
    const failed: AnswerSubmissionState = { status: "failed", questionId: "q1" as QuestionId, optionId: "o1" as OptionId };
    const markup = renderToStaticMarkup(
      <AnswerScreen question={question} imageUrl={null} remainingMs={5000} paused={false} alreadyAnswered={false} submission={failed} onSelect={() => {}} onRetry={() => {}} />,
    );
    expect(markup).toContain("送信に失敗しました");
    expect(markup).toContain("再送信する");
    expect(markup.match(/disabled=""/g)?.length).toBe(2);
  });

  it("renders the attached image when an imageUrl is provided", () => {
    const markup = renderToStaticMarkup(
      <AnswerScreen question={question} imageUrl="/api/events/e1/media/a1?token=t" remainingMs={5000} paused={false} alreadyAnswered={false} submission={idle} onSelect={() => {}} onRetry={() => {}} />,
    );
    expect(markup).toContain('src="/api/events/e1/media/a1?token=t"');
  });
});
