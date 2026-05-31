import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const fallback = document.getElementById("vite-fallback");
if (fallback) fallback.remove();

const BASE_APP_WIDTH = 480;

const updateAppScale = () => {
  const viewportWidth = window.innerWidth || BASE_APP_WIDTH;
  const visualWidth = Math.min(BASE_APP_WIDTH, viewportWidth);
  const scale = 1;
  const fontScale = 1;
  document.documentElement.style.setProperty("--app-scale", scale.toFixed(4));
  document.documentElement.style.setProperty("--app-font-scale", fontScale.toFixed(4));
  document.documentElement.style.setProperty("--app-visual-width", `${visualWidth}px`);
  document.documentElement.style.fontSize = "";
};

const lockPortraitOrientation = () => {
  const orientation = window.screen?.orientation;
  if (!orientation?.lock) return;
  orientation.lock("portrait-primary").catch(() => {
    orientation.lock("portrait").catch(() => {});
  });
};

updateAppScale();
lockPortraitOrientation();

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

window.addEventListener("resize", updateAppScale);
window.addEventListener("orientationchange", () => {
  updateAppScale();
  lockPortraitOrientation();
});
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") lockPortraitOrientation();
});
window.addEventListener("pointerdown", lockPortraitOrientation, { once: true, passive: true });
