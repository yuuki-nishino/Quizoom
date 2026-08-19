# Requirements Document

## Project Description (Input)
複数アカウントでのイベント共同運営（進行画面の操作権限を他ユーザーに委譲）

## 背景・ユースケース

現在、イベントの所有者(`event.owner_id`)は作成した本人のGoogleアカウント1つに固定されており、進行画面(ホストコンソール)の操作は `requireEventOwner`(`src/server/auth/guard.ts`)による `owner_id` との完全一致でしか許可されない。

想定シナリオ: 結婚式で新郎新婦がイベントを作成するが、当日の進行操作(出題・締切・正解発表など)は忙しい新郎新婦ではなく、友人にお願いしたい。友人は自分のGoogleアカウントでログインして操作したい。

## 現状の制約

- `event` テーブルは `owner_id` を単一カラムとして持つのみで、共同運営者の概念がない
- `checkEventOwnership` / `requireEventOwner` は `owner_id` との一致のみを検証している
- カタログAPI(`src/server/catalog/routes.ts`)・WebSocket接続時の host ロール検証(`QuizSessionDO#verifyRole`)のいずれも同じ仕組みに依存している

## やりたいこと

- イベントに対して、所有者とは別に「共同運営者(コホスト)」を複数人招待できるようにする
- 共同運営者は進行画面の操作(進行コマンド送信)ができる
- 権限の範囲は要検討: 進行操作のみ許可するのか、設問編集・削除・イベント削除まで含めるのか、招待自体は所有者のみ可能とするのか、など
  - → 本ドキュメントのRequirement 3・4で初期方針として決定済み(下記参照)

## 検討が必要な論点(Issue起票時点)

- 招待方法(メールアドレス指定？招待リンク？) → **Requirement 1・2で解決**: メールアドレス指定＋招待URL方式(メール送信は行わない)
- 権限の粒度(所有者専用操作 vs 共同運営者にも許可する操作の線引き) → **Requirement 3・4で解決**: 進行操作・設問編集・外観変更・公開・preflight・結果閲覧は共同運営者にも許可、イベント削除・参加者データ削除・共有設定変更・共同運営者管理は所有者専用
- DBスキーマ変更(例: `event_collaborator` テーブルの追加、マイグレーション) → **未解決。`/kiro:spec-design`で扱う**(要件フェーズはWHATのみを扱いHOWは対象外のため)
- `requireEventOwner` を使っている全箇所への影響範囲の洗い出し → **未解決。`/kiro:validate-gap`または`/kiro:spec-design`で扱う**

## 現時点でのスコープ

Issue起票時点では要件・設計が未整理だったため未着手だったが、本ドキュメントで要件を確定させた。次は設計フェーズ(`/kiro:spec-design`、必要なら事前に`/kiro:validate-gap`)に進む。

## Introduction

本機能は、イベント所有者(主催者)が自分以外のGoogleアカウントを「共同運営者」として招待し、進行画面(ホストコンソール)の操作権限を委譲できるようにする。既存のQuizoomは主催者アカウントを`event.owner_id`単一カラムで表現しており、所有者本人以外は一切の操作ができない。本機能により、結婚式の新郎新婦のように当日の進行操作を第三者(友人など)へ委ねたいケースに対応する。

招待の仕組みは、既存の参加用URL(要件4.1〜4.2)と同じ「推測困難な識別子を含むURLを主催者が発行し、LINEやメッセージ等で当人へ直接共有する」方式を採用する。Quizoomにはメール送信基盤が存在せず(`better-auth`はGoogle OAuthのみ有効)、新たに導入しない前提のため、招待通知そのものはメール送信では行わない。招待は特定のメールアドレスに対して発行し、そのメールアドレスでGoogleログインした人物のみが招待を受諾できるようにすることで、URLの転送・流用によるなりすましを防ぐ。

## Boundary Context

- **In scope**:
  - 所有者によるメールアドレス指定での共同運営者招待(招待URLの発行)
  - 招待されたメールアドレスでのGoogleログインによる招待の受諾
  - 共同運営者による進行画面操作・外観変更・設問編集など、開催に関わる操作
  - 所有者のみに残す操作(イベント削除、参加者データ削除、共同運営者の招待/解除、結果共有の有効化/無効化)の明確化
  - 共同運営者の一覧表示、所有者による解除、共同運営者自身による離脱
- **Out of scope**:
  - 招待通知のメール送信(URLの共有は主催者が既存の参加者への共有と同様に手動で行う)
  - 共同運営者間の権限差(全共同運営者は同一権限とし、段階的な権限レベルは設けない)
  - イベント所有権そのものの譲渡(所有者を別アカウントへ完全に移す機能)
- **Adjacent expectations**:
  - 既存の`requireEventOwner`(`src/server/auth/guard.ts`)を置き換えるのではなく、共同運営者も通過できるよう判定ロジックを拡張する
  - `QuizSessionDO#verifyRole`のhostロール検証も同じ拡張済みの権限判定に揃える
  - 破壊的操作の確認ダイアログ(既存要件11.6)の対象操作と、本機能で「所有者専用」とする操作の範囲を一致させる

## Requirements

### Requirement 1: 共同運営者の招待

**Objective:** As a イベント所有者, I want 特定のメールアドレスを指定して共同運営者を招待したい, so that 進行操作を任せたい相手だけに限定して権限を委譲できる

#### Acceptance Criteria

