import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const gameRoot = path.resolve(import.meta.dirname, "../chrono-clash");

/**
 * Capacitor-only production build of the EXISTING Chrono Clash source.
 * Does not replace artifacts/chrono-clash/vite.config.ts (Replit/web preview).
 * Omits Replit-only plugins so the installed app has no Replit chrome.
 */
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(gameRoot, "src"),
      "@assets": path.resolve(gameRoot, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: gameRoot,
  build: {
    outDir: path.resolve(import.meta.dirname, "www"),
    emptyOutDir: true,
  },
});
