# Research & Design Decisions

## Summary
- **Feature**: `stage-player-visual-refresh`
- **Discovery Scope**: Extension（既存の`live-quiz-app`への機能拡張）
- **Key Findings**:
  - 現状の外観カスタマイズは`ThemeSettings`(4色+ロゴ/背景画像のみ)を`theme`テーブル(D1)に1行/イベントで保持しており、「配色プリセット」(`THEME_PRESETS`)は名前もモチーフも持たない匿名の色セットに過ぎない。デザインテンプレート機能はこの型を拡張する形で無理なく追加できる
  - プロジェクトにはアニメーション用の外部ライブラリ(GSAP・framer-motion等)が一切存在せず、依存関係は最小限に保つ方針(`tech.md`)。新規テンプレートの装飾・演出はTailwind v4 CSSカスタムプロパティとCSS `@keyframes`のみで実現し、新規ランタイム依存を追加しない
  - `ThemeSettings`は`shared/protocol.ts`の`themeUpdated`イベントペイロードとしてDO(Durable Object)からそのまま配信される単一の型であるため、テンプレートIDをこの型に1フィールド追加するだけで、進行画面・投影画面・回答画面への配信経路(WebSocket)は無改修で追従する

## Research Log

### 既存の外観カスタマイズ機構の実装箇所
- **Context**: デザインテンプレート機能をどこに追加すれば既存の「配色のみ変更可能」という制約を壊さずに拡張できるか調査
- **Sources Consulted**: `src/shared/domain-types.ts`(`ThemeSettings`), `src/server/catalog/repository.ts`(`DEFAULT_THEME`, `THEME_PRESETS`, `toTheme`, `putTheme`, `duplicateEvent`), `src/server/catalog/schema.ts`(`themeSettingsRequestSchema`), `migrations/0001_init.sql`(`theme`テーブル), `src/client/host/theme-editor.tsx`, `src/client/host/theme-presets.ts`, `src/client/shared/theme.tsx`, `src/shared/protocol.ts`
- **Findings**:
  - `theme`テーブルは`event_id`をPKとする1行/イベント構成。列は4色+`logo_asset_id`+`background_asset_id`のみで、テンプレート識別子に相当する列は存在しない
  - `THEME_PRESETS`は client(`theme-presets.ts`)・server(`repository.ts`)の双方に**値として重複定義**されており、名称・対象シーンの情報を一切持たない。`ThemeEditor.applyPreset`は選択時に4色を`theme` stateへコピーするだけで、「どのプリセットを選んでいるか」という選択状態自体は保存されない
  - `ThemeProvider`(`client/shared/theme.tsx`)は`ThemeColors`(4色)を`--color-brand-*`へ直接書き込むだけの薄いコンポーネントで、装飾・モチーフに関する概念を一切持たない
  - `ThemeSettings`は`shared/protocol.ts`の`themeUpdated`イベント、および`session/quiz-session-do.ts`の内部状態(`meta.theme`)を通じて、DOからWebSocketで投影画面・回答画面・進行画面へそのまま配信される。型を1フィールド拡張するだけで配信経路の実装は変更不要
- **Implications**: テンプレート機構は「①`ThemeSettings`に`templateId`を追加」「②D1`theme`テーブルに`template_id`列を追加」「③テンプレートの名称・対象シーン・配色定義を持つ静的カタログを`shared/`に新設」の3点で実現でき、DOやWebSocket配信層・進行画面の変更は不要

### 装飾モチーフの実現方式(ライブラリ非依存)
- **Context**: 華やかさ・楽しさを演出する装飾(光沢、紙吹雪、リボン等)を、新規ライブラリを追加せずにどう実現するか
- **Sources Consulted**: `package.json`(既存依存関係), `.kiro/steering/tech.md`(Key Libraries方針), ui-ux-pro-maxスキル(`--design-system`, `--domain color`, `--domain style`, `--domain ux`検索結果)
- **Findings**:
  - 既存の依存関係にアニメーション系ライブラリは含まれない。`tech.md`は依存追加に慎重な方針(better-auth/hono/qrcode/react/zod のみ)
  - ui-ux-pro-maxの`ux`ドメイン検索により、「装飾アニメーションはループさせず1回限りに留める」「1画面あたり同時アニメーションは1〜2要素まで」「`transform`/`opacity`のみを使いレイアウトプロパティは動かさない」「`prefers-reduced-motion`を必ず尊重する」という明確な既存ガイドラインが確認された
  - 紙吹雪的な演出はCanvas等を使わずとも、固定数の`<span>`要素+CSS `@keyframes`(`nth-child`ごとに`animation-delay`/`left`をずらす)で実装可能。ループさせず、正解発表・最終ランキング確定などの一瞬の演出としてのみ使用する設計であれば、ガイドラインとも整合する
