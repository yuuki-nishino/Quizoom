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
- **hono**: HTTPルーティング。`app.route()`で機能ごとにルートを分割(`catalogRoutes`/`joinRoutes`/`mediaRoutes`/`collaboratorRoutes`)
- **tailwindcss v4**(`@tailwindcss/vite`): クライアント側スタイリング。`ThemeProvider`(`src/client/shared/theme.tsx`)がイベントごとの配色を`--color-brand-*`というTailwindの`@theme`トークン名へ**直接**インライン設定し、`bg-brand-primary`等のユーティリティから参照する。**別名の変数(例: `--quizoom-color-*`)を経由する二重参照にしてはいけない** — CSSカスタムプロパティは「定義された要素」でしか`var()`を再評価しないため、`:root`の`@theme`ブロック側でしか別名を解決していないと、ネストした要素でその別名を上書きしても`:root`側のトークンには反映されず、常にフォールバック値のままになる(実際に発生し、Issue #7で複数回「プレビューの色が変わらない」として報告された不具合の真因)
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
- TDDとCIの対象は単体テストと結線統合テスト。画面の見た目・演出・操作感は、各仕様の`tasks.md`に「ブラウザ確認」タスクとして置き、実装後に手動で確認する。本番の同時接続は`docs/load-test/`の手順で必要時のみ手動で試験する

## Development Environment

### Required Tools
- Node.js 24+
- `wrangler` CLI(ログイン済みであること)

### Common Commands
```bash
# Dev: npm run dev            (vite dev, ポート5173)
# Build: npm run build        (tsc -b --noEmit && vite build)
# Typecheck: npm run typecheck
# Test: npm test               (vitest run)
# Deploy: npm run deploy       (build後 wrangler deploy。通常はCI/CD経由、詳細は docs/CI-CD.md)
```

## Key Technical Decisions

- **WebSocket接続は単一の `/connect` エンドポイントに集約**し、`role`クエリパラメータ(host/stage/participant)で役割を判定する。役割ごとの認証(セッションCookie/投影トークン/参加者トークン)は`QuizSessionDO`側で検証する
- **`wrangler.jsonc`の`assets.run_worker_first: true`は必須**。これがないと、ブラウザのページ遷移に見えるリクエスト(`Sec-Fetch-Dest: document`等)をCloudflareのSPAフォールバックがWorkerのコードより先にエッジで横取りしてしまい、`/api/*`のようなAPIルート(特にOAuthコールバック)が到達不能になる(本番で実際に発生した障害)
- **アラームは締切1件のみに限定**し、定期ポーリング等の用途に拡張しない。DOのアイドル時課金ゼロ(要件12.1)がアラーム常用によって壊れるため
- **D1書き戻しはリトライ付き**(`retryAsync`)で行うが、DO側のフェーズ確定を先に成立させ、D1書き戻し失敗が進行を止めないようにする
- **イベントへのアクセス権は2段階**。`requireEventOwner`は所有者専用の操作(イベント削除・共有設定・共同運営者管理)、`requireEventAccess`は所有者と共同運営者の両方に許す操作(進行・設問編集など)に使い分ける。WebSocketのhostロール検証(`QuizSessionDO`)も同じ判定に依存する。新しい操作を追加するときは、どちらに属するかを要件で先に決める
- **ネタバレ防止はクライアント表示ではなくサーバー配信で制御する**。参加者に見せない値(最終発表中の自分の順位など)は、`QuizSessionDO`が配信しない。クライアントで隠すだけにしない
- **発表グループの分割など、サーバーとクライアントが同じ計算結果を必要とする純粋ロジックは`src/shared/`に置く**(`buildRevealBatches`)。サーバーは操作の妥当性検証に、クライアントは描画に同じ関数を使う
- **画像の加工はクライアント側で行う**(`createImageBitmap`+Canvasで中央トリミング・縮小・JPEG化)。Workerには画像処理を持たせない。アスペクト比・長辺の上限・出力形式といった仕様は`src/shared/choice-image-spec.ts`に定数として置き、加工(host)と表示(stage/player)の両方が同じ値を参照する
- **D1のスキーマ変更は`migrations/NNNN_<内容>.sql`の連番で追加する**(`wrangler.jsonc`の`migrations_dir`)。既存のマイグレーションは書き換えない
- **本番デプロイはmainへのマージ後にCI(`.github/workflows/ci-cd.yml`)が自動で行う**。mainへ直接pushせず、`feature/` `fix/` `docs/` `chore/`のブランチからPRを出す。詳細は`docs/CI-CD.md`
