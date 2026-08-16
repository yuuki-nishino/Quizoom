# CI/CD パイプライン

`.github/workflows/ci-cd.yml` で完結する。

## 全体の流れ

```
featureブランチで作業
  → PR作成 (base: main)
    → CI: 型チェック(tsc) + テスト(vitest) が自動実行
    → レビュー・マージ
      → main への push をトリガーに、CIが通った上で自動デプロイ
```

| イベント | ジョブ | 内容 |
|---|---|---|
| `main` へのPR作成・更新 | `test` | `npm run typecheck` → `npm test` |
| `main` への push（= PRマージ） | `test` → `deploy` | テスト成功後、D1マイグレーション適用 → `wrangler deploy` |

`deploy` ジョブは `test` ジョブの成功を条件（`needs: test`）にしているため、テストが落ちていれば本番へは反映されない。

## 必要な準備（初回のみ・人間の作業）

デプロイには Cloudflare の API トークンが要る。GitHub Actions からは対話ログインできないため、`wrangler login` とは別に、CI専用のスコープ限定トークンを発行して GitHub Secrets に登録する。

### 1. Cloudflare API トークンを発行する

1. https://dash.cloudflare.com/profile/api-tokens を開く
2. 「トークンを作成する」→ テンプレート「Edit Cloudflare Workers」を選ぶ
3. 権限に以下を追加する（テンプレートのままだとD1マイグレーション適用に必要な権限が不足する）
   - **アカウント > D1 > 編集**
4. 対象アカウントをこのプロジェクトのアカウントに絞る
5. 発行されたトークンをコピーする（この画面を閉じると二度と表示されない）

### 2. GitHub Secrets に登録する

リポジトリのルートで、ターミナルから対話的に登録する（値をチャットやコマンド引数に直接書かない）。

```
gh secret set CLOUDFLARE_API_TOKEN
```

貼り付けを求められるので、1で発行したトークンを貼り付ける。

登録できているかは以下で確認できる。

```
gh secret list
```

## アプリ自体のシークレット（CI/CDとは別物・登録済み）

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `BETTER_AUTH_SECRET` / `PARTICIPANT_TOKEN_SECRET` は
`wrangler secret put` で Cloudflare Worker 自体に直接登録済み（`npx wrangler secret list` で確認できる）。
これらは CI/CD が触るものではなく、値が変わったときだけ手動で `wrangler secret put <NAME>` を再実行すればよい。

## ブランチ運用

- `main` への直接pushはしない
- 作業は `feature/xxx` や `chore/xxx` のようなブランチを切って行い、PRを作成してマージする
- マージ後、自動的に本番（`https://quizoom.24no-yuuki.workers.dev`）へデプロイされる

## D1マイグレーションについて

`deploy` ジョブは毎回 `wrangler d1 migrations apply quizoom-db --remote` を実行する。未適用のマイグレーションがなければ何もしない（冪等）。`migrations/` 配下に新しいSQLファイルを追加してPRをマージすれば、次のデプロイで自動的に本番へ適用される。

破壊的なマイグレーション（列削除・型変更など）は自動適用のリスクが高いため、事前に人間がレビューし、必要なら手動で `--remote` 適用してからマージする運用にすること。