1. When 所有者が共同運営者のメールアドレスを指定して招待を作成した, the Event Collaboration Service shall 推測困難な識別子を含む招待URLを発行する。
2. The Event Collaboration Service shall 招待を特定の1つのメールアドレスに紐づけて保存する。
3. If 招待対象のメールアドレスが既に当該イベントの共同運営者として登録されている, then the Event Collaboration Service shall 招待の作成を拒否し、既に共同運営者である旨を通知する。
4. If 招待対象のメールアドレスが所有者自身のものである, then the Event Collaboration Service shall 招待の作成を拒否する。
5. If 所有者以外が共同運営者の招待を試みた, then the Event Collaboration Service shall 当該操作を拒否する。
6. The Event Collaboration Service shall 未失効の招待を同一イベント内で複数同時に発行できるようにする。

### Requirement 2: 招待の受諾

**Objective:** As a 招待されたユーザー, I want 招待URLからGoogleアカウントでログインするだけで共同運営者になりたい, so that 追加の手続きなしにすぐ進行操作に参加できる

#### Acceptance Criteria

1. When 招待URLへ未認証の利用者がアクセスした, the Event Collaboration Service shall Googleログインを求める。
2. When 招待URLへアクセスした利用者が、招待に紐づくメールアドレスと同一のGoogleアカウントでログイン済みである, the Event Collaboration Service shall 当該利用者を当該イベントの共同運営者として登録し、招待を受諾済みとする。
3. If 招待URLへアクセスした利用者のログイン済みGoogleアカウントのメールアドレスが、招待に紐づくメールアドレスと一致しない, then the Event Collaboration Service shall 共同運営者としての登録を拒否し、招待されたメールアドレスでのログインが必要である旨を通知する。
4. If 既に受諾済み、または所有者によって取り消された招待URLへアクセスされた, then the Event Collaboration Service shall 当該招待が無効である旨を表示する。
5. When 招待が受諾された, the Event Collaboration Service shall 当該招待を再利用不可の状態にする。

### Requirement 3: 共同運営者の権限範囲

**Objective:** As a 共同運営者, I want 所有者と同様に進行画面や設問・外観を操作したい, so that 当日の進行を所有者に代わって主体的に担える

#### Acceptance Criteria

1. While 利用者が対象イベントの共同運営者である, the Host Console shall 所有者と同様に進行画面(出題・締切・正解発表・一時停止・再開・ランキング表示)の操作を許可する。
2. While 利用者が対象イベントの共同運営者である, the Quiz Management Service shall 設問の作成・編集・並び替え・外観設定の変更を、所有者と同様に許可する。
3. While 利用者が対象イベントの共同運営者である, the Quiz Management Service shall イベントの公開操作と事前確認(preflight)の実行を、所有者と同様に許可する。
4. While 利用者が対象イベントの共同運営者である, the Quiz Management Service shall 確定結果の閲覧を、所有者と同様に許可する。
5. When 共同運営者が投影/参加者向けWebSocket接続時のhostロールで接続した, the Live Session Service shall 所有者からの接続と同様に進行コマンドを受理する。

### Requirement 4: 所有者専用操作の保護

**Objective:** As a イベント所有者, I want 破壊的な操作や共同運営者の管理は自分だけができるようにしたい, so that 意図しないデータ消失や権限の乗っ取りを防げる

#### Acceptance Criteria

1. If 共同運営者がイベントの削除を試みた, then the Quiz Management Service shall 当該操作を拒否する。
2. If 共同運営者が参加者データの削除を試みた, then the Quiz Management Service shall 当該操作を拒否する。
3. If 共同運営者が結果共有の有効化または無効化を試みた, then the Quiz Management Service shall 当該操作を拒否する。
4. If 共同運営者が新たな共同運営者の招待、または既存の共同運営者の解除を試みた, then the Event Collaboration Service shall 当該操作を拒否する。
5. The Quiz Management Service shall 所有者専用の操作が拒否された場合、権限がない旨を明示するエラーコードを返す。

### Requirement 5: 共同運営者の管理

**Objective:** As a イベント所有者と共同運営者, I want 現在の共同運営者を確認したり関係を解消したりしたい, so that 権限を持つ人物を把握し、不要になった権限を取り消せる

#### Acceptance Criteria

1. When 所有者が共同運営者の一覧表示を要求した, the Event Collaboration Service shall 受諾済みの共同運営者と、未受諾の招待の双方を区別して一覧表示する。
2. When 所有者が特定の共同運営者の解除を指示した, the Event Collaboration Service shall 当該共同運営者の権限を即座に無効化する。
3. When 所有者が未受諾の招待の取り消しを指示した, the Event Collaboration Service shall 当該招待を無効化する。
4. When 共同運営者が自身の離脱を指示した, the Event Collaboration Service shall 当該利用者自身の共同運営者権限を即座に無効化する。
5. If 権限を解除された利用者が対象イベントへの操作を試みた, then the Quiz Management Service shall 当該操作を拒否する。

### Requirement 6: データとプライバシー

**Objective:** As a イベント所有者, I want 共同運営者機能によって新たな情報漏洩リスクが生まれないようにしたい, so that 既存のプライバシー方針を損なわずに機能を追加できる

#### Acceptance Criteria

1. The Event Collaboration Service shall 招待の識別子(招待URLに含まれるトークン)を推測困難な形式で構成する。
2. The Event Collaboration Service shall 共同運営者・招待の管理画面を所有者以外からのアクセスから保護する。
3. When イベントが削除された, the Event Collaboration Service shall 当該イベントに紐づく共同運営者・招待の情報を連鎖的に削除する。
4. The Event Collaboration Service shall 招待に紐づくメールアドレスを、当該イベントの所有者以外の利用者には表示しない。
