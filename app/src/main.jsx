import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const fallback = document.getElementById("vite-fallback");
if (fallback) fallback.remove();

const lockPortrait = () => {
  if (screen.orientation?.lock) {
    screen.orientation.lock("portrait").catch(() => {});
  }
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

window.addEventListener("load", () => {
  lockPortrait();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
});
