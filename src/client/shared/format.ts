export function formatElapsedMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}秒`;
}

export function formatRemainingSeconds(ms: number): number {
  return Math.ceil(Math.max(0, ms) / 1000);
}
