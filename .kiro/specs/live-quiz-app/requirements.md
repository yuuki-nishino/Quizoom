# Requirements Document

## Project Description (Input)
イベントの余興などで使えるクイズ作成Webアプリ。事前にクイズを作っておいて、当日、参加者がQRコードを読み取ってクイズに回答できる。進行画面と問題投影画面、回答画面が必要。正解した数＋回答までにかかった時間 を加味してランキングを作成することで、同率の人がいることを防ぐようにする。当日投影する画面や回答画面のデザイン（色など）やタイトルなどは作成者側である程度カスタマイズできるようにしたい

**補足（利用シチュエーションの方針）**: 特定の用途に限定せず、汎用的なリアルタイムクイズ大会ツールとして設計する。結婚式の披露宴・二次会はあくまで代表的な利用シーンの一例であり、社内イベント、懇親会、勉強会、学校行事、展示会、オンライン配信など、人が集まる場全般での利用を想定する。

## Introduction

本プロダクトは、その場に集まった参加者が一斉に回答するリアルタイムクイズ大会を、Webブラウザだけで実施できるようにする汎用アプリケーションである。結婚式の二次会、社内イベント、懇親会、勉強会、学校行事、展示会ブースなど、大画面と参加者のスマートフォンが使える場であれば用途を問わず利用できる。

主催者は事前にクイズイベントと設問を作成し、見た目（タイトル・配色など）をカスタマイズしておく。当日は会場のスクリーンに「問題投影画面」を映し、主催者は手元の「進行画面」から出題を制御する。参加者は配布・投影されたQRコードをスマートフォンで読み取るだけで、アプリのインストールやアカウント登録なしに「回答画面」から参加できる。

採点は正解数を第一基準とし、回答までに要した時間を第二基準として順位を決定する。これにより、多人数が参加しても同率順位が発生しにくく、表彰をスムーズに行える。

主要な利用者は以下の3者である。

- **主催者（ホスト）**: イベントと設問を作成し、当日の進行を操作する
- **参加者（回答者）**: スマートフォンでQRコードを読み取り回答する
- **会場スクリーン（投影）**: 問題・締切・正解・ランキングを大画面に表示する

## Boundary Context

- **In scope**:
  - 主催者アカウントの認証と、イベント／設問の事前作成・編集
  - イベント単位の外観カスタマイズ（タイトル、配色、背景、ロゴ画像）
  - 参加用QRコード／URLの発行と参加者の参加（ニックネーム登録、アカウント登録不要）
  - 進行画面・問題投影画面・回答画面の3画面とそのリアルタイム同期
  - 正解数と回答所要時間に基づく採点・ランキング算出と表示
  - 通信断・リロードからの復帰、イベント終了後のデータ保持と削除
- **Out of scope**:
  - 有料課金・決済機能
  - 参加者同士のチャット、写真投稿、SNS連携
  - クイズ以外の企画機能（ビンゴ、抽選、アンケート、投票など）
  - 招待状送付・出欠管理などのイベント運営全般の機能
  - 特定の用途（結婚式、社内研修など）に固有のテンプレートや業務連携
  - 専用ネイティブアプリ（iOS/Android）の提供
  - 主催者以外への権限委譲（共同編集・複数ホストの同時操作）
- **Adjacent expectations**:
  - 参加者は会場Wi-Fiまたはモバイル回線を利用し、通信品質は保証されない前提とする
  - 投影はPCブラウザをプロジェクター／HDMI出力または画面共有に接続して行う前提とする
  - 画像アップロードを伴うため、外部オブジェクトストレージ相当の保存先が必要になる
  - 主催者の認証は外部IDプロバイダに委ね、パスワードを自前で保持しない前提とする
  - 開催頻度が低い（年に数回程度）用途を想定し、待機中に固定費が発生しない構成を前提とする

## Requirements

### Requirement 1: 主催者アカウントとイベント管理

**Objective:** As a 主催者, I want クイズイベントを作成・保存・再編集できるようにしたい, so that 開催当日までに余裕をもって準備し、当日は完成した状態で使える

#### Acceptance Criteria

