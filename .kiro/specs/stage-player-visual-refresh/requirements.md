# Requirements Document

## Project Description (Input)
投影画面(src/client/stage)と参加者画面(src/client/player)のビジュアルデザインを刷新する。現状は機能的だが洗練さ・華やかさ・楽しさに欠けるUIになっている。Quizoomは結婚式二次会や社内イベントなど「場を盛り上げる」用途を想定しているため、会場スクリーンに映る投影画面と参加者のスマートフォンに表示される参加者画面の第一印象がイベント体験を左右する。ui-ux-pro-maxスキルを活用し、より洗練された、かつ華やかで楽しい印象のビジュアルデザインへ刷新したい。対象は WaitingRoom / QuestionView / RevealView / RankingView (stage側) と NicknameForm / WaitingScreen / AnswerScreen / ResultScreen / LateJoinNotice (player側)、および両者が共有する外観基盤(src/client/shared/theme.tsx)。既存の同期挙動・アクセシビリティ・主催者が設定できる配色/ロゴ/背景のカスタマイズ機構は維持すること。関連Issue: https://github.com/yuuki-nishino/Quizoom/issues/10

## Introduction

本仕様は、既存のライブクイズアプリ(`live-quiz-app`)における「問題投影画面」(`src/client/stage`)と「回答画面」(`src/client/player`)のビジュアルデザインを刷新する。機能・進行ロジック・リアルタイム同期の仕様は変更せず、見た目の洗練度・華やかさ・楽しさを高めることを目的とする。会場のスクリーンに映る投影画面と、参加者が手元で操作する回答画面はイベント体験の第一印象を左右するため、既存の`ThemeProvider`による主催者カスタマイズ(配色・ロゴ・背景)を活かしつつ、演出・アニメーション・タイポグラフィ・レイアウトの質を底上げする。あわせて、現状は配色のみを切り替える「配色テーマプリセット」を、配色と装飾モチーフ・視覚様式を1セットにした「デザインテンプレート」へ拡張し、結婚式などフォーマルで華やかな場向け、社内イベントなどファンシーで楽しい場向けといった用途別にワンクリックでおしゃれな見た目へ整えられるようにする。

## Boundary Context

- **In scope**:
  - `src/client/stage/`配下の各フェーズ画面(WaitingRoom / QuestionView / RevealView / RankingView)のビジュアルデザイン刷新
  - `src/client/player/`配下の各画面(NicknameForm / WaitingScreen / AnswerScreen / ResultScreen / LateJoinNotice)のビジュアルデザイン刷新
  - 投影画面・回答画面が共通利用する外観基盤(`src/client/shared/theme.tsx`, `src/client/styles.css`)のデザイントークン拡充
  - 正解発表・最終ランキング確定時などの演出強化(アニメーション・視覚的な祝福表現)
  - 主催者が外観設定を変更していない場合の既定デザイン(デフォルトテーマ)の品質向上
  - 配色に加えて装飾モチーフ・雰囲気までを1セットにした「デザインテンプレート」の新規提供(結婚式など華やかな場向け、社内イベント等ファンシーで楽しい場向けを含む、少なくとも2種)
- **Out of scope**:
  - 進行画面(`src/client/host`)、結果共有ページ(`src/client/share`)のビジュアルデザイン刷新(必要な整合確認のみ行う)
  - フェーズ遷移ロジック・採点ロジック・WebSocketプロトコルなど、進行に関わる機能仕様の変更
  - 外観カスタマイズで設定できる項目のうち、テンプレート・配色・ロゴ・背景以外の新規追加(例: フォント選択の個別指定、アニメーション種別の個別選択)
  - 主催者が独自のデザインテンプレートを新規作成・保存できるようにするビルダー機能(テンプレートはあらかじめ用意されたものから選ぶ方式に限定する)
