import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnswerScreen } from "./answer-screen";
import type { QuestionPublicView } from "../../shared/protocol";
import type { AnswerSubmissionState } from "./answer-submission";
import type { AssetId, OptionId, QuestionId } from "../../shared/domain-types";
import { PRACTICE_QUESTION_ID } from "../../shared/practice-question";

const question: QuestionPublicView = {
  id: "q1" as QuestionId,
  orderIndex: 0,
  body: "日本の首都は？",
  imageAssetId: null,
  options: [
    { id: "o1" as OptionId, label: "大阪", orderIndex: 0, imageAssetId: null },
    { id: "o2" as OptionId, label: "東京", orderIndex: 1, imageAssetId: null },
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

  it("shows a テスト問題 badge when answering the practice question（要件3.3）", () => {
    const practiceQuestion: QuestionPublicView = { ...question, id: PRACTICE_QUESTION_ID };
    const markup = renderToStaticMarkup(
      <AnswerScreen question={practiceQuestion} imageUrl={null} remainingMs={5000} paused={false} alreadyAnswered={false} submission={idle} onSelect={() => {}} onRetry={() => {}} />,
    );
    expect(markup).toContain("テスト問題");
  });

  it("does not show the badge for a real question", () => {
    const markup = renderToStaticMarkup(
      <AnswerScreen question={question} imageUrl={null} remainingMs={5000} paused={false} alreadyAnswered={false} submission={idle} onSelect={() => {}} onRetry={() => {}} />,
    );
    expect(markup).not.toContain("テスト問題");
  });
});

describe("AnswerScreen with option images (provisional, Issue #36)", () => {
  const imageQuestion = (count: 2 | 4, imageIdx: readonly number[] = [0, 1, 2, 3]): QuestionPublicView => ({
    ...question,
    options: ["りんご", "みかん", "ぶどう", "もも"].slice(0, count).map((label, i) => ({
      id: `o${i + 1}` as OptionId,
      label,
      orderIndex: i,
      imageAssetId: imageIdx.includes(i) ? (`img${i + 1}` as AssetId) : null,
    })),
  });
  const urls = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`o${i + 1}`, `/media/img${i + 1}?token=t`]));
  const render = (q: QuestionPublicView, optionImageUrls: Record<string, string | null>, submission: AnswerSubmissionState = idle) =>
    renderToStaticMarkup(
      <AnswerScreen question={q} imageUrl={null} optionImageUrls={optionImageUrls} remainingMs={9000} paused={false} alreadyAnswered={false} submission={submission} onSelect={() => {}} onRetry={() => {}} />,
    );

  it("shows each option's image inside its tappable button, together with the text", () => {
    const markup = render(imageQuestion(4), urls(4));
    expect((markup.match(/<img/g) ?? []).length).toBe(4);
    expect(markup).toMatch(/<button[^>]*>(?:(?!<\/button>).)*src="\/media\/img1\?token=t"(?:(?!<\/button>).)*りんご/s);
    expect((markup.match(/<button/g) ?? []).length).toBe(4);
  });

  it("lays image options out in two columns so four options fit a phone", () => {
    expect(render(imageQuestion(4), urls(4))).toMatch(/class="player-options[^"]*grid-cols-2[^"]*"/);
    expect(render(imageQuestion(2), urls(2))).toMatch(/class="player-options[^"]*grid-cols-2[^"]*"/);
  });

  it("keeps the text-only layout (one column) for questions without option images", () => {
    const markup = render(question, {});
    expect(markup).toMatch(/class="player-options[^"]*grid-cols-1[^"]*"/);
    expect(markup).not.toContain("<img");
  });

  it("shows options without an image as text-only buttons in a mixed question", () => {
    // 実際のアプリと同じく、画像のある選択肢にだけURLを解決して渡す
    const markup = render(imageQuestion(4, [1, 3]), { o2: "/media/img2?token=t", o4: "/media/img4?token=t" });
    expect((markup.match(/<img/g) ?? []).length).toBe(2);
    expect(markup).toContain("りんご");
    expect(markup).toContain("ぶどう");
  });

  it("keeps the selected state and the accepted confirmation with image options", () => {
    const accepted: AnswerSubmissionState = { status: "accepted", questionId: "q1" as QuestionId, optionId: "o2" as OptionId };
    const markup = render(imageQuestion(4), urls(4), accepted);
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("回答を受け付けました（みかん）");
  });
});

