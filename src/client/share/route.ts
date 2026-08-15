export interface ShareRoute {
  readonly shareCode: string;
}

/** `/share/:shareCode` を解析する純粋関数 */
export function parseShareRoute(pathname: string): ShareRoute | null {
  const segments = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (segments.length < 2 || segments[0] !== "share") return null;

  const shareCode = segments[1];
  if (!shareCode) return null;
  return { shareCode };
}
