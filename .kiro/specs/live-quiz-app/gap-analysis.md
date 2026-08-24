# ギャップ分析: Issue #7(外観プレビュー・ロゴ/背景画像の未反映)

> このspec(`live-quiz-app`)は既にtask 1〜17まで実装済み(tasksは98%完了)。本分析はIssue #7で報告された、Requirement 3.4・3.5に対する実装ギャップに限定してスコープする。spec全体の再分析ではない。

## 対象要件

- **Requirement 3.4**: 主催者がロゴまたは背景画像をアップロードした際、問題投影画面および回答画面の指定位置に表示する
- **Requirement 3.5**: 外観設定を変更した際、投影用・回答用それぞれのプレビューに変更内容を反映する

## Requirement-to-Asset Map

| 要件 | 既存アセット | ギャップ |
|---|---|---|
| 3.4(画像表示) | `ThemeSettings.logoAssetId`/`backgroundAssetId`(保存済み・アップロードUIは動作)、`buildStageMediaUrl`/`buildPlayerMediaUrl`(既存の設問添付画像で使用中の認可URL生成パターン) | **Missing**: `logoAssetId`/`backgroundAssetId`を`<img>`やCSS背景として描画する箇所がクライアントのどこにも存在しない(投影画面・回答画面とも) |
| 3.5(プレビュー) | `ThemeEditor`のプレビュー領域(`ThemeProvider`でラップ済み、背景色・文字色は反映される) | **Missing**: プレビュー内の要素が`text-brand-primary`/`bg-brand-primary`/`text-brand-accent`を一切使っておらず、基調色・アクセント色の変更が見た目に反映されない。ロゴ・背景画像もプレビューに描画されない(3.4と同根) |
| 共通基盤 | `ThemeProvider`(`src/client/shared/theme.tsx`)が`stage-app`/`player-app`/`share-app`/`theme-editor`preview全ての単一の見た目適用ポイントになっている | **Constraint**: `share-app`は要件10.6(匿名閲覧者への非公開)によりロゴ・背景画像を意図的に使わない設計(design.md記載済み)。`ThemeProvider`自体を拡張する場合、この除外を壊さないこと |

## 実装アプローチ選択肢

### Option A: `ThemeProvider`を拡張し、画像URLを呼び出し側が解決して渡す
- `ThemeProvider`に`logoImageUrl`/`backgroundImageUrl`(任意, 解決済みURL文字列)を追加。背景は`style`でcover表示、ロゴは固定位置バッジとして`children`の外側に描画
- `stage-app.tsx`/`player-app.tsx`は既存の`buildStageMediaUrl`/`buildPlayerMediaUrl`(設問添付画像で既に使用中)を流用してURLを解決
- `theme-editor.tsx`のプレビューはCookie認証で完結する`/api/events/:id/media/:assetId`を直接組み立てる(ホスト自身のリクエストなのでトークン不要)
- `share-app.tsx`は変更なし(該当propsを渡さないだけで既存の除外を維持)

**トレードオフ**:
- ✅ 見た目適用の一元化ポイントを維持でき、4箇所すべてに同じ見え方を保証できる
- ✅ 既存の設問添付画像と同じ認可URLパターンを流用でき、新規の認可ロジックが不要
- ❌ `ThemeProvider`のprops数が増える(現状は`theme`のみ)

### Option B: 各アプリ(stage/player)が個別に`<img>`を配置する
- `ThemeProvider`は変更せず、`stage-app.tsx`/`player-app.tsx`それぞれが独自にロゴ・背景の描画箇所を実装する

**トレードオフ**:
- ✅ `ThemeProvider`のインターフェースを変えずに済む
- ❌ 4箇所(stage/player/theme-editorプレビュー×2)で表示位置・スタイルがバラバラになりやすい
- ❌ 「投影画面と回答画面で一貫した見た目」という要件の趣旨に反しやすい

### Option C: Hybrid(段階導入)
- まずプレビューの色反映バグ(3.5の一部)のみ`theme-editor.tsx`内で修正し、画像描画(3.4)は別タスクとして後日
- **不採用の理由**: Issue #7は両方を一体の不具合として報告しており、プレビューの正確性は実画面での画像描画と表裏一体(画像が実画面に出ない限り、プレビューで画像を見せても無意味)。分割する実益が薄い

## 推奨

**Option A**を推奨。既存の`ThemeProvider`一元化パターンおよび設問添付画像の認可URL解決パターンに最も自然に乗る。

## Effort / Risk

