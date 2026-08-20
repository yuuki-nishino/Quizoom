import { useEffect, useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { ArchivedResult, EventRole, HostApiClient } from "./api-client";
import { formatElapsedMs } from "../shared/format";
import { ConfirmDialog } from "./confirm-dialog";

export interface ResultsPanelProps {
  readonly apiClient: HostApiClient;
  readonly eventId: EventId;
  readonly role: EventRole;
}

/** 結果閲覧・共有設定・参加者データ削除画面(要件8.11-8.13, 10.2, 10.3)。共有設定変更・参加者データ削除は所有者専用(要件4.2, 4.3) */
export function ResultsPanel({ apiClient, eventId, role }: ResultsPanelProps) {
  const [result, setResult] = useState<ArchivedResult | null | "not-finalized">(null);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function refresh() {
    const res = await apiClient.getResults(eventId);
    if (res.ok) {
      setResult(res.value);
      setError(null);
    } else if (res.status === 404) {
      setResult("not-finalized");
    } else {
      setError(res.code);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function handleEnableSharing() {
    const res = await apiClient.enableSharing(eventId);
    if (res.ok) setShareUrl(res.value.shareUrl);
    else setError(res.code);
  }

  async function handleDisableSharing() {
    const res = await apiClient.disableSharing(eventId);
    if (res.ok) setShareUrl(null);
    else setError(res.code);
  }

  async function handleConfirmDelete() {
    setConfirmingDelete(false);
    const res = await apiClient.deleteParticipantData(eventId);
    if (res.ok) {
      setDeleted(true);
      setResult("not-finalized");
      setShareUrl(null);
    } else {
      setError(res.code);
    }
  }

  if (error)
    return (
      <p role="alert" className="m-8 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
        エラーが発生しました（{error}）。
      </p>
    );
  if (result === null) return <p className="m-8 text-slate-500">読み込み中…</p>;

  return (
    <section aria-label="結果と共有設定" className="max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-900">結果</h2>
      {deleted && (
        <p role="status" className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          参加者データを削除しました。
        </p>
      )}

      {result === "not-finalized" ? (
        <p className="mt-3 text-slate-600">まだ結果が確定していません。進行画面で結果発表を行うと、ここに最終ランキングが表示されます。</p>
      ) : (
        <>
          <ol className="mt-4 space-y-2">
            {[...result.entries]
              .sort((a, b) => a.rank - b.rank)
              .map((entry) => (
                <li key={entry.rank} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="font-medium text-slate-900">
                    {entry.rank}位 {entry.nickname} — 正解数 {entry.correctCount} / 合計 {formatElapsedMs(entry.totalElapsedMs)}
                  </p>
                  <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
                    {entry.answers.map((answer) => (
                      <li key={answer.questionId}>
                        設問{answer.questionId}: {answer.isCorrect ? "正解" : "不正解"}（{formatElapsedMs(answer.elapsedMs)}）
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
          </ol>

          <div aria-label="共有設定" className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            {result.shareCode || shareUrl ? (
              <>
                <p className="break-all text-sm text-slate-700">
                  共有は有効です{shareUrl && (
                    <>
                      :{" "}
                      <a href={shareUrl} className="text-indigo-700 hover:underline">
                        {shareUrl}
                      </a>
                    </>
                  )}
                </p>
                {role === "owner" && (
                  <button
                    type="button"
                    onClick={handleDisableSharing}
                    className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    共有を無効にする
                  </button>
                )}
              </>
            ) : (
              role === "owner" && (
                <button
                  type="button"
                  onClick={handleEnableSharing}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  共有を有効にする
                </button>
              )
            )}
          </div>

          {role === "owner" && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="mt-4 rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              参加者データを削除する
            </button>
          )}
        </>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="参加者データを削除しますか？"
          message="参加者の情報と回答履歴を削除します。この操作は復元できません。共有も同時に無効になります。"
          confirmLabel="削除する"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </section>
  );
}
