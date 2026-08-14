import { useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { HostApiClient, PreflightCheck, PreflightReport } from "./api-client";

export interface PreflightPanelProps {
  readonly apiClient: HostApiClient;
  readonly eventId: EventId;
}

const CHECK_LABELS: Record<PreflightCheck["id"], string> = {
  authValid: "主催者の認証",
  sessionReachable: "ライブセッションへの疎通",
  roundTripMs: "往復遅延",
  stageUrlReachable: "投影URLの利用可否",
  questionsReady: "設問の準備状況",
};

function checkDetail(check: PreflightCheck): string {
  switch (check.id) {
    case "roundTripMs":
      return `${check.measuredMs}ms`;
    case "questionsReady":
      return `${check.questionCount}件`;
    default:
      return check.detail;
  }
}

/** 開催前の事前確認画面（要件12.3, 12.4）。休眠中のDOを起動させる導線も兼ねる */
export function PreflightPanel({ apiClient, eventId }: PreflightPanelProps) {
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPreflight() {
    setRunning(true);
    const result = await apiClient.preflight(eventId);
    setRunning(false);
    if (result.ok) {
      setReport(result.value);
      setError(null);
    } else {
      setError(result.code);
    }
  }

  return (
    <section aria-label="事前確認">
      <h2>事前確認</h2>
      <button type="button" disabled={running} onClick={runPreflight}>
        {running ? "確認中…" : "事前確認を実行する"}
      </button>

      {error && <p role="alert">確認に失敗しました（{error}）。</p>}

      {report && (
        <div>
          <p>
            総合結果: <strong>{report.overall}</strong>
          </p>
          <ul>
            {report.checks.map((check) => (
              <li key={check.id} data-status={check.status}>
                {CHECK_LABELS[check.id]}: {check.status} ({checkDetail(check)})
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