- **Effort**: S(1〜3日相当) — 既存パターンの流用のみで新規の認可・データモデルは不要
- **Risk**: Low — 新しい技術要素はなく、影響範囲も`ThemeProvider`・`stage-app`・`player-app`・`theme-editor`の4ファイルに限定される

## Research Needed

- なし(全て既存パターンの流用で完結する)

---

# ギャップ分析: Issue #12(ロゴ・背景画像の削除機能)

> 本分析はIssue #12で要望された、Requirement 3.10(新設)に対する実装ギャップに限定してスコープする。spec全体の再分析ではない。

## 対象要件

- **Requirement 3.10(新設)**: 主催者がアップロード済みのロゴまたは背景画像の削除を指示した際、参照を解除し、投影画面・回答画面・プレビューのいずれにも表示しない状態で保存できるようにする

## Requirement-to-Asset Map

| 要件 | 既存アセット | ギャップ |
|---|---|---|
| 3.10(削除) | `ThemeSettings.logoAssetId`/`backgroundAssetId`は元々`null`を許容する型・DBスキーマになっており、`PUT /api/events/:id/theme`(`themeSettingsRequestSchema`)も`nullable()`で受け付ける。`ThemeProvider`も`logoImageUrl`/`backgroundImageUrl`が`null`/未指定の場合は何も描画しない(既存動作) | **Missing**: `ThemeEditor`のUIに、アップロード済み画像を`null`へ戻す操作(削除ボタン等)が一切存在しない。アップロードによる上書きしかできず、一度設定すると別画像へ差し替えることはできてもゼロに戻せない |

## 実装アプローチ選択肢

### Option A: `ThemeEditor`にローカルstateのクリア操作を追加(推奨)
- 各画像(ロゴ/背景)のアップロード欄に、現在設定されている場合のみ「削除」ボタンを表示する
- クリックすると`theme`のローカルstateで該当`AssetId`を`null`に戻す(サーバーへの即時反映はしない、色変更と同じく「保存する」で確定する既存の一貫した操作感を踏襲)
- R2上のオブジェクト自体の物理削除は行わない(現状、画像を差し替えた場合も旧オブジェクトは残ったままであり、既存の挙動と一貫させる。オーファンオブジェクトの削除は本Issueのスコープ外)

**トレードオフ**:
- ✅ 新規のAPIエンドポイント・DBスキーマ変更が一切不要(既存の`PUT theme`が`null`を受理できることは確認済み)
- ✅ 既存の「編集→保存する」という操作フローと完全に一貫する
- ❌ R2オブジェクトはオーファン化する(既存の差し替え時と同じ制約であり、新たに悪化するものではない)

### Option B: 削除操作をサーバーサイドの専用エンドポイントにする(例: `DELETE /api/events/:id/theme/logo`)
- **不採用の理由**: `null`を保存するだけの操作に対して新規エンドポイントを設けるのは過剰。既存の`PUT theme`で表現可能な変更をわざわざ専用APIに分離する理由がない

## 推奨

**Option A**を推奨。クライアント側(`theme-editor.tsx`および状態管理を担う`theme-editor-state.ts`)の変更のみで完結する。

## Effort / Risk

- **Effort**: XS(数時間相当) — 既存の`PUT theme`が`null`を受理する以上、UIに削除ボタンを追加するだけで完結する
- **Risk**: Low — 新しい技術要素・データモデル変更はなく、影響範囲は`theme-editor.tsx`/`theme-editor-state.ts`に限定される

## Research Needed

- なし

---

# ギャップ分析: Issue #13(プレビュー機能のアスペクト比微調整)

> 本分析はIssue #13で要望された、Requirement 3.11〜3.14(新設)に対する実装ギャップに限定してスコープする。spec全体の再分析ではない。

## 対象要件

- **Requirement 3.11(新設)**: 投影画面プレビューを16:9のアスペクト比の枠内に表示する
- **Requirement 3.12(新設)**: 回答画面プレビューをスマートフォンを模した縦長の枠内に、スクロールなしで表示する
- **Requirement 3.13(新設)**: 投影画面(実画面)がプロジェクターのセーフティゾーンを考慮した既定の余白を持つ
- **Requirement 3.14(新設)**: プレビューで主催者が任意の設問を選んで表示を切り替えられる

## Requirement-to-Asset Map