1. The Quiz Management Service shall 主催者を一意に識別できる認証手段を提供し、主催者自身がパスワードを設定・記憶する必要のない方式とする。
2. If 未認証の利用者がイベントの作成、参照、または編集を試みた, then the Quiz Management Service shall 当該操作を拒否し、ログインを求める。
3. When 主催者が新規イベントの作成を確定した, the Quiz Management Service shall 一意のイベントIDを採番し、当該イベントを作成者本人に紐づけて保存する。
4. When 主催者がイベント一覧を開いた, the Quiz Management Service shall 当該主催者が作成したイベントのみを、イベント名・設問数・状態（下書き／公開中／開催中／終了）とともに一覧表示する。
5. If 主催者が自分の所有しないイベントの参照または編集を試みた, then the Quiz Management Service shall 当該操作を拒否し、権限がない旨を通知する。
6. When 主催者がイベントの複製を指示した, the Quiz Management Service shall 設問と外観設定を引き継いだ新規イベントを作成し、参加者データと回答結果は引き継がない。
7. While イベントの状態が「開催中」である, the Quiz Management Service shall 設問の追加・削除・正解の変更を禁止する。
8. When 主催者がイベントの削除を指示した, the Quiz Management Service shall 削除対象の名称を示した確認を求め、確認後に当該イベントと関連する設問・参加者・回答データを削除する。

### Requirement 2: 設問の作成と編集

**Objective:** As a 主催者, I want 設問・選択肢・正解・制限時間を事前に登録し順序を整えたい, so that 当日の進行内容を意図どおりに固定できる

#### Acceptance Criteria

1. When 主催者が設問を追加した, the Quiz Management Service shall 問題文、選択肢、正解、制限時間を保持した設問をイベント末尾に追加する。
2. The Quiz Management Service shall 1設問あたり2個以上4個以下の選択肢を登録できるようにする。
3. When 主催者が設問形式として二択または四択を選択した, the Quiz Management Service shall 選択した形式に対応する選択肢入力欄を提示する。
4. The Quiz Management Service shall 各設問にちょうど1つの正解選択肢を指定できるようにする。
5. When 主催者が設問に画像を添付した, the Quiz Management Service shall 当該画像を保存し、問題投影画面と回答画面の双方から参照できるようにする。
6. The Quiz Management Service shall 各設問に5秒以上300秒以下の制限時間を設定できるようにする。
7. When 主催者が設問の並び順を変更した, the Quiz Management Service shall 変更後の順序を保存し、以降の出題順に反映する。
8. When 主催者が設問に解説文を入力した, the Quiz Management Service shall 当該解説文を正解発表時に表示する対象として保存する。
9. If 主催者が正解を1つ指定していない設問、または選択肢が2個未満の設問を保存しようとした, then the Quiz Management Service shall 保存を拒否し、不足している項目を指摘する。
10. If イベントに設問が1件も存在しない状態で公開が試みられた, then the Quiz Management Service shall 公開を拒否し、設問の登録が必要である旨を通知する。

### Requirement 3: 外観カスタマイズ

**Objective:** As a 主催者, I want タイトルや配色などの見た目をイベントごとに設定したい, so that イベントのテーマや会場の雰囲気に合った演出ができる

#### Acceptance Criteria

1. When 主催者がイベントタイトルおよびサブタイトルを設定した, the Quiz Management Service shall 当該文言を問題投影画面と回答画面の見出しに反映する。
2. The Quiz Management Service shall 基調色・アクセント色・背景色・文字色を主催者が指定できるようにする。
3. The Quiz Management Service shall あらかじめ用意された複数の配色テーマから選択するだけで外観を決定できるようにする。
4. When 主催者がロゴまたは背景画像をアップロードした, the Quiz Management Service shall 当該画像を問題投影画面および回答画面の指定位置に表示する。
5. When 主催者が外観設定を変更した, the Quiz Management Service shall 変更内容を反映したプレビューを、投影用と回答用のそれぞれについて表示する。
6. If 主催者が指定した文字色と背景色の組み合わせがコントラスト比4.5:1を下回った, then the Quiz Management Service shall 視認性が低い旨を警告する。
7. While イベントの状態が「開催中」である, the Quiz Management Service shall 外観設定の変更を、進行を中断させることなく各画面へ反映する。

### Requirement 4: QRコード発行と参加登録

**Objective:** As a 参加者, I want QRコードを読み取るだけで参加したい, so that アプリのインストールや会員登録をせずにその場で回答を始められる

#### Acceptance Criteria

