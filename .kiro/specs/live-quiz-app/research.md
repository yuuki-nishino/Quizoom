# Research & Design Decisions

## Summary

- **Feature**: `live-quiz-app`
- **Discovery Scope**: New Feature（グリーンフィールド。既存コード・steering なし、フル調査を実施）
- **Key Findings**:
  - 本仕様の技術的な核心は「**状態を持つリアルタイム調停**」である。1イベント＝1つの権威ある状態機械が、出題時刻の確定・回答の一意受付・締切判定・100接続への同報を一箇所で担う必要がある。ステートレスな関数群では、要件8.1（ミリ秒精度の経過時間）と要件7.4（1設問1回答の厳密な冪等性）を競合状態なしに満たせない。
  - 要件12.1（待機中の固定課金ゼロ）と要件9.7（100同時接続）は通常トレードオフだが、**Cloudflare Durable Objects の WebSocket Hibernation API** はこれを両立する。接続を維持したままオブジェクトをメモリから退避でき、アイドル中は duration 課金が発生しない。かつ **送信側 WebSocket メッセージは無課金**で、同報中心の本アプリと課金モデルが一致する。
  - 対抗馬の Supabase は無料枠が **7日間の非アクティブでプロジェクト自動停止**する。年数回しか開催しない本アプリでは「当日ほぼ確実に停止している」ことを意味し、要件12.3 を運用手順で埋める必要が生じる。Cloudflare 構成にはこの停止概念がなく、要件12.3 はヘルスチェックの提供のみで満たせる。

## Research Log

### リアルタイム配信基盤の選定

