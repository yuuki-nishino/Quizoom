import type { EventId } from "../../shared/domain-types";
import { hostRoutePath } from "./route";

/** 進行画面を新しいタブで開くリンク。準備画面(イベント編集)のタブを残すため、タブ内遷移にはしない(要件5.14) */
export function LiveConsoleLink({ eventId }: { readonly eventId: EventId }) {
  return (
    <a
      href={hostRoutePath({ view: "live", eventId })}
      target="_blank"
      rel="noopener"
      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
    >
      進行画面を開く
    </a>
  );
}
