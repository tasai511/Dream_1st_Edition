import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const fallback = document.getElementById("vite-fallback");
if (fallback) fallback.remove();

const BASE_APP_WIDTH = 480;
const MAX_APP_WIDTH = 720;

const updateAppScale = () => {
  const viewportWidth = window.visualViewport?.width || window.innerWidth || BASE_APP_WIDTH;
  const visualWidth = viewportWidth > BASE_APP_WIDTH ? Math.min(MAX_APP_WIDTH, viewportWidth) : viewportWidth;
  const scale = viewportWidth > BASE_APP_WIDTH ? visualWidth / BASE_APP_WIDTH : 1;
  const fontScale = 1 + ((scale - 1) * 0.8);
  document.documentElement.style.setProperty("--app-scale", scale.toFixed(4));
  document.documentElement.style.setProperty("--app-font-scale", fontScale.toFixed(4));
  document.documentElement.style.setProperty("--app-visual-width", `${visualWidth}px`);
};

updateAppScale();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

window.addEventListener("load", () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`).catch(() => {});
  }
});

window.visualViewport?.addEventListener("resize", updateAppScale);
window.addEventListener("resize", updateAppScale);
window.addEventListener("orientationchange", updateAppScale);
