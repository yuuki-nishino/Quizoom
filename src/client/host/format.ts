import type { EventStatus } from "../../shared/domain-types";

const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "下書き",
  published: "公開中",
  live: "開催中",
  finished: "終了",
};

export function eventStatusLabel(status: EventStatus): string {
  return STATUS_LABELS[status];
}

export function formatElapsedMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}秒`;
}

export function formatRemainingSeconds(ms: number): number {
  return Math.ceil(Math.max(0, ms) / 1000);
}
