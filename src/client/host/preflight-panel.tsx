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

  const overallClass =
    report?.overall === "ok"
      ? "bg-emerald-100 text-emerald-800"
      : report?.overall === "warn"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";
  const statusClass: Record<string, string> = {
    ok: "bg-emerald-100 text-emerald-800",
    warn: "bg-amber-100 text-amber-800",
    fail: "bg-red-100 text-red-800",
  };

  return (
    <section aria-label="事前確認" className="max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-900">事前確認</h2>
      <button
        type="button"
        disabled={running}
        onClick={runPreflight}
        className="mt-3 rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {running ? "確認中…" : "事前確認を実行する"}
      </button>

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          確認に失敗しました（{error}）。
        </p>
      )}

      {report && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-700">
            総合結果:{" "}
            <strong className={`ml-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${overallClass}`}>{report.overall}</strong>
          </p>
          <ul className="mt-3 space-y-2">
            {report.checks.map((check) => (
              <li key={check.id} data-status={check.status} className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm first:border-t-0 first:pt-0">
                <span className="text-slate-700">{CHECK_LABELS[check.id]}</span>
                <span className="flex items-center gap-2">
                  <span className="text-slate-500">{checkDetail(check)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass[check.status] ?? ""}`}>{check.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
