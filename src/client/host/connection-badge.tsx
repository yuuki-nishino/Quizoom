import type { ConnectionStatus } from "../shared/use-live-channel";

const LABELS: Record<ConnectionStatus, string> = {
  connecting: "接続中…",
  open: "接続済み",
  reconnecting: "接続不良: 再接続中…",
  closed: "切断されました",
};

/** LiveChannel の接続状態を進行画面全体で共通表示するインジケーター（要件9.5, 11.5） */
export function ConnectionBadge({ status }: { readonly status: ConnectionStatus }) {
  const tone = status === "open" ? "ok" : status === "closed" ? "danger" : "warn";
  return (
    <span role="status" className={`connection-badge connection-badge--${tone}`}>
      {LABELS[status]}
    </span>
  );
}