- **Implications**: 新規ライブラリを追加せず、CSSカスタムプロパティ + `@keyframes` + 少数の装飾用プレゼンテーションコンポーネント(`Confetti`等、状態を持たない)で全テンプレートの演出を実現する方針とする

### テンプレートの配色案(ui-ux-pro-maxによる検証)
- **Context**: 「結婚式向けエレガント」「イベント向けファンシー」それぞれについて、コントラスト比4.5:1を満たしつつ投影(暗めの会場)でも回答画面(スマホ)でも映える配色を決めたい
- **Sources Consulted**: ui-ux-pro-maxスキル `--domain color`検索(`elegant gold navy luxury dark wedding`, `entertainment vibrant party celebration dark`, `quiz game show modern vibrant energetic`)
- **Findings**:
  - 「Theater/Cinema」パレット(暗いネイビー背景+ゴールドのスポットライト調アクセント)が、暗い会場での投影という要件と「華やかさ」を両立する土台として有効
  - 「Trivia & Quiz Game」パレット(ブルー×パープル×ゴールド、明るい背景)が、クイズアプリの既定(スタンダード)テンプレートとして自然
  - 会場が暗いことを前提にした投影演出との一貫性のため、結婚式向け・イベント向けの両テンプレートは背景を暗色基調にする方が「プロジェクター投影に耐える」(要件1.5)と「華やかさ」を両立しやすいと判断した
- **Implications**: 3テンプレート(`standard`=既定の明るい配色、`elegant-wedding`=ダークボルドー×シャンパンゴールド、`fancy-party`=ダークパープル×ポップイエロー)を採用する。各配色は文字色/背景色間でコントラスト比4.5:1を満たすことをテンプレート追加時のレビュー観点とする(自動テストで担保、Requirement 3.7)

### 日本語UIと外部Webフォント
- **Context**: ui-ux-pro-maxの`typography`検索結果は"Cormorant Infant"や"Fredoka"等の欧文Google Fontsを提案するが、本アプリは全操作要素が日本語(既存要件11.4)
- **Findings**: 現行の`--font-sans`は`Hiragino Kaku Gothic ProN`等のシステム日本語フォントスタックのみで、外部フォント読み込みは行っていない。外部Webフォントを追加すると新たなネットワーク依存が生まれ、モバイル回線での3秒以内表示(要件5.3)にリスクを与える
- **Implications**: 外部Webフォントは追加しない。「洗練・華やかさ」はレイアウト・余白・タイポグラフィの強弱(`font-weight`/`letter-spacing`/サイズ比)・配色・装飾モチーフ・アニメーションで表現し、フォント自体は既存のシステムフォントスタックを維持する

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| テンプレートごとに専用Reactコンポーネントを分岐実装 | `templateId`に応じて`WaitingRoom`等の内部で異なるJSXツリーを描画 | テンプレート固有の複雑な構造も表現できる | 全フェーズ×全テンプレートの組み合わせでコンポーネントが分岐し、テスト・保守コストが増大。既存のシンプルな薄いコンポーネント群の設計思想から逸脱 | 却下 |
| **装飾スロット + CSS属性セレクタ(採用)** | 各画面は中身のない装飾用要素(スロット)を一定の位置に描画するだけとし、`ThemeProvider`が設定する`data-design-template`属性に応じたCSSが見た目を決定する | 画面コンポーネントのロジックはテンプレートを一切意識せず変更不要に近い。新テンプレート追加時もCSS追加のみで完結し、既存の「進行ロジックとUIの分離」という設計思想とも整合 | 高度に構造が異なる装飾は表現しづらい(今回は不要) | 採用 |
| テンプレートごとに背景画像アセットを用意しR2から配信 | 装飾を画像として作り込み配信する | デザインの自由度は最も高い | 新規のアセット管理・配信経路が必要になり、要件外の複雑性を持ち込む。モバイル回線での表示速度(要件5.3)にも不利 | 却下 |

## Design Decisions

### Decision: デザインテンプレートの永続化方法
- **Context**: 「配色+装飾モチーフ」を1セットで選択・維持できるようにする必要がある(要件3.1, 3.5, 3.6)
- **Alternatives Considered**:
  1. `theme`テーブルに新しいテンプレート専用テーブルを設け、テンプレートの全定義(色・モチーフ)をDBに保持する
  2. `ThemeSettings`に`templateId`(文字列)のみを追加し、テンプレートの定義自体は静的カタログとしてコードで管理する
