import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Confetti } from "./confetti";

describe("Confetti", () => {
  it("renders nothing when inactive", () => {
    const markup = renderToStaticMarkup(
      <div>
        <Confetti active={false} />
      </div>,
    );

    expect(markup).not.toContain("quiz-confetti");
  });

  it("renders a one-shot set of confetti pieces when active", () => {
    const markup = renderToStaticMarkup(
      <div>
        <Confetti active={true} />
      </div>,
    );

    expect(markup).toContain("quiz-confetti");
    expect((markup.match(/quiz-confetti-piece/g) ?? []).length).toBeGreaterThan(0);
  });

  it("is marked aria-hidden so it does not interfere with assistive technology", () => {
    const markup = renderToStaticMarkup(
      <div>
        <Confetti active={true} />
      </div>,
    );

    expect(markup).toContain('aria-hidden="true"');
  });
});

// `prefers-reduced-motion` 下での抑制は styles.css の `.quiz-confetti { display: none }` ルール
// (CSSのみで実現、要件5.2)で担保する。このプロジェクトのテスト実行環境(Workers runtime, SSR文字列
// レンダリングのみ)にはメディアクエリを評価できるDOMが無いため、実際の抑制確認はタスク9.3の
// ブラウザ目視確認で行う。
