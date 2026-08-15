import type { ConnectionStatus } from "./use-live-channel";

/**
 * 通信不良・想定外エラー時に復旧手段を提示するバナー。進行状態は LiveChannel の再接続と
 * stateSnapshot による再構築で保持されるため、ここでは再読み込みの導線のみを提供する（要件9.5, 11.5）。
 */
export function RecoveryBanner({ status }: { readonly status: ConnectionStatus }) {
  if (status === "open") return null;

  return (
    <div
      role="alert"
      className="recovery-banner flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <p>通信状態が不安定です。進行状態は保持されており、自動的に再接続を試みています。</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700"
      >
        再読み込みする
      </button>
    </div>
  );
}