| 要件 | 既存アセット | ギャップ |
|---|---|---|
| 3.11/3.12(アスペクト比) | `ThemePreviewWalkthrough`の表示枠(`<div className="mt-3 h-[30rem] overflow-auto ...">`)。投影画面・回答画面いずれのステップでも同一の固定高さボックスを使い回している | **Missing**: 投影画面ステップと回答画面ステップを区別し、それぞれ16:9/縦長スマホ比の枠として描画する仕組みがない。`ThemeProvider`自体は`min-h-full`で親要素いっぱいに広がる設計のため、親側のアスペクト比を変えるだけで両画面とも追従できる見込み |
| 3.13(セーフティゾーン余白) | 各投影画面フェーズコンポーネント(`WaitingRoom`/`QuestionView`/`RevealView`/`RankingView`)は`px-12 py-10`等の内側余白を個別に持つのみ | **Missing**: プロジェクターのセーフティゾーン(例: 80%)を意図した、画面端からの一律の外側余白を与える共通の仕組みがない。実画面(`stage-app.tsx`)とプレビュー(`theme-preview-walkthrough.tsx`)の両方に同じ余白を適用する必要があり、片方だけに実装すると見た目が乖離する(既存の設計原則「実画面との見た目の乖離が構造的に発生しない」に反する) |
| 3.14(全設問プレビュー) | `theme-preview-page.tsx`の`toPreviewQuestion`は`event.questions[0]`のみをマッピングし、`ThemePreviewWalkthrough`は単一の`question`propしか受け取らない | **Missing**: 複数設問をマッピングして渡す経路、および主催者が選択中の設問を切り替えるUI(セレクタ等)が存在しない |

## 実装アプローチ選択肢

### Option A: `ThemePreviewWalkthrough`をステップ種別で分岐させ、共有の`StageSafeArea`コンポーネントを新設(推奨)
- 表示枠を`step.group`(投影画面/回答画面)で分岐し、投影画面は`aspect-video`(16:9)、回答画面はスマートフォンを模した縦長比(例: `aspect-[9/19.5]`)+ 端末風の丸角・ボーダーで描画する。両者とも`overflow-hidden`とし、内部のフェーズ画面コンポーネント自身が持つ`overflow-y-auto`(直近のvisual refresh作業で実装済み)に処理を委ねることでスクロールなしの全体表示を実現する
- セーフティゾーン余白は`src/client/stage/`配下に`StageSafeArea`という薄いラッパーコンポーネント(`flex min-h-0 flex-1 flex-col p-[8%]`程度)として新設し、実画面の`stage-app.tsx`とプレビューの`theme-preview-walkthrough.tsx`の投影画面ステップの双方から共有して使う。1箇所に定義することで見た目の乖離を構造的に防ぐ
- 全設問プレビューは、`theme-preview-page.tsx`に`toPreviewQuestions`(複数形、全設問をマッピング)を追加し、`ThemePreviewWalkthrough`のprops`question`を`questions`(配列)へ拡張。コンポーネント内部で選択中の設問インデックスをstateとして持ち、設問選択用のセレクタUIを追加する。既存の`toPreviewQuestion`(単数形)は後方互換のため残し、内部の設問→PreviewQuestion変換ロジックのみ共通化する

**トレードオフ**:
- ✅ 実画面とプレビューが同じ`StageSafeArea`コンポーネントを共有するため、見た目の乖離が構造的に発生しない(既存設計原則を維持)
- ✅ 新規ライブラリ・APIエンドポイントは不要。CSSのアスペクト比ユーティリティと既存コンポーネントの組み合わせで完結する
- ❌ `ThemePreviewWalkthrough`のprops変更(`question`→`questions`)により、呼び出し元(`theme-preview-page.tsx`)とテストの更新が必要

### Option B: プレビューのみ調整し、実画面(セーフティゾーン)には手を入れない
- Requirement 3.13(実画面の余白)を見送り、プレビューのアスペクト比調整(3.11, 3.12)と全設問プレビュー(3.14)のみ対応する
- **不採用の理由**: Issue #13の主目的は「事前確認したものが実際の投影と一致すること」であり、プレビューだけ余白があっても実画面に反映されなければ「セーフティゾーンで見切れる」という当初の課題が解決しない。プレビューと実画面の一致を保つ既存の設計原則にも反する

## 推奨

**Option A**を推奨。

## Effort / Risk

- **Effort**: M(2〜4日相当) — アスペクト比調整自体は小さいが、`StageSafeArea`の新設と実画面・プレビュー双方への適用、`questions`複数化によるprops変更とテスト更新を含む
- **Risk**: Low〜Medium — `stage-app.tsx`(実際に開催中のイベントで使われる投影画面)への変更を伴うため、既存の投影画面レイアウト・統合テストへの影響確認が必要

## Research Needed

- なし(Tailwindの`aspect-*`ユーティリティ・`overflow-hidden`など既存技術のみで完結する)