- **Context**: 要件9.1（1秒以内の同報）、9.7（100同時接続）、9.8（サーバー基準時刻）、12.1（待機中の固定費ゼロ）、12.2（無償枠内）を同時に満たす基盤が必要。この選定が設計全体を規定するため最優先で調査した。
- **Sources Consulted**:
  - [Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
  - [Using WebSockets in Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
  - [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
  - [Supabase Free Tier Limits in 2026](https://www.itpathsolutions.com/supabase-free-tier-limits)
- **Findings**:
  - Durable Objects は Workers **無料プランで利用可能**（SQLite バックエンドに限定）。無料枠は 100,000 リクエスト/日、13,000 GB-s/日、SQLite は 5,000,000 行読取/日・100,000 行書込/日・5GB。
  - WebSocket 課金は特殊で、**受信メッセージは 20:1 に圧縮して課金**（100通＝5リクエスト相当）、**送信メッセージは無課金**、ping も無課金。接続確立時のみ1リクエスト。
  - Hibernation API（`state.acceptWebSocket()`）を使うと、JavaScript 実行がない間はオブジェクトが退避され **duration 課金が発生しない**。接続は Cloudflare 側で維持され、メッセージ到着時に自動復帰する。復帰時はコンストラクタが再実行される。
  - 接続ごとの状態は `serializeAttachment()`（最大16,384バイト）で保持でき、hibernation を跨いで復元される。`getWebSockets()` で全接続を列挙できるため同報が容易。
  - **アラームは hibernation を妨げる**。常時アラームを張る設計にすると duration 課金が発生し続けるため、アラームは締切時刻の1点のみに限定する必要がある。
  - Supabase 無料枠は 200 同時 Realtime 接続で接続数自体は足りるが、**7日間の非アクティブでプロジェクトが自動停止**する。
- **Implications**:
  - 1イベント = 1 Durable Object インスタンスとし、DO を出題・締切・採点の唯一の権威とする。要件8.1 のミリ秒計測と要件7.4 の1回答制約が、単一スレッド実行により**ロックなしで**保証される。
  - 想定負荷（1イベント＝102接続・1,000回答）は無料枠の1%未満に収まる。試算は「コスト試算」項に記載。
  - アラームは「現在出題中の設問の締切」1件のみに限定する設計制約を設ける。

### コスト試算（1イベントあたり）

- **Context**: 要件12.2 が「無償枠または低額の従量課金の範囲」と定めるため、想定負荷での実測見積もりが必要。
- **Findings**: 参加者100人・設問10問・投影1・進行1の標準的な開催を想定。

  | 項目 | 計算 | DO リクエスト換算 |
  |------|------|-------------------|
  | WebSocket 接続確立 | 102接続 | 102 |
  | 回答受信 | 100人 × 10問 = 1,000通 → 20:1 | 50 |
  | 進行操作（出題・締切・発表） | 約40通 | 2 |
  | 同報（出題・結果・ランキング） | 約3,000通（送信） | 0（無課金） |
  | **合計** | | **約154 / 100,000 日次上限** |

  D1 書込は結果アーカイブ時の 1,000行程度（上限 100,000行/日）。R2 は画像10点で 10MB 未満（上限10GB）。
- **Implications**: 1日に複数イベントを開催しても無料枠を使い切らない。要件12.2 は Cloudflare 構成で充足する。コスト上の実質的な制約は日次リクエスト上限ではなく、**同時接続数×メッセージ頻度**であり、本アプリの利用形態では問題にならない。

### 主催者認証の実装方式

- **Context**: 要件1.1 が「主催者自身がパスワードを設定・記憶する必要のない方式」を求める。要件10.1 は参加者から個人情報を取得しないことを求めるため、認証対象は主催者のみ。
- **Sources Consulted**:
  - [Setting up Better Auth with Cloudflare Workers + D1 + Kysely](https://kemalyilmaz.com/blog/setting-up-better-auth-with-cloudflare-workers-d1-kysely/)
  - [Cloudflare Workers & SvelteKit: BetterAuth, Google OAuth](https://jilles.me/cloudflare-workers-sveltekit-betterauth-custom-domain-google-oauth-otp-email-securing-your-application/)
- **Findings**:
  - Better Auth は Workers + D1 で動作する。Kysely + `kysely-d1` ダイアレクトを介して D1 に接続する。
  - Workers ではリクエストごとに D1 バインディングを受け取るため、**シングルトンの auth インスタンスをエクスポートできない**。D1 インスタンスを引数に取るファクトリ関数として構成する必要がある。
  - Google OAuth を採用すればメール送信基盤が不要になる。マジックリンク方式は無料枠のメール送信レート制限（多くのサービスで時間あたり数通）に抵触するリスクがある。
- **Implications**:
  - Better Auth + Google OAuth（単一プロバイダ）を採用。パスワード認証・メール送信は実装しない。
  - auth インスタンスはファクトリ関数として実装し、リクエストスコープで生成する。この制約を設計の実装ノートに明記する。
  - 主催者は Google アカウント必須となる。これは受容するトレードオフ（決定事項に記載）。

### フロントエンド配信方式

- **Context**: 要件11.3（モバイル回線で3秒以内に操作可能）と要件12.1（待機中の固定費ゼロ）を満たす配信方式が必要。
- **Sources Consulted**: [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- **Findings**:
  - Workers Static Assets への**リクエストは全プランで無課金・無制限**。`run_worker_first=false`（既定）では Worker 呼び出し自体が発生しない。
  - 本アプリは SEO 不要・初期表示にサーバーデータ不要（回答画面はWebSocket接続後に状態を受信）であり、SSR の必要性がない。
- **Implications**:
  - React SPA を Workers Static Assets として配信し、API と WebSocket のみ Worker/DO が処理する構成とする。静的配信が無課金であるため、要件12.1 への寄与が大きい。
  - SSR フレームワーク（Next.js on OpenNext）は CPU 課金とビルド複雑度を増やすだけで便益がないため採用しない。

### 画像の保護と配信

- **Context**: 要件2.5（設問画像）、3.4（ロゴ・背景画像）、10.6（イベント関係者のみ参照可能）。
- **Findings**:
  - R2 無料枠は 10GB-month ストレージ、Class A 100万操作/月、Class B 1,000万操作/月。**egress 無課金**。
  - R2 バケットを公開せず Worker 経由で配信すれば、セッション検証を挟める。ただし Worker 経由の配信はリクエスト課金対象（静的アセットではない）。
- **Implications**:
  - Worker 経由で配信し、イベントの有効なセッション（主催者または当該イベントの参加者）を検証する。想定リクエスト数（100人×10画像＝1,000）は無料枠に対して十分小さい。
  - 不変コンテンツとして `Cache-Control: private, max-age` を付与し、再取得を抑制する。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| **Stateful Actor（採用）** | 1イベント＝1 Durable Object。ライブ進行の状態機械・WebSocket ハブ・採点を単一アクターが所有。カタログと結果は D1。 | 単一スレッド実行により競合状態が原理的に発生しない。出題時刻とミリ秒計測が単一時計で完結。同報が `getWebSockets()` で完結。hibernation により待機コストゼロ。 | Cloudflare への強い結合。DO の実行モデル（コンストラクタ再実行、アラームと hibernation の干渉）の理解が必須。 | 要件8.1/7.4/9.7/9.8/12.1 を同時に満たす唯一の候補 |
| Managed BaaS Realtime | Supabase Realtime または Firestore のリアルタイムリスナに DB 変更を配信させる。 | 実装が薄い。認証・DB・ストレージが同梱。 | 状態機械の権威が不在で、締切判定と1回答制約をDB制約＋クライアント調停で作る必要がある。Supabase は7日で自動停止し要件12.3 が運用手順頼みになる。 | 却下 |
| 常駐 Node サーバー + Socket.IO | VM/コンテナ上に常駐プロセスを置く。 | 実装知見が豊富。ライブラリが成熟。 | 待機中も固定費が発生し**要件12.1 に真正面から違反**。スケール時のセッションアフィニティも別途必要。 | 却下 |
| サーバーレス関数 + 外部 Pub/Sub | Ably/Pusher 等の同報サービスに委譲。 | 接続管理を外部化できる。 | 状態の権威が依然不在。ベンダーが1つ増え、無料枠の同時接続上限とメッセージ課金が新たな制約になる。 | 却下 |

## Design Decisions

### Decision: ライブ進行状態を Durable Object に集約する

- **Context**: 要件8.1 は出題時刻から回答受信までのミリ秒計測を、要件7.4 は同一設問への2回目以降の回答拒否を、要件9.8 はサーバー基準の残り時間算出を求める。これらは分散環境では競合状態と時計ずれの温床になる。
- **Alternatives Considered**:
  1. D1 に楽観ロック（UNIQUE制約）を張り、ステートレス Worker が回答を書き込む — 出題時刻の読み出しが毎回必要でレイテンシが増え、同報の宛先管理が別途必要。
  2. クライアント側で経過時間を計測して送信 — 端末時計の改竄で順位を不正操作できる。要件9.8 に違反。
- **Selected Approach**: `QuizSessionDO`（イベントIDでスコープ）が、出題・締切・回答受付・採点・同報を単独で所有する。経過時間は DO 内の `Date.now()` のみを基準とし、クライアントには `deadlineAt` と `serverNow` を配って表示用カウントダウンを描画させる。
- **Rationale**: DO は単一スレッドで直列実行されるため、「回答済みか」の判定と記録がアトミックになり、追加のロック機構が不要。時計が1つに固定されるため計測が公平。
- **Trade-offs**: Cloudflare プラットフォームに強く結合する。移植する場合は同等のアクターモデル（例: 常駐プロセス＋イベント単位のシャーディング）への置換が必要になる。
- **Follow-up**: hibernation からの復帰時にコンストラクタが再実行される点を踏まえ、コンストラクタでは DO ストレージからの状態復元のみを行い、アラーム再設定などの副作用を持たせない。

### Decision: ライブ状態と永続カタログの二層分離

- **Context**: 要件1.3（イベント一覧）や要件10.2（終了後の結果参照）は永続的なクエリ可能ストアを要するが、ライブ中の高頻度書込を D1 に直接向けると遅延と行書込上限の双方で不利になる。
- **Alternatives Considered**:
  1. 全て D1 に集約 — ライブ中の回答書込が DO→D1 の往復となり、要件9.1 の1秒以内に対する余裕が減る。
  2. 全て DO ストレージに集約 — 主催者のイベント横断一覧（要件1.3）が全 DO の走査になり実現困難。
- **Selected Approach**: D1 が「カタログ（アカウント・イベント・設問・外観設定）」と「確定済み結果アーカイブ」を所有。DO が「開催中のライブ状態（参加者・回答・進行フェーズ）」を所有。イベント開始時に DO がカタログのスナップショットを取り込み、確定時に結果を D1 へ書き戻す。
- **Rationale**: 各データに単一の所有者が定まり、要件1.6（開催中の設問変更禁止）がスナップショット取り込みによって自然に強制される。
- **Trade-offs**: 開始後のカタログ変更はライブに反映されない。ただし要件1.6 がこれを明示的に要求しているため、制約ではなく仕様の実現手段となる。例外は外観設定（要件3.7 が開催中の反映を要求）であり、これのみ専用の反映経路を設ける。
- **Follow-up**: 結果書き戻しの冪等性を確保し、リトライ時に重複行が発生しないようにする。

### Decision: 参加者識別を署名付きトークンで行う

- **Context**: 要件4.7（同一端末での再訪時に再入力不要）、要件9.3（リロード後も回答保持）、要件10.1（個人情報を取得しない）。
- **Alternatives Considered**:
  1. Cookie セッション — 主催者認証と同じ基盤を流用できるが、参加者は匿名かつイベント単位でスコープするため、認証基盤に匿名ユーザーを大量に作ることになる。
  2. ニックネームのみで識別 — 要件4.5 で一意性は担保されるが、なりすましで他人の回答を上書きできる。
- **Selected Approach**: 参加登録時に `participantId` と HMAC 署名付きトークンを発行し、端末の `localStorage` にイベントIDでスコープして保存する。WebSocket 接続時にトークンを提示して本人性を検証する。
- **Rationale**: 個人情報を一切含まず、イベント単位で完結し、主催者認証基盤とは独立して軽量に実装できる。
- **Trade-offs**: 端末を変えると参加を引き継げない。会場でのその場参加という利用形態では実害が小さい。
- **Follow-up**: プライベートブラウジングや `localStorage` 制限下での挙動を検証し、失敗時は再参加に誘導する。

### Decision: 主催者認証を Google OAuth 単独に限定する

- **Context**: 要件1.1 がパスワードレスを要求。要件12 が運用コスト最小化を要求。
- **Alternatives Considered**:
  1. マジックリンク — メール送信基盤が必要。無料枠のレート制限が当日の再ログインを阻害するリスク。
  2. 複数プロバイダ対応 — 実装・検証コストが増える。
- **Selected Approach**: Better Auth + Google OAuth の単一プロバイダ。
- **Rationale**: メール基盤が不要で追加コストゼロ。パスワード保管の責務も負わない。
- **Trade-offs**: Google アカウントを持たない主催者は利用できない。将来プロバイダを追加する場合も Better Auth の設定追加で対応可能なため、拡張余地は残る。
- **Follow-up**: OAuth リダイレクト URI を環境ごとに登録する必要がある。

## Risks & Mitigations

- **アラームによる hibernation 阻害でコストが発生する** — アラームは「出題中の設問の締切」1件のみに限定し、締切処理完了後は必ず解除する。常時ポーリング用のアラームは設けない。
- **hibernation 復帰時のコンストラクタ再実行による状態不整合** — コンストラクタは DO ストレージからの読み出しのみとし、初期化の副作用（アラーム設定・同報）を持たせない。ライブ状態は全て DO ストレージに永続化し、メモリ上の変数のみに依存しない。
- **会場回線の輻輳による回答集中時の取りこぼし** — 回答送信に応答確認と再送手段を設ける（要件9.6）。回答受付は冪等であり（要件7.4）、重複再送は最初の1件のみ有効となるため再送が安全。
- **開催当日に主催者が Google 再認証を求められる** — 開催前チェック（要件12.4）に認証状態の確認を含め、事前に検知させる。
- **投影画面の URL 漏洩による問題事前閲覧** — 投影画面は「現在配信中のフェーズのみ」を受信し、未出題の設問データを一切保持しない設計とする（先読みキャッシュを行わない）。
- **無料枠の日次上限超過時に操作が失敗する** — 上限到達は開催中断に直結する。想定負荷は上限の1%未満だが、複数イベント同時開催時の見積もりを運用ドキュメントに残す。

## References

- [Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) — 無料プランの上限、WebSocket 課金比率、hibernation の課金上の扱い
- [Using WebSockets in Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) — Hibernation API のハンドラ契約、`serializeAttachment` の制限、アラームとの干渉
- [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/) — 静的アセットの無課金扱い、Workers 無料枠
- [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/) — 行読取・書込の日次上限
- [Supabase Free Tier Limits in 2026](https://www.itpathsolutions.com/supabase-free-tier-limits) — 7日間非アクティブでの自動停止、200 同時 Realtime 接続
- [Setting up Better Auth with Cloudflare Workers + D1 + Kysely](https://kemalyilmaz.com/blog/setting-up-better-auth-with-cloudflare-workers-d1-kysely/) — Workers 環境での auth インスタンス生成制約
