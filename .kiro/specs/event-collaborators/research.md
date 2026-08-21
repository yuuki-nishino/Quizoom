# Research & Design Decisions

## Summary
- **Feature**: `event-collaborators`
- **Discovery Scope**: Extension（既存の認可・カタログ・ライブセッション機構を拡張する）
- **Key Findings**:
  - 所有権チェック(`owner_id`一致)が`auth/guard.ts`・`catalog/repository.ts`・`results/archive.ts`の3箇所に重複実装されている。詳細な調査結果は `gap-analysis.md` を参照(本ドキュメントでは重複しない)
  - `QuizSessionDO#verifyRole`は接続確立時に1回だけ権限判定を行い、以降はロールのブール判定のみで進行コマンドを処理する。共同運営者対応はこの1箇所の拡張で進行画面操作(要件3.1, 3.5)を満たせる
  - 招待URLの発行は既存の`join_code`/`stage_token`/`share_code`と同じ「推測困難な識別子を主催者が手動共有する」パターンを踏襲でき、新しい技術要素は不要

## Research Log

### 権限判定の一元化方法

- **Context**: `gap-analysis.md`のOption B(推奨)を採用するにあたり、`catalog/repository.ts`・`results/archive.ts`の private `requireOwnedEvent`をどう`guard.ts`に統合するか
- **Findings**:
  - `catalog/repository.ts`の`requireOwnedEvent`は`EventRow`(ドメイン固有のフル行)を返すのに対し、`results/archive.ts`の同名関数は`true`のみを返す。両者を1つの共通関数で置き換えるには、**認可(誰がアクセスできるか)とデータ取得(そのイベントの詳細行)を分離**する必要がある
  - `guard.ts`は`Env`(D1バインディング)以外の依存を持たないため、新設する関数が`event`テーブルと新設の`event_collaborator`テーブルの両方を参照しても、レイヤー違反にはならない(既存の`checkEventOwnership`も`event`テーブルを直接クエリしている)
- **Implications**: `guard.ts`に「アクセス可否(owner/collaborator/forbidden)」のみを判定する関数を新設し、`catalog/repository.ts`・`results/archive.ts`はその判定結果を受けてから、従来通り自ドメインのテーブルへ問い合わせる2段構成にする。設計セクション参照。

### 共同運営者になった後、イベントへどう辿り着くか

- **Context**: 要件2.2で共同運営者として登録された後、`EventList`(`GET /api/events`)は`WHERE e.owner_id = ownerId`のみで絞り込んでおり、共同運営者は自分のイベント一覧に招待先イベントが表示されない
- **Findings**: 要件には明記されていないが、要件3(共同運営者の権限範囲)を実際に利用可能にするための前提条件である
- **Implications**: `listEvents`を「所有 or 共同運営」の両方を返すよう拡張し、各行に役割(owner/collaborator)を付与する必要がある。design.mdのRequirements Traceabilityで要件3の実現手段として明記する

### 要件文言に対して境界が曖昧な操作

- **Context**: 要件3.2は「設問の作成・編集・並び替え・外観設定の変更」を共同運営者に許可すると定めるが、**設問の削除**・**イベント自体のタイトル/概要/定員編集**・**イベントの複製**については要件3にも要件4(所有者専用)にも明記がない
- **Findings**: これらは実装時に必ずどちらかへ分類する必要がある。他の要件との一貫性(「復元可能かどうか」「所有権の生成を伴うか」)から初期方針を立てる
- **Implications**:
  - 設問削除: 要件3.2の他の設問操作と同じ性質(復元不能だが影響はイベント内に閉じる)のため、**共同運営者にも許可**する初期方針とする
  - イベントのタイトル/概要/定員編集: 設問・外観編集と同じ「開催準備」操作のため、**共同運営者にも許可**する初期方針とする
  - イベントの複製: 複製は**新しいイベントを複製実行者が所有者として作成する**操作であり、既存イベントへの操作というより新規作成に近い。要件3の対象外と解釈し、**所有者専用**の初期方針とする
  - いずれも design.md の Open Questions / Risks に明記し、実装前に確認を仰ぐ

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A | 認可判定を3箇所に重複したまま個別拡張 | 変更が局所的、初期実装が速い | 技術的負債が拡大し、将来の権限変更のたびに3箇所を漏れなく直す必要がある | `gap-analysis.md`参照 |
| B(採用) | `guard.ts`にアクセス可否判定を一元化し、既存の重複を解消してから拡張 | 権限ロジックの一元管理、既存の技術的負債を解消 | 変更範囲がAより広く、既存テストへの影響確認が必要 | 本設計で採用 |
| C | 進行画面のみ先行対応する段階導入 | Issueのユースケースを最小差分で先に満たせる | 同じファイル群を2回に分けて触ることになり総工数増 | 今回は一括実装(B)を選択し、段階導入はしない |