1. When 主催者がイベントを公開した, the Event Session Service shall 当該イベント固有の参加用URLと、それを表すQRコードを発行する。
2. The Event Session Service shall 発行したQRコードを、印刷用および投影用として主催者が取得できるようにする。
3. When 参加者が参加用URLへアクセスした, the Event Session Service shall アカウント登録を要求することなくニックネーム入力画面を表示する。
4. When 参加者がニックネームを送信した, the Event Session Service shall 当該参加者に一意の参加者IDを発行し、端末上のセッションと紐づけて参加登録する。
5. If 入力されたニックネームが同一イベント内で既に使用されている, then the Event Session Service shall 登録を拒否し、別のニックネームの入力を促す。
6. If 参加者数がイベントに設定された上限に達した状態で新規参加が試みられた, then the Event Session Service shall 参加を拒否し、定員に達している旨を表示する。
7. When 参加済みの参加者が同一端末で参加用URLを再度開いた, the Event Session Service shall 既存の参加者IDを復元し、ニックネームの再入力を求めない。
8. If イベントの状態が「終了」であるときに参加が試みられた, then the Event Session Service shall 参加を拒否し、イベントが終了している旨を表示する。
9. When イベント開始後に新規参加が行われた, the Event Session Service shall 当該参加を受け付け、未出題の設問のみを回答対象とする。
10. When 途中参加した参加者が回答画面を開いた, the Answer Screen shall 出題済みの設問には回答できず順位が不利になる旨を通知する。

### Requirement 5: 進行画面（ホストコンソール）

**Objective:** As a 主催者, I want 手元の画面から出題・締切・正解発表・結果表示を操作したい, so that 会場の空気を見ながら自分のペースで進行できる

#### Acceptance Criteria

1. While イベントが開始前である, the Host Console shall 現在の参加者数と参加者名の一覧を表示し、開始操作を提供する。
2. When 主催者が出題操作を行った, the Host Console shall 対象設問を問題投影画面と回答画面へ同時に配信し、制限時間の計測を開始する。
3. While 設問が出題中である, the Host Console shall 残り時間、回答済み人数、未回答人数をリアルタイムに表示する。
4. When 主催者が締切操作を行った, the Host Console shall 制限時間の残存にかかわらず当該設問の回答受付を終了する。
5. When 制限時間が経過した, the Host Console shall 当該設問の回答受付を自動的に終了する。
6. When 回答受付が終了した, the Host Console shall 正解と選択肢別の回答分布を表示し、正解発表操作を提供する。
7. When 主催者が次の設問へ進む操作を行った, the Host Console shall 次設問を出題待機状態にする。
8. While 最終設問の正解発表が完了している, the Host Console shall 次の設問へ進む操作を提供せず、結果発表操作のみを提供する。
9. While 設問が出題中である, the Host Console shall 制限時間の計測を一時中断し、任意のタイミングで計測を再開できるようにする。
10. If 主催者が最終設問の回答受付終了後に結果発表操作を行った, then the Host Console shall 最終ランキングを確定し、問題投影画面へ配信する。
11. While 直前の設問が正解発表前である, the Host Console shall 主催者の誤操作からの回復手段として、当該設問の回答受付を再開できるようにする。
12. If 正解発表済みの設問に対して回答受付の再開が試みられた, then the Host Console shall 当該操作を拒否する。
13. When 回答受付が再開された, the Host Console shall 既に受け付けた回答を保持し、未回答の参加者からの回答のみを追加で受け付ける。

### Requirement 6: 問題投影画面

**Objective:** As a 会場の参加者全員, I want スクリーンに問題と結果が大きく表示されること, so that 手元の端末を見なくても進行状況と盛り上がりを共有できる

#### Acceptance Criteria

