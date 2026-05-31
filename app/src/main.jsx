import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const fallback = document.getElementById("vite-fallback");
if (fallback) fallback.remove();

const BASE_APP_WIDTH = 480;
let shellResizeObserver = null;

const readViewportWidth = () => (
  window.visualViewport?.width ||
  window.innerWidth ||
  BASE_APP_WIDTH
);

const updateAppShellMetrics = () => {
  const shell = document.querySelector(".phone-shell");
  if (!shell) return;
  const rect = shell.getBoundingClientRect();
  document.documentElement.style.setProperty("--app-shell-visual-height", `${Math.max(window.innerHeight || 0, rect.height)}px`);
};

const observeAppShell = () => {
  const shell = document.querySelector(".phone-shell");
  if (!shell || shellResizeObserver) {
    updateAppShellMetrics();
    return;
  }
  shellResizeObserver = new ResizeObserver(() => requestAnimationFrame(updateAppShellMetrics));
  shellResizeObserver.observe(shell);
  updateAppShellMetrics();
};

const updateAppScale = () => {
  const viewportWidth = readViewportWidth();
  const visualWidth = viewportWidth > BASE_APP_WIDTH ? viewportWidth : Math.min(BASE_APP_WIDTH, viewportWidth);
  const scale = viewportWidth > BASE_APP_WIDTH ? viewportWidth / BASE_APP_WIDTH : 1;
  const fontScale = 1;
  document.documentElement.style.setProperty("--app-scale", scale.toFixed(4));
  document.documentElement.style.setProperty("--app-font-scale", fontScale.toFixed(4));
  document.documentElement.style.setProperty("--app-visual-width", `${visualWidth}px`);
  document.documentElement.style.fontSize = "";
  requestAnimationFrame(updateAppShellMetrics);
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
  observeAppShell();
});

requestAnimationFrame(observeAppShell);

window.addEventListener("resize", () => {
  updateAppScale();
  observeAppShell();
});
window.visualViewport?.addEventListener("resize", () => {
  updateAppScale();
  observeAppShell();
});
window.addEventListener("orientationchange", () => {
  updateAppScale();
  observeAppShell();
  lockPortraitOrientation();
});
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") lockPortraitOrientation();
});
window.addEventListener("pointerdown", lockPortraitOrientation, { once: true, passive: true });
