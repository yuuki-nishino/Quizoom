import { useEffect, useRef, useState, type ReactNode } from "react";
import type { OptionId, ParticipantId, QuestionId, ThemeSettings } from "../../shared/domain-types";
import type { QuestionPublicView } from "../../shared/protocol";
import { PreviewStageFrame, previewFrameConfig, type WalkthroughStepGroup } from "./preview-stage-frame";
import { hasChoiceImages } from "../../shared/choice-image-spec";
import { WaitingRoom } from "../stage/waiting-room";
import { QuestionView } from "../stage/question-view";
import { RevealView } from "../stage/reveal-view";
import { RankingView } from "../stage/ranking-view";
import { StageSafeArea } from "../stage/safe-area";
import { NicknameForm } from "../player/nickname-form";
import { WaitingScreen } from "../player/waiting-screen";
import { AnswerScreen } from "../player/answer-screen";
import { FinalResultScreen } from "../player/result-screen";

/** 主催者自身の設問(実データ)をプレビューへ差し込むための入力。無い場合はサンプル設問にフォールバックする */
export interface PreviewQuestion {
  readonly question: QuestionPublicView;
  readonly correctOptionId: OptionId;
  readonly imageUrl: string | null;
  /** 選択肢IDごとの画像URL(画像のある選択肢のみ)。省略時は選択肢画像なし */
  readonly optionImageUrls?: Readonly<Record<string, string | null>>;
  /** 正解発表に表示する解説文。省略時はサンプルの解説文 */
  readonly explanation?: string;
}

export interface ThemePreviewWalkthroughProps {
  readonly eventTitle: string;
  readonly theme: ThemeSettings;
  readonly logoImageUrl: string | null;
  readonly backgroundImageUrl: string | null;
  /** イベントに登録された全設問(順序どおり)。空の場合はサンプル設問にフォールバックする（要件3.14） */
  readonly questions?: readonly PreviewQuestion[];
}

const SAMPLE_QUESTION: QuestionPublicView = {
  id: "preview-q1" as QuestionId,
  orderIndex: 0,
  body: "日本の首都はどこでしょう？",
  imageAssetId: null,
  options: [
    { id: "preview-o1" as OptionId, label: "大阪", orderIndex: 0, imageAssetId: null },
    { id: "preview-o2" as OptionId, label: "東京", orderIndex: 1, imageAssetId: null },
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

export interface WalkthroughStep {
  readonly group: WalkthroughStepGroup;
  readonly label: string;
  /** 選択肢画像付きの出題・正解発表。画面高に固定した枠で描画する */
  readonly fitViewport?: boolean;
  readonly render: () => ReactNode;
}

export { previewFrameConfig };
export type { WalkthroughStepGroup };

/** 選択中インデックスの設問を返す。範囲外や未選択時は先頭の設問、設問が1件もない場合はサンプル設問へ落ちる（要件3.14） */
export function resolveActiveQuestion(questions: readonly PreviewQuestion[], questionIndex: number): PreviewQuestion {
  return questions[questionIndex] ?? questions[0] ?? SAMPLE_QUESTION_PREVIEW;
}

export function buildWalkthroughSteps(eventTitle: string, preview: PreviewQuestion): readonly WalkthroughStep[] {
  const { question, correctOptionId, imageUrl, optionImageUrls = {}, explanation = "解説文はここに表示されます。" } = preview;
  const fitViewport = hasChoiceImages(question.options);
  const distribution = question.options.map((option) => ({ optionId: option.id, count: option.id === correctOptionId ? 2 : 1 }));

  return [
    {
      group: "投影画面",
      label: "待機",
      render: () => (
        <StageSafeArea>
          <WaitingRoom eventTitle={eventTitle} joinUrl="https://example.com/join/PREVIEW" participantCount={3} />
        </StageSafeArea>
      ),
    },
    {
      group: "投影画面",
      label: "出題",
      fitViewport,
      render: () => (
        <StageSafeArea>
          <QuestionView question={question} imageUrl={imageUrl} optionImageUrls={optionImageUrls} remainingMs={18000} paused={false} answeredCount={2} totalCount={3} />
        </StageSafeArea>
      ),
    },
    {
      group: "投影画面",
      label: "正解発表",
      fitViewport,
      render: () => (
        <StageSafeArea>
          <RevealView
            question={question}
            optionImageUrls={optionImageUrls}
            closed={{
              questionId: question.id,
              correctOptionId,
              distribution,
              explanation,
              personalResult: null,
            }}
          />
        </StageSafeArea>
      ),
    },
    {
      group: "投影画面",
      label: "中間ランキング",
      render: () => (
        <StageSafeArea>
          <RankingView entries={SAMPLE_RANKING} isFinal={false} revealStep={null} />
        </StageSafeArea>
      ),
    },
    {
      group: "投影画面",
      label: "最終ランキング",
      render: () => (
        <StageSafeArea>
          <RankingView entries={SAMPLE_RANKING} isFinal={true} revealStep={0} />
        </StageSafeArea>
      ),
    },
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
          optionImageUrls={optionImageUrls}
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
        <FinalResultScreen personalRank={{ rank: 1, correctCount: 3, totalElapsedMs: 12000, isFinal: true }} />
      ),
    },
  ];
}

/**
 * 投影画面・回答画面それぞれの実コンポーネントを、主催者自身の設問(画像を含む)で描画し、
 * 「次へ／前へ」で全状態を順に確認できるプレビュー（要件3.5, 3.8）。
 * 独自のミニレイアウトを持たないため、実画面との見た目の乖離が構造的に発生しない
 */
export function ThemePreviewWalkthrough({ eventTitle, theme, logoImageUrl, backgroundImageUrl, questions = [] }: ThemePreviewWalkthroughProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const activeQuestion = resolveActiveQuestion(questions, questionIndex);
  const steps = buildWalkthroughSteps(eventTitle, activeQuestion);
  const [index, setIndex] = useState(0);
  const step = steps[index]!;

  // 表示枠はステップをまたいで同一のDOM要素を使い回すため、スクロール位置も引き継がれてしまう。
  // ステップが切り替わるたびに先頭へ戻し、前のステップのスクロール位置で新しい内容が隠れないようにする
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    frameRef.current?.scrollTo(0, 0);
  }, [index, questionIndex]);

  return (
    <div aria-label="プレビュー" className="mt-6">
      {questions.length > 0 && (
        <label className="mb-3 block text-sm font-medium text-slate-700">
          プレビューする設問
          <select
            value={questionIndex}
            onChange={(e) => setQuestionIndex(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
          >
            {questions.map((q, i) => (
              <option key={q.question.id} value={i}>
                第{i + 1}問: {q.question.body}
              </option>
            ))}
          </select>
        </label>
      )}

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

      {/* 投影画面は実際のプロジェクター投影(16:9・1280×720想定)を、回答画面はスマートフォン(390×844想定)を模した
          実寸でフェーズ画面コンポーネントを描画したうえで、表示サイズへ縮小する（要件3.11, 3.12）。
          実際のサイズのまま縮小せずに枠へ収めると内容が見切れてしまうため、内側を基準サイズで描画してscaleする */}
      <PreviewStageFrame
        group={step.group}
        theme={theme}
        logoImageUrl={logoImageUrl}
        backgroundImageUrl={backgroundImageUrl}
        fitViewport={step.fitViewport ?? false}
        frameRef={frameRef}
      >
        {step.render()}
      </PreviewStageFrame>
    </div>
  );
}
