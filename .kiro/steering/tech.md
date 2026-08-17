# Technology Stack

## Architecture

Cloudflare Workers上に構築された、単一Workerスクリプト(Hono)によるモノレポ構成。

- **カタログデータ(D1)**: イベント・設問・選択肢・外観・確定結果など、恒久的に保持するデータ
- **ライブセッション状態(Durable Object + SQLiteバックエンド)**: 開催中のみ存在する進行フェーズ・参加者・回答を、イベントごとに1つのDOインスタンスが権威データとして保持する。WebSocket Hibernationにより、参加者が接続したまま待機していても課金が発生しない
- **画像(R2)**: 問題添付画像・ロゴ・背景画像。公開バケットにはせず、Worker経由でセッション検証を挟んで配信する

クライアントはSPA(React)で、`/host`(主催者) `/stage`(投影) `/join`(参加者) `/share`(結果共有)のパス接頭辞で役割ごとの画面を出し分ける。

## Core Technologies

- **Language**: TypeScript 5(strict)
- **Server Framework**: Hono 4 on Cloudflare Workers
- **Client Framework**: React 19 + Vite 7
- **Data**: Cloudflare D1(カタログ・結果) / Durable Objects with SQLite backend(ライブ進行状態) / R2(画像)

## Key Libraries

- **better-auth**: 主催者認証(Google OAuthのみ)。`Env`を引数に取るファクトリ関数として構成する(Workersのリクエストスコープ制約のため、モジュールスコープでシングルトン化しない)
- **zod**: HTTP境界・WebSocketコマンドのランタイム検証
- **hono**: HTTPルーティング。`app.route()`で機能ごとにルートを分割(`catalogRoutes`/`joinRoutes`/`mediaRoutes`)
- **tailwindcss v4**(`@tailwindcss/vite`): クライアント側スタイリング。`src/client/styles.css`の`@theme`で`--quizoom-color-*`(ThemeProviderが設定するCSSカスタムプロパティ)を`brand-*`トークンとして再公開し、イベントごとの配色カスタマイズをTailwindユーティリティ(`bg-brand-primary`等)から参照できるようにしている
- **qrcode**: 参加用QRコードのSVG生成

## Development Standards

### Type Safety
- `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` を有効化
- ドメインエラーは例外ではなく `Result<T, E>`(`shared/domain-types.ts`)で表現し、呼び出し側に握りつぶしを許さない

### Code Quality
- ドメイン純粋ロジック(採点・フェーズ遷移など)はCloudflare固有APIに依存しない純粋関数として`shared/`または各モジュール直下に切り出し、単体テストしやすくする(例: `ScoringModule`, `PhaseMachine`)
- HTTP/WebSocket境界での入力検証はZodスキーマで行い、境界の外側では型を信頼する

### Testing
- Vitest + `@cloudflare/vitest-pool-workers`(Miniflareで実Workers環境を再現してテストする)
- TDD前提(Kiroワークフローの`/kiro:spec-impl`経由)。統合テストは実WebSocket接続・実D1操作で行い、モックに頼らない(`src/server/integration/`, `full-event-flow.test.ts`など)
- `vitest.config.ts`の`miniflare.bindings`でテスト専用の固定シークレット値を注入しており、`.dev.vars`の有無にテストの成否が依存しない

## Development Environment

### Required Tools
- Node.js 24+
- `wrangler` CLI(ログイン済みであること)

### Common Commands
```bash
# Dev: npm run dev            (vite dev, ポート5173)
# Build: npm run build        (tsc -b --noEmit && vite build)
# Test: npm test               (vitest run)
# Deploy: npm run deploy       (build後 wrangler deploy。通常はCI/CD経由、詳細は docs/CI-CD.md)
```

## Key Technical Decisions

- **WebSocket接続は単一の `/connect` エンドポイントに集約**し、`role`クエリパラメータ(host/stage/participant)で役割を判定する。役割ごとの認証(セッションCookie/投影トークン/参加者トークン)は`QuizSessionDO`側で検証する
- **`wrangler.jsonc`の`assets.run_worker_first: true`は必須**。これがないと、ブラウザのページ遷移に見えるリクエスト(`Sec-Fetch-Dest: document`等)をCloudflareのSPAフォールバックがWorkerのコードより先にエッジで横取りしてしまい、`/api/*`のようなAPIルート(特にOAuthコールバック)が到達不能になる(本番で実際に発生した障害)
- **アラームは締切1件のみに限定**し、定期ポーリング等の用途に拡張しない。DOのアイドル時課金ゼロ(要件12.1)がアラーム常用によって壊れるため
- **D1書き戻しはリトライ付き**(`retryAsync`)で行うが、DO側のフェーズ確定を先に成立させ、D1書き戻し失敗が進行を止めないようにする
