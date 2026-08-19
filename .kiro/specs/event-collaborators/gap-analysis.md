# Gap Analysis: event-collaborators

## 1. Current State Investigation

### 権限判定ロジックが3箇所に重複している(最重要の発見)

`owner_id`との一致だけを見る「所有権チェック」が、**独立した3つの実装**として存在する。いずれも `row.owner_id !== ownerId` という同一のロジックだが、戻り値の型(エラー union)がそれぞれ異なるため、単純な共通化はできていない。

| 実装 | 関数 | 呼び出し元 | エラー型 |
|---|---|---|---|
| `src/server/auth/guard.ts` | `checkEventOwnership` / `requireEventOwner` | `media/routes.ts`(画像アップロード・配信)、`quiz-session-do.ts`(WebSocket hostロール接続時の1回のみの検証) | `AuthError` |
| `src/server/catalog/repository.ts` | `requireOwnedEvent`(private) | `listEvents`以外の全カタログ操作(`findEvent`/`createEvent`は例外/`updateEvent`/`duplicateEvent`/`deleteEvent`/`upsertQuestion`/`deleteQuestion`/`reorderQuestions`/`putTheme`/`findPublishInfo`/`publish`) | `CatalogError` |
| `src/server/results/archive.ts` | `requireOwnedEvent`(private) | `findForOwner`/`deleteParticipantData`/`enableSharing`/`disableSharing` | `ArchiveError` |

`catalogRoutes.ts`自体は`requireHost`(認証のみ)しか呼んでおらず、所有権チェックは**リポジトリ層の内部**に隠れている。この構造により、Requirement 3(共同運営者にも許可する操作)とRequirement 4(所有者専用操作)を実装するには、この3箇所すべてに手を入れる必要がある。

### 進行画面(WebSocket)の権限判定は「接続時に1回」だけ

`QuizSessionDO#verifyRole`は接続確立時に`requireEventOwner`を1回呼び、結果を`ConnectionRole`として`serializeAttachment()`に保存する。以降のコマンド送信では`role.role === "host"`のブール判定のみで、再度所有権を確認しない(`src/server/session/quiz-session-do.ts:213`)。

→ これは**有利な点**: `requireEventOwner`(または後継の権限判定関数)を1箇所拡張するだけで、進行画面の全コマンド(Requirement 3.1, 3.5)を一括してカバーできる。

### 招待URLの発行パターンは既存の`join_code`/`stage_token`/`share_code`が流用できる

`crypto.randomUUID()`または`randomShareCode()`(英数字12桁)による推測困難な識別子の発行パターンが3箇所で既に確立している(`catalog/repository.ts`の`publish`、`results/archive.ts`の`enableSharing`)。招待トークンも同じパターンを踏襲できる(Requirement 6.1)。

### `user`テーブルにメールアドレスがある

Better Authの`user`テーブル(`migrations/0002_better_auth.sql`)は`email TEXT NOT NULL UNIQUE`を持つ。招待の受諾判定(Requirement 2.2-2.3: ログイン済みアカウントのメールアドレスと招待先メールアドレスの一致確認)は、`requireHost`が返す`userId`から`user.email`を引くだけで実現できる。

### マイグレーション運用

`migrations/000N_*.sql`を連番で追加し、CI/CDで`wrangler d1 migrations apply --remote`が自動適用される(`docs/CI-CD.md`)。新テーブル追加は`0003_result_sharing.sql`(既存テーブルへの`ALTER TABLE`)より`0001_init.sql`の`CREATE TABLE`パターンに近い。

## 2. Requirements Feasibility Analysis

| Requirement | 技術要素 | ギャップ分類 |
|---|---|---|
| 1. 招待の作成 | 新規テーブル(招待/共同運営者)、招待発行API | **Missing**: テーブル・APIとも新規 |
| 2. 招待の受諾 | ログイン済みユーザーのemail取得、招待受諾API、URLルーティング(`/invite/:token`等) | **Missing**: 受諾フロー全体が新規。**Unknown**: クライアント側のルーティングをどのSPA(host?新規?)に置くか要検討 |
| 3. 共同運営者の権限範囲 | 3箇所の`requireOwnedEvent`系関数を「所有者 or 共同運営者」を許可する判定に拡張 | **Constraint**: 3箇所の重複実装が影響範囲を広げている |
| 4. 所有者専用操作の保護 | 上記3箇所のうち、`deleteEvent`/`deleteParticipantData`/`enableSharing`/`disableSharing`/招待管理系だけは「所有者のみ」の判定のまま残す必要がある | **Constraint**: Requirement 3と4で**同じ関数を2種類の厳格さで使い分ける**設計が必須。ここを設計フェーズで明確にしないと、緩めた判定が誤って破壊的操作にも適用されるリスクがある |
| 5. 共同運営者の管理(一覧・解除・離脱) | 新規CRUD API、`HostConsole`または新画面のUI | **Missing**: API・UIとも新規 |
| 6. データとプライバシー | イベント削除時のカスケード削除、メールアドレスの非公開 | **Constraint**: `event`への`ON DELETE CASCADE`外部キーパターンは`question`/`theme`等で確立済み。新テーブルも同様にできる |

### Research Needed(設計フェーズへ持ち越す項目)

