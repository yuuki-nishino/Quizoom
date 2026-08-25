# Research & Design Decisions

## Summary
- **Feature**: `practice-question-mode`
- **Discovery Scope**: Extension（既存の `live-quiz-app` フェーズ機械・DO・採点ロジックへの拡張）
- **Key Findings**:
  - `PhaseMachine.next` は `LivePhase` と `PhaseContext.questions`（本編設問のスナップショット）のみを見て遷移を決める純粋関数であり、テスト問題を「`context.questions` に含まれない固定の `QuestionSnapshot`」として扱えば、`questionOpen`/`questionClosed`/`revealed` という既存の `LivePhase` バリアントをそのまま再利用できる。新しい `LivePhase` の種類を増やす必要がない。
  - `ScoringModule.aggregate` は `questions`（本編設問一覧）に存在する `questionId` の回答だけを正解数・合計回答時間の集計対象にする（`correctOptionByQuestion.get(...)` が `undefined` の回答は素通りでスキップされる）。テスト問題の `questionId` を本編設問一覧に含めなければ、採点・ランキングからの除外（要件4.1〜4.3）は既存ロジックの変更なしに成立する。
  - `QuizSessionDO#afterFinalize` は全回答（`listAllAnswers()`）を無条件に `result_answer` へ保存している。テスト問題の回答もここを素通りすると、存在しない設問IDに対する「常に不正解」の行が結果アーカイブに残ってしまう（要件4.4に抵触するリスク）。ここは明示的にテスト問題の回答を除外するフィルタを追加する必要がある。
  - 公開共有ページ（`findPublicByShareCode`）は `rank/nickname/correctCount/totalElapsedMs` のみを返し、設問別の正誤は返さない。したがって上記のアーカイブ側さえ塞げば、共有ページへの漏出経路はもともと存在しない。
  - Host Console の「出題する」ボタンは `phase.kind === "ready"` の間だけ活性化する1つのボタンであり、`nextQuestionId` がテスト問題かどうかで表示ラベルを出し分ければ、要件3.1（本編最初の設問を出題する操作とは別に、テスト問題を出題する操作を提供する）を新しいワイヤーコマンドなしで満たせる。`revealed` 後の「次の設問へ」ボタンも同様に、`closedQuestion.questionId` がテスト問題かどうかで分岐すれば要件3.7を満たせる。

## Research Log

### PhaseMachine のテスト問題対応方法
- **Context**: テスト問題の出題〜正解発表サイクルをどう `LivePhase` に表現するか。
- **Sources Consulted**: `src/server/session/phase-machine.ts`, `src/shared/domain-types.ts`
- **Findings**:
  - `lobby` → `startSession` で `ready.nextQuestionId` に「最初の設問ID」を積む一箇所だけが、本編突入前のゲートになっている。
  - `revealed` → `nextQuestion` で `findNextQuestionId` により次の設問IDを探す。見つからない場合は `NO_NEXT_QUESTION` エラー。
  - `ready` → `openQuestion` で `context.questions.find(...)!` により非nullアサーションで設問を取得している。
- **Implications**: テスト問題を `context.questions` に含めない固定値として扱うには、(a) `lobby`→`ready` 遷移でテスト問題ID/本編最初のIDを出し分ける、(b) `ready`→`questionOpen` でテスト問題IDのときは固定スナップショットを使う、(c) `revealed`→`nextQuestion` でテスト問題IDのときは明示的に本編最初のIDへ進める、の3箇所の分岐が必要。`PhaseContext` に `practiceEnabled: boolean` を追加する。

### 採点・ランキングからの除外の実現方法
- **Context**: テスト問題の回答が正解数・合計回答時間・ランキングに混入しないことを保証する方法。
- **Sources Consulted**: `src/shared/scoring.ts`, `src/server/session/quiz-session-do.ts`（`#afterRevealAnswer`, `#broadcastRanking`, `#afterFinalize`）
- **Findings**: `aggregate`/`rank` の呼び出しは常に `state.questions ?? []`（本編のみ）を渡しており、テスト問題の `questionId` がそこに存在しない限り自動的に除外される。既存コードのこの「不在による除外」パターンは意図的（`#afterFinalize` の `judgedAnswers` 生成でも同じ構造）。
- **Implications**: 採点ロジック自体は変更不要。テスト問題用の固定 `QuestionSnapshot` を本編のスナップショット配列に絶対に混入させないことが唯一の不変条件になる。