- **Adjacent expectations**:
  - 既存の`ThemeProvider`が提供するCSS変数(`--color-brand-*`)経由での配色反映の仕組みは変更せず、二重参照バグ(Issue #7)を再発させない
  - 投影画面はプロジェクター投影(16:9全画面)、回答画面はスマートフォン縦画面という既存の表示前提を維持する
  - 既存のE2E相当の統合テスト・コンポーネントテストが刷新後も同じ振る舞いを検証できることを前提とする

## Requirements

### Requirement 1: 投影画面のビジュアル刷新
**Objective:** As a 会場の参加者全員, I want スクリーンに映る問題投影画面が洗練され華やかで楽しい印象であること, so that 手元の端末を見なくても進行状況と場の盛り上がりを視覚的に楽しめる

#### Acceptance Criteria
1. When 投影画面が待機状態(WaitingRoom)を表示した, the Presentation Screen shall イベントタイトル・QRコード・参加者数を、既存の情報を保ったまま視覚的に洗練されたレイアウトと装飾で表示する。
2. When 設問が出題された(QuestionView), the Presentation Screen shall 問題文・選択肢・残り時間カウントダウンを、視認性を保ったまま強調されたタイポグラフィと動きのある表現で表示する。
3. When 回答受付が終了し正解が発表された(RevealView), the Presentation Screen shall 正解選択肢の強調表示に加え、正解発表であることが直感的に伝わる視覚的演出を伴って表示する。
4. When 最終ランキングが確定した(RankingView), the Presentation Screen shall 上位者の発表を、既存の演出要件(Requirement 6.6準拠)に加えて華やかさを強調した視覚効果とともに表示する。
5. While 投影画面のいずれかのフェーズが表示されている, the Presentation Screen shall 既存要件(Requirement 6.7)のプロジェクター投影に耐える文字サイズとコントラストを維持する。
6. While 投影画面が同一フェーズ内で状態を更新している, the Presentation Screen shall 進行操作の反映(Requirement 9.1: 1秒以内)を遅延させない範囲でフェーズ内・フェーズ間の視覚的な遷移表現を行う。

### Requirement 2: 参加者(回答)画面のビジュアル刷新
**Objective:** As a 参加者, I want 手元のスマートフォンの回答画面が洗練され楽しい印象であること, so that 回答という単純な操作自体をイベントの一部として楽しめる

#### Acceptance Criteria
1. When 参加者がニックネーム入力画面(NicknameForm)を開いた, the Answer Screen shall 参加への期待感を高める視覚的に洗練されたレイアウトで入力フォームを表示する。
2. While 参加者が開始待ち状態(WaitingScreen)にある, the Answer Screen shall 単調な待機感を軽減する視覚的な演出を伴って待機中であることを表示する。
3. When 設問が出題された(AnswerScreen), the Answer Screen shall 選択肢ボタンを、既存要件(Requirement 7.8: 拡大縮小操作なしで押下可能)を満たしたまま視覚的に魅力のあるボタンデザインで表示する。
4. When 参加者が選択肢を選んで回答を送信した, the Answer Screen shall 回答が受け付けられたことが直感的に伝わる視覚的フィードバックを伴って表示する。
5. When 回答受付が終了し自分の正誤・順位が表示された(ResultScreen), the Answer Screen shall 正解時・不正解時それぞれに応じた感情に訴える視覚的演出を伴って結果を表示する。
6. When 最終ランキングが確定し自分の最終結果が表示された, the Answer Screen shall 既存要件(Requirement 7.9)の情報に加えて達成感や高揚感を演出する視覚効果とともに表示する。
7. When 途中参加した参加者に不利になる旨が通知される(LateJoinNotice), the Answer Screen shall 既存の通知内容を保ったまま、他の画面デザインと一貫した視覚様式で表示する。

### Requirement 3: デザインテンプレート(用途別テーマ)の提供
**Objective:** As a 主催者, I want 結婚式などフォーマルで華やかな場、社内イベントなどファンシーで楽しい場、といった用途に応じたデザインテンプレートを選ぶだけでおしゃれな見た目に整えたい, so that デザインの専門知識がなくても、開催シーンに合った統一感のある演出を短時間で実現できる

#### Acceptance Criteria
1. The Theme Template Service shall 複数のデザインテンプレートを提供し、各テンプレートは配色に加えて投影画面・回答画面双方に適用される装飾モチーフ・視覚様式を1セットとして含む。
2. The Theme Template Service shall 結婚式など華やかでフォーマルな場に適した「エレガント」系テンプレートを少なくとも1つ提供する。
3. The Theme Template Service shall 社内イベント・懇親会などファンシーで楽しい雰囲気に適した「ファンシー/ポップ」系テンプレートを少なくとも1つ提供する。
4. When 主催者がテンプレート一覧を開いた, the Theme Editor shall 各テンプレートがどのような場面向けかを判別できる名称とプレビュー(サムネイル等)を提示する。
5. When 主催者がデザインテンプレートを1つ選択した, the Quiz Management Service shall 当該テンプレートの配色と装飾モチーフを、投影画面・回答画面の双方へ一貫して適用する。
6. When 主催者がテンプレート選択後に基調色・アクセント色・背景色・文字色を個別調整した, the Quiz Management Service shall 配色の変更のみを反映し、選択中テンプレートの装飾モチーフ・視覚様式は維持する。
7. Each design template shall, 初期状態の配色において, 文字色と背景色のコントラスト比4.5:1以上を満たす。

### Requirement 4: 主催者カスタマイズとの整合
**Objective:** As a 主催者, I want デザイン刷新後も自分が選んだテンプレートや設定した配色・ロゴ・背景が正しく反映されること, so that イベントのテーマに合わせたブランディングを損なわずに刷新の恩恵を受けられる

#### Acceptance Criteria
1. When 主催者がイベントの基調色・アクセント色・背景色・文字色を設定している, the Presentation Screen and the Answer Screen shall 刷新後のデザインにおいても当該配色をCSS変数経由で正しく反映する。
2. When 主催者がロゴまたは背景画像をアップロードしている, the Presentation Screen and the Answer Screen shall 刷新後のレイアウト内の指定位置に当該画像を表示する。
3. If 主催者が外観設定を一切変更していない, then the Presentation Screen and the Answer Screen shall 洗練され華やかな印象を持つ既定デザイン(デフォルトテンプレート)で表示する。
4. The Theme Provider shall 配色トークンを`:root`の`@theme`ブロックへの直接設定のみで反映し、別名変数を介した二重参照を行わない。
5. When 主催者が指定した文字色と背景色の組み合わせがコントラスト比4.5:1を下回っている, then the Presentation Screen and the Answer Screen shall 既存要件(Requirement 3.6)通り視認性が低い旨の警告対象であり続ける。
6. When 主催者がプレビュー機能(Requirement 3.8, 3.9)を利用した, the Theme Preview shall 選択中のテンプレートおよび刷新後の投影画面・回答画面のデザインをそのまま反映したプレビューを表示する。

### Requirement 5: アクセシビリティとパフォーマンスの維持
**Objective:** As a 全ての利用者, I want デザインが華やかになっても操作性・可読性・応答速度が損なわれないこと, so that 見た目の向上が体験の劣化を招かない

#### Acceptance Criteria
1. The Presentation Screen and the Answer Screen shall 刷新後も既存のコントラスト比基準(4.5:1)を満たすテキスト表示を維持する。
2. If 利用者の端末がモーション低減設定(`prefers-reduced-motion`)を有効にしている, then the Presentation Screen and the Answer Screen shall 非本質的なアニメーション効果を抑制した表示に切り替える。
3. The Answer Screen shall 刷新後も既存要件(Requirement 11.3: モバイル回線で3秒以内に操作可能)を満たすページ読み込み性能を維持する。
4. The Presentation Screen and the Answer Screen shall 演出・アニメーションの追加によって、既存要件(Requirement 9.1: 進行操作の1秒以内反映)の同期性能を劣化させない。
5. The Answer Screen shall 刷新後も全ての操作要素を日本語で表示し、主要なモバイルブラウザ(iOS Safari, Android Chrome)最新版および1つ前のメジャーバージョンで動作する。

### Requirement 6: 回帰防止とデザイン一貫性
**Objective:** As a 開発チーム, I want デザイン刷新が既存機能を壊さず、投影画面と回答画面の間で一貫した世界観を持つこと, so that 安心して刷新を継続的にリリースでき、利用者が2画面間で統一感を感じられる

#### Acceptance Criteria
1. When 投影画面・回答画面のコンポーネントが変更された, the Test Suite shall 既存のコンポーネントテスト・統合テストを更新後も全て成功させる。
2. The Presentation Screen and the Answer Screen shall 配色・タイポグラフィ・装飾モチーフにおいて共通のデザイントークンを参照し、両画面間で視覚的に一貫した世界観を保つ。
3. When 新規または変更されたUIコンポーネントが追加された, the Test Suite shall 当該コンポーネントの表示状態を検証するテストを含む。
