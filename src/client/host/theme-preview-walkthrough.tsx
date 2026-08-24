import { useEffect, useRef, useState, type ReactNode } from "react";
import type { OptionId, ParticipantId, QuestionId, ThemeSettings } from "../../shared/domain-types";
import type { QuestionPublicView } from "../../shared/protocol";
import { ThemeProvider } from "../shared/theme";
import { WaitingRoom } from "../stage/waiting-room";
import { QuestionView } from "../stage/question-view";
import { RevealView } from "../stage/reveal-view";
import { RankingView } from "../stage/ranking-view";
import { StageSafeArea } from "../stage/safe-area";
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
  /** イベントに登録された全設問(順序どおり)。空の場合はサンプル設問にフォールバックする（要件3.14） */
  readonly questions?: readonly PreviewQuestion[];
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

export type WalkthroughStepGroup = "投影画面" | "回答画面";

interface WalkthroughStep {
  readonly group: WalkthroughStepGroup;
  readonly label: string;
  readonly render: () => ReactNode;
}

export interface PreviewFrameConfig {
  /** 実際の投影/端末を想定した描画基準サイズ(px)。フェーズ画面コンポーネントはこのサイズで実寸描画する */
  readonly referenceWidth: number;
  readonly referenceHeight: number;
  /** プレビュー上での表示サイズ(px) */
  readonly displayWidth: number;
  readonly displayHeight: number;
  /** referenceサイズをdisplayサイズへ縮小する倍率(transform: scaleに使う) */
  readonly scale: number;
  readonly frameClassName: string;
}

/**
 * 投影画面は16:9(1920×1080=Full HDを想定)、回答画面はスマートフォン(390×844を想定)の実寸で
 * フェーズ画面コンポーネントを描画したうえで、表示サイズへ縮小する設定を返す純粋関数（要件3.11, 3.12）。
 * アスペクト比の入れ物を用意するだけでなく、実寸コンテンツを縮小表示することで、
 * 実際のサイズのままだと収まりきらず見切れてしまう問題を防ぐ。投影画面の基準解像度は、
 * 画像付き・4択の設問でもスクロールなしで全選択肢が収まる実測結果に基づき1920×1080とした
 * (1280×720では画像+4択で選択肢の一部が基準サイズ内に収まらなかった)。長い問題文等で
 * それでも基準サイズを超える場合は、表示枠自体をスクロールして続きを確認できるようにする
 * (サイレントなクリップを避ける)。
 */
export function previewFrameConfig(group: WalkthroughStepGroup): PreviewFrameConfig {
  if (group === "投影画面") {
    const referenceWidth = 1920;
    const referenceHeight = 1080;
    const displayWidth = 1200;
    return {
      referenceWidth,
      referenceHeight,
      displayWidth,
      displayHeight: Math.round((displayWidth * referenceHeight) / referenceWidth),
      scale: displayWidth / referenceWidth,
      frameClassName: "mx-auto mt-3 overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200",
    };
  }
  const referenceWidth = 390;
  const referenceHeight = 844;
  const displayWidth = 390;
  return {
    referenceWidth,
    referenceHeight,
    displayWidth,
    displayHeight: Math.round((displayWidth * referenceHeight) / referenceWidth),
    scale: displayWidth / referenceWidth,
    frameClassName: "mx-auto mt-3 overflow-y-auto overflow-x-hidden rounded-[2rem] border-8 border-slate-800",
  };
}

/** 選択中インデックスの設問を返す。範囲外や未選択時は先頭の設問、設問が1件もない場合はサンプル設問へ落ちる（要件3.14） */
export function resolveActiveQuestion(questions: readonly PreviewQuestion[], questionIndex: number): PreviewQuestion {
  return questions[questionIndex] ?? questions[0] ?? SAMPLE_QUESTION_PREVIEW;
}

function buildSteps(eventTitle: string, preview: PreviewQuestion): readonly WalkthroughStep[] {
  const { question, correctOptionId, imageUrl } = preview;
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
      render: () => (
        <StageSafeArea>
          <QuestionView question={question} imageUrl={imageUrl} remainingMs={18000} paused={false} answeredCount={2} totalCount={3} />
        </StageSafeArea>
      ),
    },
    {
      group: "投影画面",
      label: "正解発表",
      render: () => (
        <StageSafeArea>
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
        </StageSafeArea>
      ),
    },
    {
      group: "投影画面",
      label: "中間ランキング",
      render: () => (
        <StageSafeArea>
          <RankingView entries={SAMPLE_RANKING} isFinal={false} />
        </StageSafeArea>
      ),
    },
    {
      group: "投影画面",
      label: "最終ランキング",
      render: () => (
        <StageSafeArea>
          <RankingView entries={SAMPLE_RANKING} isFinal={true} />
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
export function ThemePreviewWalkthrough({ eventTitle, theme, logoImageUrl, backgroundImageUrl, questions = [] }: ThemePreviewWalkthroughProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const activeQuestion = resolveActiveQuestion(questions, questionIndex);
  const steps = buildSteps(eventTitle, activeQuestion);
  const [index, setIndex] = useState(0);
  const step = steps[index]!;
  const frame = previewFrameConfig(step.group);

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
      <div ref={frameRef} className={frame.frameClassName} style={{ width: frame.displayWidth, height: frame.displayHeight }}>
        <div style={{ width: frame.referenceWidth, height: frame.referenceHeight, transform: `scale(${frame.scale})`, transformOrigin: "top left" }}>
          <ThemeProvider theme={theme} templateId={theme.templateId} logoImageUrl={logoImageUrl} backgroundImageUrl={backgroundImageUrl}>
            {step.render()}
          </ThemeProvider>
        </div>
      </div>
    </div>
  );
}
