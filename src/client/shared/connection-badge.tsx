import type { ConnectionStatus } from "./use-live-channel";

const LABELS: Record<ConnectionStatus, string> = {
  connecting: "接続中…",
  open: "接続済み",
  reconnecting: "接続不良: 再接続中…",
  closed: "切断されました",
};

const TONE_CLASSES = {
  ok: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
} as const;

/** LiveChannel の接続状態を進行画面全体で共通表示するインジケーター（要件9.5, 11.5） */
export function ConnectionBadge({ status }: { readonly status: ConnectionStatus }) {
  const tone = status === "open" ? "ok" : status === "closed" ? "danger" : "warn";
  return (
    <span
      role="status"
      className={`connection-badge connection-badge--${tone} inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