1. When 主催者が投影画面のURLを開いた, the Presentation Screen shall イベントタイトルと参加用QRコードを表示した待機状態になる。
2. When 設問が出題された, the Presentation Screen shall 問題番号、問題文、選択肢、添付画像、および残り時間のカウントダウンを表示する。
3. While 設問が出題中である, the Presentation Screen shall 回答済み人数を全参加者数に対する割合とともに表示する。
4. When 回答受付が終了した, the Presentation Screen shall 正解の選択肢を強調表示し、選択肢別の回答分布と解説文を表示する。
5. When 主催者が中間ランキングの表示を指示した, the Presentation Screen shall 上位者の順位、ニックネーム、正解数、合計回答時間を表示する。
6. When 最終ランキングが確定した, the Presentation Screen shall 上位者を演出付きで発表する。
7. The Presentation Screen shall 表示内容をプロジェクター投影に耐える文字サイズとコントラストで描画する。
8. The Presentation Screen shall 個々の参加者の回答内容を、回答受付が終了するまで表示しない。
9. While イベントが開始前の待機状態である, the Presentation Screen shall 現在の参加者数を表示する。

### Requirement 7: 回答画面

**Objective:** As a 参加者, I want 自分のスマートフォンから素早く回答したい, so that 制限時間内に確実に回答を送信し、順位を狙える

#### Acceptance Criteria

1. While イベントが開始前である, the Answer Screen shall 自分のニックネームと開始待ちである旨を表示する。
2. When 設問が出題された, the Answer Screen shall 選択肢を選択可能なボタンとして表示し、残り時間を表示する。
3. When 参加者が選択肢を選んで回答を送信した, the Answer Screen shall 回答を受け付けた旨と、選択した内容を表示する。
4. If 参加者が同一設問に対して2回目以降の回答送信を試みた, then the Answer Screen shall 追加の回答を受け付けず、最初の回答を有効とする。
5. If 回答受付終了後に回答が送信された, then the Answer Screen shall 当該回答を無効とし、受付が終了した旨を表示する。
6. When 回答受付が終了した, the Answer Screen shall 自分の回答の正誤、現時点の正解数、および自分の順位を表示する。
7. The Answer Screen shall 回答受付終了まで、正解および他の参加者の回答内容を表示しない。
8. The Answer Screen shall スマートフォンの縦画面で、選択肢を拡大縮小操作なしに押下できるように表示する。
9. When 最終ランキングが確定した, the Answer Screen shall 自分の最終順位、正解数、合計回答時間を表示する。

### Requirement 8: 採点とランキング算出

**Objective:** As a 主催者, I want 正解数と回答時間に基づく明確な順位を得たい, so that 同率順位に悩まされず賞品の授与を滞りなく行える

#### Acceptance Criteria

1. When 回答が受け付けられた, the Scoring Service shall 当該設問の出題時刻から回答受信時刻までの経過時間をミリ秒単位で記録する。
2. When 回答受付が終了した, the Scoring Service shall 各回答の正誤を判定し、正解した参加者の正解数に1を加算する。
3. The Scoring Service shall 全ての設問を等価に扱い、設問ごとに異なる配点を設けない。
4. The Scoring Service shall 順位を、第1基準に正解数の降順、第2基準に正解した設問の合計回答時間の昇順で決定する。
5. If 未回答または不正解の設問が存在する, then the Scoring Service shall 当該設問の回答時間を合計回答時間に加算しない。
6. If 正解数と合計回答時間が完全に一致する参加者が複数存在する, then the Scoring Service shall 先に参加登録した参加者を上位として順位を確定する。
7. The Scoring Service shall 途中参加した参加者を、他の参加者と同一の基準でランキングに含める。
8. If 参加登録より前に出題が終了した設問が存在する, then the Scoring Service shall 当該設問を未回答として扱い、正解数にも合計回答時間にも加算しない。
9. When ランキングの表示が要求された, the Scoring Service shall 順位、ニックネーム、正解数、合計回答時間を含むランキングを返す。
10. While 設問の回答受付が継続している, the Scoring Service shall 当該設問の正誤判定結果を参加者へ開示しない。
11. When 主催者が結果の共有を有効にした, the Quiz Management Service shall 推測困難な識別子を含む閲覧専用の共有URLを発行する。
12. When 共有URLへアクセスされた, the Quiz Management Service shall 認証を要求することなく、最終ランキングを閲覧専用で表示する。
13. When 主催者が結果の共有を無効にした, the Quiz Management Service shall 以降の当該共有URLへのアクセスを拒否する。
14. The Quiz Management Service shall 共有ページに表示された最終ランキングを、参加者が画像として保存できるようにする。

### Requirement 9: リアルタイム同期と接続復帰

**Objective:** As a 主催者と参加者, I want 画面が遅延なく同期し、通信が切れても復帰できること, so that 会場の不安定な回線環境でも進行が破綻しない

