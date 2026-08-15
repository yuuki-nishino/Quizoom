import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HostApp } from "./host/host-app";
import { StageApp } from "./stage/stage-app";
import { PlayerApp } from "./player/player-app";
import { ShareApp } from "./share/share-app";

function App() {
  const pathname = window.location.pathname;

  if (pathname === "/" || pathname.startsWith("/host")) {
    return <HostApp />;
  }
  if (pathname.startsWith("/stage")) {
    return <StageApp />;
  }
  if (pathname.startsWith("/join")) {
    return <PlayerApp />;
  }
  if (pathname.startsWith("/share")) {
    return <ShareApp />;
  }

  return <div>ページが見つかりません。</div>;
}

const container = document.getElementById("root");
if (!container) throw new Error("root element not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
