import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import { apiDev } from "./scripts/vite-api-dev";
import { NAVIGATE_FALLBACK_DENYLIST } from "./src/lib/sw-routes";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // Vite 7 builds for Safari 16 / Chrome 107 by default. Keep Vite 5's older
  // targets: /get promises iOS 15, and many family phones run old WebViews.
  build: {
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
  },
  plugins: [
    react(),
    apiDev(),
    VitePWA({
      registerType: "autoUpdate",
      // main.tsx registers the worker itself, on the web only (not in the apps).
      injectRegister: false,
      manifest: {
        name: "Hey Yaara",
        short_name: "Yaara",
        description: "A companion for elderly users.",
        theme_color: "#162038",
        background_color: "#0c1222",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        // The API, the app download links and the iPhone install profile must
        // always reach the server, never the cached index.html.
        navigateFallbackDenylist: NAVIGATE_FALLBACK_DENYLIST,
        // main.tsx registers /sw.js itself, so nothing ever sends the plugin's
        // SKIP_WAITING message: without these a new worker waits until every
        // tab of the site is closed, which on an iPhone can be never, and the
        // old worker keeps serving the old page (and its old bugs).
        skipWaiting: true,
        clientsClaim: true,
      },
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