### 結果アーカイブからの除外
- **Context**: `result_answer` テーブルにテスト問題の回答が保存されないようにする方法。
- **Sources Consulted**: `src/server/results/archive.ts`（`save`）, `src/server/session/quiz-session-do.ts`（`#afterFinalize`）
- **Findings**: `#afterFinalize` は `this.#store.listAllAnswers()` を無条件に `judgedAnswers` へ変換して `saveResult` に渡している。ここにテスト問題の `questionId` を除外するフィルタが必要。
- **Implications**: `#afterFinalize` 内で `answers.filter((a) => a.questionId !== PRACTICE_QUESTION_ID)` を追加する。

### Host Console の操作導線
- **Context**: 要件3.1・3.7（テスト問題を出題する操作／本編最初の設問へ進む操作を別に提供する）を新規ワイヤーコマンドなしで満たせるか。
- **Sources Consulted**: `src/client/host/live-console.tsx`, `src/client/host/live-console-state.ts`
- **Findings**: 既存の `openQuestion`/`nextQuestion` コマンドはフェーズ（`ready`/`revealed`）だけで活性化が決まり、対象の設問IDには依存しない。ボタンの**表示ラベル**をテスト問題かどうかで出し分けるだけで、主催者からは「別の操作」に見える。
- **Implications**: `HostCommand`（`src/shared/protocol.ts`）に新しいコマンドを追加しない。`live-console-state.ts` に `isPracticeReady`/`isPracticeRevealed` 相当の判定関数を追加し、`live-console.tsx` 側でラベル・ボタン群を分岐する。

### イベント設定（EventMeta/D1）へのテスト問題モードフラグ追加
- **Context**: 要件1（イベント単位のON/OFF設定）の永続化方法。
- **Sources Consulted**: `src/server/catalog/repository.ts`, `src/server/catalog/schema.ts`, `migrations/0001_init.sql`, `migrations/0005_theme_template_id.sql`
- **Findings**: `event` テーブルに真偽値フラグを追加する新規マイグレーションが必要（`0005_theme_template_id.sql` が直近の前例）。`EventDetail`/`CreateEventInput`/`UpdateEventInput`/`EventMeta`（`domain-types.ts`）にフィールド追加が必要。`updateEvent` は現状ステータス問わず更新を許可しており、「開催中の変更禁止」（要件1.3）は `upsertQuestion` 等と同じ `status === "live"` ガードパターンをテスト問題フラグの更新にのみ限定して追加する（既存の title/subtitle/capacity 更新の挙動は変えない）。
- **Implications**: publish 時の `EventMeta` 組み立て（`catalog/routes.ts` の `/api/events/:id/publish`）にも `practiceMode` を追加する。

### 待機画面のルール説明（要件5）
- **Context**: 投影画面の待機状態にルール説明文を追加する影響範囲。
- **Sources Consulted**: `src/client/stage/waiting-room.tsx`, `src/client/stage/waiting-room.test.tsx`
- **Findings**: `WaitingRoom` はイベントタイトル・QR・参加者数のみを表示する単純な提示コンポーネント。新しいpropは不要で、コンポーネント内に固定文言を追加するだけで完結する。
- **Implications**: 新規コンポーネント境界は発生しない。既存コンポーネントへの追記のみ。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A. Sentinel QuestionId 方式（採用） | テスト問題を固定の `QuestionSnapshot` 定数として定義し、本編設問一覧に含めずに既存の `questionOpen`/`questionClosed`/`revealed` フェーズをそのまま流用する | 新しい `LivePhase` バリアント・新規ワイヤーコマンドが不要。採点除外が既存ロジックの副産物として成立する。差分が小さく既存の同期性・アラーム規則をそのまま継承する | フェーズの意味（テスト問題か本編か）が `questionId` の値に暗黙的に依存する。各所で `questionId === PRACTICE_QUESTION_ID` の比較が必要になる | 比較ロジックは1箇所（`shared/practice-question.ts` の定数）に閉じ込め、他は import して使うだけにする |
| B. 専用 `LivePhase` バリアント方式（`practiceOpen`/`practiceClosed`/`practiceRevealed` を新設） | テスト問題専用のフェーズ種別を用意する | フェーズの種類だけで本編/テスト問題を判別でき、`questionId` の値に依存しない | `PhaseMachine`・DO・全クライアント（stage/player/host）の分岐が実質2倍になる。既存の `questionOpen` 系ハンドラを丸ごと複製する必要があり、変更範囲・回帰リスクが大きい | 要件が「固定1問・出題サイクルは本編と同一」である以上、複製のメリットが薄い |

