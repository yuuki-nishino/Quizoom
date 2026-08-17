# Project Structure

## Organization Philosophy

サーバー側は**ドメイン境界ごと**(auth/catalog/session/media/results)、クライアント側は**役割ごと**(host/stage/player/share)に分割する。両者は`src/shared/`の型・プロトコル定義を介してのみ結合する。

## Directory Patterns

### サーバー: ドメインモジュール
**Location**: `src/server/<domain>/`
**Purpose**: 1ドメインにつき1ディレクトリ。典型的には `routes.ts`(HTTPハンドラ) + `repository.ts`または`archive.ts`(D1操作) + `schema.ts`(Zodスキーマ)を持つ
**Example**: `src/server/catalog/`(イベント・設問CRUD)、`src/server/results/`(結果アーカイブ・共有)

### サーバー: ライブセッション
**Location**: `src/server/session/`
**Purpose**: `QuizSessionDO`(Durable Object本体)と、そこから切り出した純粋ロジック(`phase-machine.ts`)・永続化層(`live-store.ts`)・トークン発行(`participant-token.ts`)
**Example**: フェーズ遷移ルールは`PhaseMachine.next`という単一の純粋関数に集約されている

### サーバー: 結線統合テスト
**Location**: `src/server/integration/`
**Purpose**: 単一ドメインを跨いだ通しの振る舞い(イベント状態遷移の一気通貫、アラームライフサイクル、3画面同期のE2E相当)を検証する。実HTTP+実WebSocket接続で行い、内部APIをバイパスしない
**Example**: `full-event-flow.test.ts`

### クライアント: 役割別アプリ
**Location**: `src/client/<role>/`
**Purpose**: `host`(主催者コンソール) / `stage`(投影画面) / `player`(回答画面) / `share`(結果共有ページ)。各ディレクトリは`<role>-app.tsx`をエントリに、その役割専用のAPIクライアント・WebSocketフック・画面コンポーネントを持つ
**Example**: `src/client/stage/stage-app.tsx`が`WaitingRoom`/`QuestionView`/`RevealView`/`RankingView`をフェーズに応じて出し分ける

### クライアント: 共通基盤
**Location**: `src/client/shared/`
**Purpose**: 役割を跨いで使う基盤(WebSocket接続管理`use-live-channel.ts`、サーバー時刻同期`use-server-clock.ts`、外観適用`theme.tsx`、接続状態表示`connection-badge.tsx`)
**Example**: 全ロールの画面が`ThemeProvider`でラップされ、CSS変数経由でイベントごとの配色を受け取る

### 共有型・プロトコル
**Location**: `src/shared/`
**Purpose**: サーバー・クライアント双方からimportされる型定義のみを置く。`domain-types.ts`(ドメイン型・`Result<T,E>`)、`protocol.ts`(WebSocketコマンド/イベントのZodスキーマ)、`scoring.ts`(採点純粋ロジック)
**Example**: `ClientCommand`/`ServerEvent`の判別可能ユニオンをここで一元定義し、型の不一致をコンパイル時に検出する

## Naming Conventions

- **ファイル**: kebab-case(`live-store.ts`, `question-editor.tsx`)
- **コンポーネント/型/クラス**: PascalCase(`QuizSessionDO`, `ThemeProvider`)
- **関数/変数**: camelCase
- **テストファイル**: 対象ファイルと同じディレクトリに`<対象>.test.ts(x)`として同居させる

## Import Organization

```typescript
// 相対importのみを使う。tsconfig.jsonに @shared/* エイリアスが定義されているが、
// 実際のコードでは使われていない(0箇所)。既存の慣習(相対import)に合わせること
import type { EventId } from "../../shared/domain-types";
import { createLiveStore } from "./live-store";
```

## Code Organization Principles

- **ドメインロジックはCloudflare APIに依存しない純粋関数として切り出す**(`ScoringModule`, `PhaseMachine`など)。DOやHTTPハンドラはこれらの純粋関数を呼び出す薄い層に留める
- **エラーは`Result<T, E>`で表現**し、`ok()`/`err()`ヘルパー(`shared/domain-types.ts`)で構築する。HTTP境界でのみエラーコードをステータスコードへ変換する
- **境界での検証はZod、境界の内側は型を信頼する**。`readJsonBody`のようなラッパーで不正なJSONもパース失敗として一様に扱う
- **DO内部の副作用(アラーム設定・同報)はコンストラクタで行わない**。ストレージ読み出しのみをコンストラクタで行い、副作用は各コマンドハンドラ内に閉じる
- タスク仕様(`.kiro/specs/*/tasks.md`)では、並列実装可能なタスクに`(P)`、他コンポーネントと独立した境界を持つモジュールに`_Boundary:_`という注記が付く。これは実装順序の制約であり、コードの構造そのものに現れるものではない
