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