- **Selected Approach**: 2を採用。`theme`テーブルに`template_id TEXT`列を追加し、`ThemeSettings.templateId: DesignTemplateId | null`として保持する。テンプレートの名称・対象シーン・既定配色は`shared/design-templates.ts`の静的カタログで一元管理する
- **Rationale**: 主催者が独自にテンプレートを新規作成する機能は要件のOut of scopeであり、テンプレートの集合はアプリケーションが提供する固定の選択肢で足りる。静的カタログにすることでテンプレート追加はコードレビューを伴うデプロイで完結し、無制限なテンプレート氾濫を防げる
- **Trade-offs**: テンプレートの追加・改訂にはデプロイが必要(DBのみでの追加はできない)。ただし要件のOut of scope(ビルダー機能)と整合するため許容する
- **Follow-up**: なし

### Decision: テンプレート選択後の個別配色調整との関係
- **Context**: 要件3.6は「テンプレート選択後に基調色等を個別調整しても、選択中テンプレートの装飾モチーフは維持する」ことを求める
- **Alternatives Considered**:
  1. 色を1色でも手動変更したら`templateId`を`null`(カスタム扱い)に戻す
  2. `templateId`と4色を独立したフィールドとして保持し、色の変更は`templateId`に影響しない
- **Selected Approach**: 2を採用。`templateId`はモチーフ選択の記録として独立して保持し、4色フィールドの変更とは連動させない
- **Rationale**: 要件3.6の文言どおり、色の微調整だけでモチーフ演出まで失われる体験は主催者の意図に反する
- **Trade-offs**: 主催者が色を大きく変更した結果、テンプレートの前提と配色が乖離する可能性がある。この場合もコントラスト警告(要件4.5, 既存要件3.6)により低コントラストは検知できるため、体験上の致命的な破綻は防げる
- **Follow-up**: なし

### Decision: 装飾・演出の実装手段としてCSSのみを用いる
- **Context**: 正解発表・最終ランキング確定などで「華やかさ」を演出する必要がある(要件1.3, 1.4, 2.5, 2.6)一方、新規ランタイム依存の追加は避けたい
- **Alternatives Considered**:
  1. GSAP等のアニメーションライブラリを新規導入する
  2. CSS `@keyframes` + 少数の状態を持たないプレゼンテーションコンポーネント(`Confetti`等)のみで実現する
- **Selected Approach**: 2を採用
- **Rationale**: `tech.md`の依存関係最小化方針、および本機能がビジュアルデザインの刷新に閉じる(進行ロジックに影響しない)というBoundary Commitmentsに合致する。CSSアニメーションはバンドルサイズへの影響がほぼゼロで、要件5.3(3秒以内表示)への影響も最小
- **Trade-offs**: 複雑な物理演算的アニメーション(慣性・衝突等)は表現できないが、本要件が求める演出の範囲では不要
- **Follow-up**: 実装フェーズで`prefers-reduced-motion`時の代替表示(演出をスキップし最終状態を即時表示)を各装飾コンポーネントで確認する

## Risks & Mitigations
- **既存の`THEME_PRESETS`(client/server双方)を廃止し`DESIGN_TEMPLATES`へ置き換えることによる既存テストの破壊** — `repository.test.ts`・`theme-editor.test.tsx`等、`THEME_PRESETS`を参照する既存テストを新カタログ参照へ更新するタスクを実装計画に明示する
- **D1マイグレーション追加(`template_id`列)の後方互換性** — 列はNULL許容とし、既存イベント(NULL)は`toTheme`で`templateId: null`として扱う。`ThemeProvider`側は`templateId ?? "standard"`として解釈し、既存イベントの表示が壊れないようにする
- **暗色を既定とする新テンプレートが、明るい会場や印刷物との相性で読みにくくなる懸念** — 既存要件3.6/4.5のコントラスト比警告は配色調整後も機能し続けるため、主催者が視認性を損なう配色にした場合は既存の警告機構で検知できる

## References
- 社内: `.kiro/steering/tech.md`(依存関係最小化方針、CSS変数の直接参照ルール)
- 社内: `.kiro/specs/live-quiz-app/design.md`(既存アーキテクチャ、依存方向`types → config → repository → domain → session → api → ui`)
- ui-ux-pro-maxスキル ローカルデータ検索結果(`--domain color` / `--domain style` / `--domain ux` / `--design-system`) — セッション内で実行、外部URLなし