- 招待受諾ページのクライアント実装場所: `src/client/host/`配下に新画面として追加するか、新しい`src/client/invite/`ロールを新設するか
- 招待済みだが未登録(Quizoomに一度もログインしていない)メールアドレスの扱い: `user`テーブルに該当行がない状態でも招待は作成できる必要がある(招待は`user.id`ではなく`email`文字列に紐づける設計になる見込み)
- 「所有者 or 共同運営者」判定と「所有者のみ」判定をどう命名・配置するか(例: `requireEventAccess` vs `requireEventOwner`を残しつつ別関数を追加する / 既存3箇所の重複を解消してから拡張する)

### Complexity Signals

CRUD(招待・共同運営者テーブル)+ 既存の複数箇所への認可ロジック変更 + 新規クライアント画面。単純なCRUD機能ではなく、**横断的関心事(認可)の変更**が主な複雑性の源泉。

## 3. Implementation Approach Options

### Option A: 3箇所の重複をそのままに、それぞれへ個別にcollaborator対応を追加

**対象ファイル**: `auth/guard.ts`, `catalog/repository.ts`, `results/archive.ts`の3箇所それぞれに、collaboratorを許可する分岐を追加。

**Trade-offs**:
- ✅ 各ファイルの変更が独立しており、既存コードへの影響が局所的
- ✅ 初期実装が速い
- ❌ 権限ロジックが3箇所×2種類(owner-or-collaborator / owner-only)= 最大6パターンに分散し、将来の権限変更(例: 権限レベルの追加)のたびに3箇所を漏れなく直す必要がある
- ❌ 既存の重複という技術的負債を温存・拡大する

### Option B: 認可ロジックを`auth/guard.ts`に一元化してから拡張(推奨)

**対象ファイル**: `catalog/repository.ts`と`results/archive.ts`の private `requireOwnedEvent`を削除し、`guard.ts`が提供する共通関数(例: `requireEventOwner`(所有者のみ)と新設する`requireEventAccess`(所有者 or 共同運営者))を呼ぶように統一。エラー型は各ドメインの`CatalogError`/`ArchiveError`へ`guard.ts`側の`AuthError`をマッピングする薄いアダプタで吸収する。

**Integration points**: `guard.ts`が新たに「共同運営者テーブルを引く」責務を持つため、`Env`(D1バインディング)以外の新規依存は発生しない。

**Trade-offs**:
- ✅ 権限判定が一箇所に集約され、Requirement 3/4の実装後も見通しが良い
- ✅ 既存の重複という技術的負債を今回で解消できる
- ❌ `catalog/repository.ts`・`results/archive.ts`のエラー型変換が必要で、Option Aよりタッチする箇所が広い
- ❌ 既存の全ownership関連テスト(`guard.test.ts`, `repository.test.ts`, `archive.test.ts`等)に影響が及ぶため、リグレッション確認の範囲が広い

### Option C: ハイブリッド(段階導入)

**フェーズ1**: `guard.ts`に`requireEventAccess`(所有者 or 共同運営者)を新設し、**進行画面(WebSocket)のみ**をcollaborator対応させる(Requirement 3.1, 3.5相当)。既存のカタログ・結果APIは変更しない。
**フェーズ2**: カタログAPI(設問編集・外観・公開等、Requirement 3.2-3.4)をOption Bの方針で追い付かせる。

**Trade-offs**:
- ✅ Issue本文のユースケース(結婚式当日の進行操作委譲)を最小差分で先に満たせる
- ✅ 段階的なリリースでリグレッションリスクを分散できる
- ❌ フェーズ1完了時点では要件3.2-3.4が未達成のため、機能として「中途半端」な期間が生じる
- ❌ 結局2回に分けて同じファイル群を触ることになり、総工数はOption Bより増える可能性

## 4. Effort & Risk

| Option | Effort | Risk | 理由 |
|---|---|---|---|
| A | M(3–7日) | Medium | 変更範囲は局所的だが、6パターンの分岐を後から一貫させる設計レビューが必要 |
| B | L(1–2週間) | Medium | 新規テーブル+3箇所の認可ロジック統合+新規招待フロー(API・UI)。ただし既存パターン(D1テーブル、トークン発行、Result<T,E>)の範囲内で完結し未知の技術要素はない |
| C | L(1–2週間、フェーズ合算) | Low〜Medium | フェーズ1は既存のWebSocket認可1箇所のみでSに近いが、フェーズ2を合算するとBと同程度 |

## 5. Recommendations for Design Phase

- **Option B(認可ロジックの一元化)を推奨**。今回のIssueが3箇所の重複を可視化した以上、ここで一元化しておかないと将来的な権限拡張(例: 閲覧専用の共同運営者を追加する等)のたびに同じ問題が再発する
- 設計フェーズで確定すべき最重要事項: `requireEventOwner`(所有者のみ・破壊的操作用)と`requireEventAccess`(所有者+共同運営者・通常操作用)を**明確に命名で区別**し、どのAPIエンドポイントがどちらを使うかをRequirement 3/4の対応表として設計書に明記すること
- 招待受諾のクライアント実装場所(`src/client/host/`拡張 or 新規ロール)を設計フェーズの早い段階で決定する
- DBスキーマは`event_collaborator`(受諾済み)と`event_invite`(未受諾)を分けるか、1テーブルに状態カラムを持たせるかを設計フェーズで比較検討する(既存の`result.share_code`/`share_enabled`パターンは後者に近い)
