import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HostApp } from "./host/host-app";

function App() {
  const pathname = window.location.pathname;

  // /join, /stage, /share は後続タスク(12-14)で実装する。それまでは主催者コンソールのみを提供する
  if (pathname === "/" || pathname.startsWith("/host")) {
    return <HostApp />;
  }

  return <div>準備中です。</div>;
}

const container = document.getElementById("root");
if (!container) throw new Error("root element not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
