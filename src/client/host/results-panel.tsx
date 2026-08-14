import { useEffect, useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { ArchivedResult, HostApiClient } from "./api-client";
import { formatElapsedMs } from "./format";
import { ConfirmDialog } from "./confirm-dialog";

export interface ResultsPanelProps {
  readonly apiClient: HostApiClient;
  readonly eventId: EventId;
}

/** 結果閲覧・共有設定・参加者データ削除画面(要件8.11-8.13, 10.2, 10.3) */
export function ResultsPanel({ apiClient, eventId }: ResultsPanelProps) {
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

  if (error) return <p role="alert">エラーが発生しました（{error}）。</p>;
  if (result === null) return <p>読み込み中…</p>;

  return (
    <section aria-label="結果と共有設定">
      <h2>結果</h2>
      {deleted && <p role="status">参加者データを削除しました。</p>}

      {result === "not-finalized" ? (
        <p>まだ結果が確定していません。進行画面で結果発表を行うと、ここに最終ランキングが表示されます。</p>
      ) : (
        <>
          <ol>
            {[...result.entries]
              .sort((a, b) => a.rank - b.rank)
              .map((entry) => (
                <li key={entry.rank}>
                  {entry.rank}位 {entry.nickname} — 正解数 {entry.correctCount} / 合計 {formatElapsedMs(entry.totalElapsedMs)}
                  <ul>
                    {entry.answers.map((answer) => (
                      <li key={answer.questionId}>
                        設問{answer.questionId}: {answer.isCorrect ? "正解" : "不正解"}（{formatElapsedMs(answer.elapsedMs)}）
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
          </ol>

          <div aria-label="共有設定">
            {result.shareCode || shareUrl ? (
              <>
                <p>共有は有効です{shareUrl && <>: <a href={shareUrl}>{shareUrl}</a></>}</p>
                <button type="button" onClick={handleDisableSharing}>
                  共有を無効にする
                </button>
              </>
            ) : (
              <button type="button" onClick={handleEnableSharing}>
                共有を有効にする
              </button>
            )}
          </div>

          <button type="button" onClick={() => setConfirmingDelete(true)}>
            参加者データを削除する
          </button>
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
