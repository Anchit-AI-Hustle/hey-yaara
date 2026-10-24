import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Silence known browser extension noise
window.addEventListener("unhandledrejection", (event) => {
  const msg = String(event.reason || "")
  if (msg.includes("message channel closed")) {
    event.preventDefault()
    return
  }
})
window.addEventListener("error", (event) => {
  if (event.message?.includes("message channel closed")) {
    event.preventDefault()
  }
})

const isNativeApp = (() => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
})();

if ("serviceWorker" in navigator && isNativeApp) {
  // The apps carry their pages inside; a worker's cache would serve the old
  // version after an update. Remove one an earlier build registered.
  void navigator.serviceWorker.getRegistrations().then((all) => all.forEach((r) => void r.unregister())).catch(() => {});
} else if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[PWA] Service worker registration failed:", error);
    });
  });
}
