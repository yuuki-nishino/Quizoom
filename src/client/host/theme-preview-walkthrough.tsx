import { useState, type ReactNode } from "react";
import type { OptionId, ParticipantId, QuestionId, ThemeSettings } from "../../shared/domain-types";
import type { QuestionPublicView } from "../../shared/protocol";
import { ThemeProvider } from "../shared/theme";
import { WaitingRoom } from "../stage/waiting-room";
import { QuestionView } from "../stage/question-view";
import { RevealView } from "../stage/reveal-view";
import { RankingView } from "../stage/ranking-view";
import { NicknameForm } from "../player/nickname-form";
import { WaitingScreen } from "../player/waiting-screen";
import { AnswerScreen } from "../player/answer-screen";
import { ResultScreen } from "../player/result-screen";

/** 主催者自身の設問(実データ)をプレビューへ差し込むための入力。無い場合はサンプル設問にフォールバックする */
export interface PreviewQuestion {
  readonly question: QuestionPublicView;
  readonly correctOptionId: OptionId;
  readonly imageUrl: string | null;
}

export interface ThemePreviewWalkthroughProps {
  readonly eventTitle: string;
  readonly theme: ThemeSettings;
  readonly logoImageUrl: string | null;
  readonly backgroundImageUrl: string | null;
  readonly question?: PreviewQuestion | null;
}

const SAMPLE_QUESTION: QuestionPublicView = {
  id: "preview-q1" as QuestionId,
  orderIndex: 0,
  body: "日本の首都はどこでしょう？",
  imageAssetId: null,
  options: [
    { id: "preview-o1" as OptionId, label: "大阪", orderIndex: 0 },
    { id: "preview-o2" as OptionId, label: "東京", orderIndex: 1 },
  ],
};

const SAMPLE_QUESTION_PREVIEW: PreviewQuestion = {
  question: SAMPLE_QUESTION,
  correctOptionId: SAMPLE_QUESTION.options[1]!.id,
  imageUrl: null,
};

const SAMPLE_RANKING = [
  { participantId: "preview-p1" as ParticipantId, nickname: "たろう", correctCount: 3, totalElapsedMs: 12000, joinedSeq: 0, rank: 1 },
  { participantId: "preview-p2" as ParticipantId, nickname: "はなこ", correctCount: 2, totalElapsedMs: 15400, joinedSeq: 1, rank: 2 },
];

interface WalkthroughStep {
  readonly group: "投影画面" | "回答画面";
  readonly label: string;
  readonly render: () => ReactNode;
}

function buildSteps(eventTitle: string, preview: PreviewQuestion): readonly WalkthroughStep[] {
  const { question, correctOptionId, imageUrl } = preview;
  const distribution = question.options.map((option) => ({ optionId: option.id, count: option.id === correctOptionId ? 2 : 1 }));

  return [
    {
      group: "投影画面",
      label: "待機",
      render: () => <WaitingRoom eventTitle={eventTitle} joinUrl="https://example.com/join/PREVIEW" participantCount={3} />,
    },
    {
      group: "投影画面",
      label: "出題",
      render: () => <QuestionView question={question} imageUrl={imageUrl} remainingMs={18000} paused={false} answeredCount={2} totalCount={3} />,
    },
    {
      group: "投影画面",
      label: "正解発表",
      render: () => (
        <RevealView
          question={question}
          closed={{
            questionId: question.id,
            correctOptionId,
            distribution,
            explanation: "解説文はここに表示されます。",
            personalResult: null,
          }}
        />
      ),
    },
    { group: "投影画面", label: "中間ランキング", render: () => <RankingView entries={SAMPLE_RANKING} isFinal={false} /> },
    { group: "投影画面", label: "最終ランキング", render: () => <RankingView entries={SAMPLE_RANKING} isFinal={true} /> },
    {
      group: "回答画面",
      label: "ニックネーム入力",
      render: () => <NicknameForm eventTitle={eventTitle} submitting={false} errorCode={null} onSubmit={() => {}} />,
    },
    { group: "回答画面", label: "開始待ち", render: () => <WaitingScreen nickname="たろう" /> },
    {
      group: "回答画面",
      label: "出題",
      render: () => (
        <AnswerScreen
          question={question}
          imageUrl={imageUrl}
          remainingMs={18000}
          paused={false}
          alreadyAnswered={false}
          submission={{ status: "accepted", questionId: question.id, optionId: correctOptionId }}
          onSelect={() => {}}
          onRetry={() => {}}
        />
      ),
    },
    {
      group: "回答画面",
      label: "結果",
      render: () => (
        <ResultScreen
          personalResult={{ isCorrect: true, correctCount: 3, rank: 1 }}
          personalRank={{ rank: 1, correctCount: 3, totalElapsedMs: 12000, isFinal: true }}
        />
      ),
    },
  ];
}

/**
 * 投影画面・回答画面それぞれの実コンポーネントを、主催者自身の設問(画像を含む)で描画し、
 * 「次へ／前へ」で全状態を順に確認できるプレビュー（要件3.5, 3.8）。
 * 独自のミニレイアウトを持たないため、実画面との見た目の乖離が構造的に発生しない
 */
export function ThemePreviewWalkthrough({ eventTitle, theme, logoImageUrl, backgroundImageUrl, question }: ThemePreviewWalkthroughProps) {
  const steps = buildSteps(eventTitle, question ?? SAMPLE_QUESTION_PREVIEW);
  const [index, setIndex] = useState(0);
  const step = steps[index]!;

  return (
    <div aria-label="プレビュー" className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← 前へ
        </button>
        <p aria-live="polite" className="text-sm font-medium text-slate-700">
          {step.group}: {step.label}（{index + 1}/{steps.length}）
        </p>
        <button
          type="button"
          disabled={index === steps.length - 1}
          onClick={() => setIndex((i) => i + 1)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          次へ →
        </button>
      </div>

      <div className="mt-3 h-[30rem] overflow-auto rounded-lg border border-slate-200">
        <ThemeProvider theme={theme} logoImageUrl={logoImageUrl} backgroundImageUrl={backgroundImageUrl}>
          {step.render()}
        </ThemeProvider>
      </div>
    </div>
  );
}
