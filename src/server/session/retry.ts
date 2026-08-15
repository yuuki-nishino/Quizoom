/**
 * D1 への書き戻し等、DO 側の状態が既に確定した後段の副作用を、失敗しても進行を止めずに
 * 再試行するための汎用ヘルパー。最終試行まで失敗しても例外を投げず、呼び出し元は
 * 自らの状態を正として動作を継続できる（design.md「D1 への書き戻し失敗時も DO 側の
 * フェーズ遷移は成立させたうえでリトライする」を担保する）。
 */
export async function retryAsync(attempt: () => Promise<void>, attempts = 3): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await attempt();
      return;
    } catch {
      // 次の試行へ。最終試行の失敗も握りつぶし、呼び出し元の進行を止めない
    }
  }
}
