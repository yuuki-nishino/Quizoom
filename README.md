# Quizoom

会場に集まった参加者が一斉に回答する、リアルタイムクイズ大会をWebブラウザだけで実施できる汎用クイズ大会ツール。

結婚式の披露宴・二次会、社内イベント、懇親会、勉強会、学校行事、展示会、オンライン配信など、人が集まる場全般での利用を想定しています。

## 主な機能

- **事前準備**: 主催者(ホスト)がGoogleアカウントでログインし、イベント・設問(問題文/選択肢/正解/制限時間/画像)・外観(配色/ロゴ/背景)を作成・編集
- **3画面同期進行**: 進行画面の操作(出題・締切・正解発表・ランキング表示)を、投影画面(会場スクリーン)と回答画面(参加者のスマートフォン)へ1秒以内に同期
- **QRコード参加**: 参加者はQRコードを読み取りニックネームを登録するだけ。アプリのインストールもアカウント登録も不要
- **同率なし採点**: 正解数を第一基準、回答所要時間を第二基準として順位を決定
- **結果共有**: 開催後、主催者が任意で認証不要の閲覧専用ページとして結果を共有
- **練習問題モード / 共同編集者**: 本番前の練習出題や、複数人でのイベント編集に対応

### 画面(URLパス接頭辞)

| パス | 役割 | 利用者 |
|---|---|---|
| `/host` | 主催者コンソール(準備・進行) | 主催者 |
| `/stage` | 問題投影画面 | 会場スクリーン |
| `/join` | 回答画面 | 参加者のスマートフォン |
| `/share` | 結果共有ページ | 誰でも(閲覧のみ) |

## 技術スタック

Cloudflare Workers上の単一Worker(Hono)で構成するサーバーレスなモノレポです。年に数回の低頻度開催を前提に、開催していない期間の固定費がほぼゼロになる構成を採っています。

| 領域 | 技術 |
|---|---|
| 言語 | TypeScript 5 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| サーバー | Hono 4 on Cloudflare Workers |
| クライアント | React 19 + Vite 7 (SPA) + Tailwind CSS v4 |
| カタログデータ | Cloudflare D1(イベント・設問・外観・確定結果) |
| ライブ進行状態 | Durable Objects (SQLiteバックエンド) + WebSocket Hibernation |
| 画像 | Cloudflare R2(Worker経由でセッション検証を挟んで配信) |
| 認証 | better-auth (Google OAuthのみ / 主催者用) |
| 検証 | Zod 4(HTTP・WebSocketの境界) |
| テスト | Vitest + `@cloudflare/vitest-pool-workers` (Miniflareで実Workers環境を再現) |

### アーキテクチャの要点

- 開催中のセッション状態(フェーズ・参加者・回答)は、イベントごとに1つの Durable Object(`QuizSessionDO`)が権威データとして保持します
- WebSocketは単一の `/connect` エンドポイントに集約し、`role`(host/stage/participant)で役割を判定します
- ドメインロジック(採点 `ScoringModule`、フェーズ遷移 `PhaseMachine`)はCloudflare APIに依存しない純粋関数として切り出しています
- ドメインエラーは例外ではなく `Result<T, E>` で表現します
- アラームは回答締切1件のみに限定し、DOのアイドル時課金ゼロを保ちます

### ディレクトリ構成

```
src/
  server/          # Worker(Hono)
    auth/ catalog/ session/ media/ results/   # ドメインごとのモジュール
    integration/   # 実HTTP+実WebSocketによる結線統合テスト
  client/          # SPA(役割ごと)
    host/ stage/ player/ share/ shared/
  shared/          # サーバー・クライアント共有の型・プロトコル・採点ロジック
migrations/        # D1マイグレーション
scripts/           # 補助スクリプト(参加者シード等)
docs/              # CI/CD手順、負荷試験レポート
.kiro/             # steering(プロジェクト共通知識)と specs(機能仕様)
```

詳細は `.kiro/steering/` の `product.md` / `tech.md` / `structure.md` を参照してください。

## セットアップ

### 必要なもの

- Node.js 24+
- `wrangler` CLI(Cloudflareにログイン済みであること)

### 手順

```bash
npm ci

# ローカル用シークレットを .dev.vars に用意する(Git管理外)
#   GOOGLE_CLIENT_ID=...
#   GOOGLE_CLIENT_SECRET=...
#   BETTER_AUTH_SECRET=...
#   PARTICIPANT_TOKEN_SECRET=...

npm run dev        # http://localhost:5173
```

### コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー起動(Vite, ポート5173) |
| `npm run build` | 型チェック(`tsc -b --noEmit`) + クライアントビルド |
| `npm test` | テスト実行(`vitest run`) |
| `npm run test:watch` | テストのウォッチ実行 |
| `npm run typecheck` | 型チェックのみ |
| `npm run deploy` | ビルド後に `wrangler deploy`(通常はCI/CD経由) |
| `npm run cf-typegen` | Workers型定義の生成 |
| `npm run seed:participants` | 負荷試験等のための参加者シード |

## 開発手法: 仕様駆動開発(Spec-Driven Development)

[Kiro](https://kiro.dev/)スタイルの仕様駆動開発を、Claude Codeによるエージェント開発(Agentic SDLC)上で実践しています。コードを書く前に「何を作るか」を仕様として合意し、その仕様からテスト・実装を導きます。

### 2つの知識レイヤー

| 種別 | 場所 | 役割 |
|---|---|---|
| **Steering** | `.kiro/steering/` | プロジェクト全体に効く方針・文脈(プロダクト概要・技術スタック・構成規約)。AIが常に読み込む |
| **Specs** | `.kiro/specs/<feature>/` | 個別機能の仕様(`requirements.md` / `design.md` / `tasks.md` / `spec.json`) |

仕様書は日本語で記述します(`spec.json` の `language`)。

### 3フェーズ承認フロー

```
要件定義 → 設計 → タスク分解 → 実装
  (各フェーズで人間がレビュー・承認してから次へ進む)
```

| フェーズ | コマンド |
|---|---|
| 0. Steering(任意) | `/kiro:steering`, `/kiro:steering-custom` |
| 1. 仕様化 | `/kiro:spec-init` → `/kiro:spec-requirements` → `/kiro:validate-gap`(任意) → `/kiro:spec-design` → `/kiro:validate-design`(任意) → `/kiro:spec-tasks` |
| 2. 実装 | `/kiro:spec-impl {feature} [tasks]` → `/kiro:validate-impl`(任意) |
| 進捗確認 | `/kiro:spec-status {feature}`(いつでも) |

実装は **TDD**(テストを先に書く)で進めます。統合テストは実WebSocket・実D1を使い、モックに頼りません。

### 仕様の一覧

`.kiro/specs/` に機能ごとの仕様があります。

- `live-quiz-app` — Quizoom本体
- `event-collaborators` — イベント共同編集者
- `practice-question-mode` — 練習問題モード
- `stage-player-visual-refresh` — 投影・回答画面のビジュアル刷新

## 開発の進め方

1. **仕様を作る**: 新機能は `/kiro:spec-init` から始め、要件 → 設計 → タスクを各段階でレビューする。小さな改善や不具合修正は、GitHub Issueを起点にタスク単位で進める
2. **ブランチを切る**: `main` へ直接pushしない。`feature/xxx` / `fix/xxx` / `docs/xxx` / `chore/xxx` の形式で作業ブランチを作成する
3. **TDDで実装する**: `/kiro:spec-impl` でタスクごとにテスト → 実装 → リファクタリングを回す
4. **PRを作成する**: `main` 向けにPRを作成する。CIが型チェックとテストを自動実行する
5. **レビュー・マージ**: CIが通ったらマージする。マージ後に自動で本番へデプロイされる

コミットメッセージは日本語で、`種別: 変更内容(task N, Issue #N)` の形式を基本にしています。

## CI/CD

GitHub Actions(`.github/workflows/ci-cd.yml`)で、テストから本番デプロイまでを自動化しています。

```
featureブランチ → PR(base: main) → CI(build + test)
                                      ↓ レビュー・マージ
                       main へのpush → CI → D1マイグレーション適用 → wrangler deploy
```

| イベント | ジョブ | 内容 |
|---|---|---|
| `main` へのPR作成・更新 | `test` | `npm run build`(型チェック含む) → `npm test` |
| `main` へのpush(= PRマージ) | `test` → `deploy` | テスト成功後、D1マイグレーション適用 → `wrangler deploy` |

- `deploy` は `needs: test` のため、テストが落ちていれば本番へは反映されません
- D1マイグレーション(`migrations/`)は毎回 `wrangler d1 migrations apply --remote` で適用されます。既存行に影響しない追記のみを想定してください
- デプロイにはGitHub Secretsの `CLOUDFLARE_API_TOKEN` が必要です
- アプリ自身のシークレット(`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `BETTER_AUTH_SECRET` / `PARTICIPANT_TOKEN_SECRET`)は `wrangler secret put` でWorkerに直接登録します

初回セットアップの手順など詳細は [docs/CI-CD.md](docs/CI-CD.md) を参照してください。

## その他のドキュメント

- [docs/CI-CD.md](docs/CI-CD.md) — CI/CDの詳細・初回準備・ブランチ運用
- [docs/load-test/](docs/load-test/) — 本番環境での負荷試験レポート
- [CLAUDE.md](CLAUDE.md) — Claude Code向けのプロジェクト指示