## Design Decisions

### Decision: 認可レイヤーを「アクセス可否判定(guard.ts)」と「ドメインデータ取得(各repository)」に分離する

- **Context**: `catalog/repository.ts`と`results/archive.ts`の`requireOwnedEvent`をそのまま置き換えると、返り値の型(`EventRow` vs `true`)が異なり単純な統合ができない
- **Alternatives Considered**:
  1. `guard.ts`の関数がドメインごとに異なる行データを返せるようジェネリクス化する
  2. `guard.ts`は「owner/collaborator/forbidden」の判定結果のみを返し、行データの取得は呼び出し元が引き続き自分で行う
- **Selected Approach**: 2を採用。`guard.ts`に`checkEventAccess(env, eventId, userId): Result<AccessLevel, AuthError>`を新設し、`catalog/repository.ts`・`results/archive.ts`はこれを呼んだ後、従来通り自ドメインのテーブルを問い合わせる
- **Rationale**: 認可(誰が操作できるか)とデータ取得(何を返すか)の責務が明確に分離され、各ドメインの返り値型を変更せずに済む。既存の`Result<T, E>`パターンとも整合する
- **Trade-offs**: 呼び出し元でDBアクセスが2回(認可用に`event_collaborator`テーブル、データ取得用に`event`本体)になるが、D1のレイテンシと無料枠を踏まえると許容範囲(1操作あたり数十行規模のクエリ追加)
- **Follow-up**: 実装時に、頻度の高いエンドポイント(進行画面のWebSocket)でこの2回クエリがボトルネックにならないか確認する。ただしWS側は接続確立時の1回のみのため影響は小さい

### Decision: 招待・共同運営者を単一テーブルで状態管理する

- **Context**: 「未受諾の招待」と「受諾済みの共同運営者」を別テーブルにするか、1テーブルの状態カラムで表現するか
- **Alternatives Considered**:
  1. `event_invite`(招待)と`event_collaborator`(受諾済み)の2テーブル
  2. `event_collaborator`1テーブルに`status`(`pending`/`accepted`)カラムを持たせる
- **Selected Approach**: 2を採用
- **Rationale**: 既存の`result.share_code`/`share_enabled`(1行が状態遷移する)と同じパターンであり、招待から受諾への遷移は同一の行の更新として自然に表現できる。認可判定(`checkEventAccess`)も`status = 'accepted'`の行のみを見る1クエリで完結する
- **Trade-offs**: 招待の取り消し(要件5.3)は行の削除で表現するため、取り消し後に同じトークンへアクセスした場合と「そもそも存在しない」場合を区別できないが、要件2.4は「無効である旨を表示する」とのみ定めており、理由の区別までは要求していないため問題ない
- **Follow-up**: なし

## Risks & Mitigations

- 認可ロジックの一元化により既存テスト(`guard.test.ts`, `repository.test.ts`, `archive.test.ts`)への影響範囲が広い — 既存の全テストがgreenのまま維持されることをタスク実装時に必須の完了条件とする
- 要件文言が曖昧な操作(設問削除・イベント編集・複製)の分類を誤ると、意図しない権限漏れ/過剰権限になる — design.mdのOpen Questionsで明示し、タスク着手前にユーザーへ確認する

## References
- `.kiro/specs/event-collaborators/gap-analysis.md` — 既存コードの詳細調査(3箇所の重複実装の特定、影響範囲の洗い出し)
