import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HostApp } from "./host/host-app";
import { StageApp } from "./stage/stage-app";

function App() {
  const pathname = window.location.pathname;

  if (pathname === "/" || pathname.startsWith("/host")) {
    return <HostApp />;
  }
  if (pathname.startsWith("/stage")) {
    return <StageApp />;
  }

  // /join, /share は後続タスク(13-14)で実装する
  return <div>準備中です。</div>;
}

const container = document.getElementById("root");
if (!container) throw new Error("root element not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