**選定**: Option A（Sentinel QuestionId 方式）。差分最小で既存アーキテクチャの不変条件（PhaseMachine は問い合わせに応じて素直に遷移を返す純粋関数、DOは唯一の権威、採点は投入された questions 配列のみを見る）をそのまま活かせる。

## Design Decisions

### Decision: テスト問題を `context.questions` に含まれない固定 `QuestionSnapshot` として表現する
- **Context**: テスト問題の出題〜正解発表サイクルをどう状態機械に載せるか。
- **Alternatives Considered**:
  1. Option A — Sentinel QuestionId（本文参照）
  2. Option B — 専用 `LivePhase` バリアント新設（本文参照）
- **Selected Approach**: `src/shared/practice-question.ts` に `PRACTICE_QUESTION_ID`（固定 `QuestionId`）と `PRACTICE_QUESTION`（固定 `QuestionSnapshot`、4択）を定義する。`PhaseMachine.next` の `lobby`/`ready`/`revealed` の3箇所のみを、テスト問題ID宛の分岐を追加する形で拡張する。
- **Rationale**: 既存の「questions 配列に存在しない questionId は採点対象外」という不変条件をそのまま流用でき、要件4（採点除外）を実装なしで満たせる。ボタンラベルの出し分けだけで要件3.1/3.7（別操作に見える）を満たせる。
- **Trade-offs**: 各画面コンポーネントに `question.id === PRACTICE_QUESTION_ID` という比較が散在する。ただし比較対象の定数は1箇所に閉じているため、将来テスト問題の内容を変える場合も定数ファイルの変更のみで済む。
- **Follow-up**: `QuizSessionDO` 内の「questions.find」系ヘルパー（`#afterQuestionOpened`, `#afterRevealAnswer` 内の `questions.find((q) => q.id === phase.questionId)`）は、テスト問題IDのときに `PRACTICE_QUESTION` を返すよう解決ヘルパーで包む。

### Decision: `#afterFinalize` でテスト問題の回答を明示的に除外してからアーカイブする
- **Context**: `result_answer` にテスト問題の回答行が残ると、要件4.4（共有情報にテスト問題を含めない）に対する将来のリグレッション経路になる。
- **Selected Approach**: `#afterFinalize` 内で `answers.filter((a) => a.questionId !== PRACTICE_QUESTION_ID)` を `judgedAnswers` 生成前に適用する。
- **Rationale**: 現状の公開共有ページは既に設問別データを返さないため直接のリークはないが、`findForOwner`（主催者向け結果閲覧）は設問別データを返すため、そこにテスト問題の「常に不正解」行が紛れ込むのは要件4.4の趣旨に反する。
- **Trade-offs**: なし（除外は安全側の変更）。

### Decision: イベント単位のテスト問題モードフラグは `event` テーブルへの列追加で永続化する
- **Context**: 要件1のON/OFF設定の保存場所。
- **Selected Approach**: `migrations/0006_practice_mode.sql` で `event.practice_mode_enabled INTEGER NOT NULL DEFAULT 0` を追加。`EventMeta`（`domain-types.ts`）・`EventDetail`/`CreateEventInput`/`UpdateEventInput`（`repository.ts`）・`updateEventRequestSchema`（`schema.ts`）にブール値フィールドを追加する。
- **Rationale**: `templateId`（`0005_theme_template_id.sql`）と同じ前例パターンに従う。
- **Trade-offs**: なし。

## Risks & Mitigations
- テスト問題の `questionId` 比較漏れにより、どこか1画面でテスト問題が「第0問」のように本編設問として誤表示される — 各画面コンポーネントの実装時に `question.id === PRACTICE_QUESTION_ID` チェックの追加箇所をタスクで明示し、ブラウザ確認時に確認項目へ含める。
- `updateEvent` の「開催中は変更禁止」ガードをテスト問題フラグにのみ適用する際、他フィールド（title/subtitle/capacity）の既存の「開催中でも変更可能」という挙動を誤って壊してしまう — フィールド単位の条件分岐として実装し、既存のuriteEvent専用テストで回帰を確認する。

## References
- `src/server/session/phase-machine.ts` — 既存フェーズ遷移規則の実装
- `src/shared/scoring.ts` — 採点集計の実装
- `src/server/session/quiz-session-do.ts` — DOのコマンド処理・イベント配信の実装
