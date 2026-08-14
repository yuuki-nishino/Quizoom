import { useEffect, useState } from "react";
import { createApiClient } from "./api-client";
import { useHostRoute } from "./use-host-route";
import { EventList } from "./event-list";
import { EventEditor } from "./event-editor";
import { PreflightPanel } from "./preflight-panel";
import { LiveConsole } from "./live-console";

/** ホストコンソールのルート。主催者認証の確認と `/host` 以下の画面分岐を担う */
export function HostApp() {
  const apiClient = useState(() => createApiClient())[0];
  const { route, navigate } = useHostRoute();
  const [authState, setAuthState] = useState<"checking" | "signedOut" | "signedIn">("checking");

  useEffect(() => {
    let cancelled = false;
    apiClient.me().then((result) => {
      if (!cancelled) setAuthState(result.ok ? "signedIn" : "signedOut");
    });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  async function handleSignIn() {
    const result = await apiClient.requestGoogleSignInUrl(window.location.pathname);
    if (result.ok) window.location.href = result.value.url;
  }

  if (authState === "checking") return <p>読み込み中…</p>;

  if (authState === "signedOut") {
    return (
      <section aria-label="ログイン">
        <h1>Quizoom 主催者コンソール</h1>
        <button type="button" onClick={handleSignIn}>
          Googleでログイン
        </button>
      </section>
    );
  }

  if (route.view === "list") return <EventList apiClient={apiClient} onOpenEvent={(eventId) => navigate({ view: "editor", eventId, tab: "questions" })} />;
  if (route.view === "editor") return <EventEditor apiClient={apiClient} eventId={route.eventId} tab={route.tab} onNavigate={navigate} />;
  if (route.view === "preflight") return <PreflightPanel apiClient={apiClient} eventId={route.eventId} />;
  return <LiveConsole apiClient={apiClient} eventId={route.eventId} />;
}