#### Acceptance Criteria

1. When 主催者が進行操作を行った, the Realtime Sync Service shall 通常のネットワーク条件下で1秒以内に問題投影画面と全ての回答画面へ状態変化を反映する。
2. If 参加者の端末が通信断から復帰した, then the Realtime Sync Service shall 現在の進行状態を再送信し、当該参加者の画面を最新状態に復元する。
3. If 参加者が回答画面をリロードした, then the Realtime Sync Service shall 同一の参加者IDで再接続し、既に送信済みの回答を保持する。
4. If 問題投影画面が通信断から復帰した, then the Realtime Sync Service shall 現在の設問と残り時間を再表示する。
5. While 端末が接続不良の状態にある, the Realtime Sync Service shall 当該端末の画面に接続状態を示す表示を行う。
6. If 回答送信が通信エラーで失敗した, then the Answer Screen shall 送信失敗を通知し、再送信手段を提供する。
7. The Realtime Sync Service shall 1イベントあたり100人以上の同時接続を、進行操作の遅延を1秒以内に保ったまま処理する。
8. The Realtime Sync Service shall 各設問の残り時間を、端末のローカル時刻ではなくサーバー基準の時刻で算出する。

### Requirement 10: データ保持とプライバシー

**Objective:** As a 主催者, I want 参加者データが適切に保護され、開催後に整理されること, so that 参加者の個人情報に関する不安なくイベントを実施できる

#### Acceptance Criteria

1. The Event Session Service shall 参加者に対し、氏名・メールアドレス・電話番号などの個人を特定する情報の入力を求めない。
2. When イベントが終了した, the Quiz Management Service shall 当該イベントの結果を主催者が後から参照できるように保持する。
3. When 主催者が参加者データの削除を指示した, the Quiz Management Service shall 当該イベントの参加者情報と回答履歴を削除し、削除後は復元できない旨を事前に通知する。
4. The Quiz Management Service shall 参加用URLを推測困難な識別子で構成する。
5. If 主催者以外が進行画面のURLへアクセスした, then the Host Console shall 進行操作を拒否する。
6. The Quiz Management Service shall アップロードされた画像を、当該イベントの関係者のみが参照できるように保護する。
7. The Quiz Management Service shall 結果の共有を既定で無効とし、主催者の明示的な操作によってのみ有効化する。
8. While 結果の共有が有効である, the Quiz Management Service shall 共有ページにニックネーム以外の参加者情報を表示しない。

### Requirement 11: 非機能要件

**Objective:** As a 全ての利用者, I want 当日の環境で確実かつ快適に動作すること, so that 限られた進行時間を機材や操作の問題で失わない

#### Acceptance Criteria

1. The Answer Screen shall 主要なモバイルブラウザ（iOS Safari、Android Chrome）の最新版および1つ前のメジャーバージョンで動作する。
2. The Presentation Screen shall デスクトップブラウザで16:9の全画面表示に対応する。
3. When 参加者が参加用URLへアクセスした, the Answer Screen shall 一般的なモバイル回線において3秒以内に操作可能な状態になる。
4. The Answer Screen shall 全ての操作要素を日本語で表示する。
5. If 想定外のエラーが発生した, then the システム shall 利用者に復旧手段を示すメッセージを表示し、進行状態を失わせない。
6. The Host Console shall 主催者が操作を誤りやすい破壊的操作（結果確定、データ削除）に対して確認を求める。

### Requirement 12: 運用コスト制約

**Objective:** As a サービス提供者, I want イベントが開催されていない期間の運用コストを限りなくゼロに保ちたい, so that 年に数回しか使われない用途でもサービスを継続して提供できる

#### Acceptance Criteria

1. While イベントが開催されていない, the システム shall 稼働時間に対する固定課金が発生しない構成で待機する。
2. The システム shall 1イベントあたり100人規模の同時利用を、採用するプラットフォームの無償枠または低額の従量課金の範囲で処理する。
3. If 長期間アクセスがないことでプラットフォームが待機状態へ移行する, then the システム shall イベント開始前に稼働状態を確認し復帰させる手段を主催者へ提供する。
4. When 主催者がイベント開始前の動作確認を行った, the Host Console shall 各画面の疎通とリアルタイム配信の可否を確認できるようにする。
