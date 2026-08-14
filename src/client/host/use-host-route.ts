import { useCallback, useEffect, useState } from "react";
import { parseHostRoute, hostRoutePath } from "./route";
import type { HostRoute } from "./route";

/** `history.pushState` を用いた最小限のクライアントサイドルーティング */
export function useHostRoute(): { readonly route: HostRoute; navigate: (route: HostRoute) => void } {
  const [route, setRoute] = useState<HostRoute>(() => parseHostRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parseHostRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((next: HostRoute) => {
    const path = hostRoutePath(next);
    window.history.pushState(null, "", path);
    setRoute(next);
  }, []);

  return { route, navigate };
}
