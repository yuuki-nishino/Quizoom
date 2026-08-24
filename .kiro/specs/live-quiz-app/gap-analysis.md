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
