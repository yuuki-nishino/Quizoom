export interface PlayerRoute {
  readonly joinCode: string;
}

/** `/join/:joinCode` を解析する純粋関数 */
export function parsePlayerRoute(pathname: string): PlayerRoute | null {
  const segments = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (segments.length < 2 || segments[0] !== "join") return null;

  const joinCode = segments[1];
  if (!joinCode) return null;
  return { joinCode };
}
