import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return <div>Quizoom</div>;
}

const container = document.getElementById("root");
if (!container) throw new Error("root element not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
