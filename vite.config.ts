import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { assetManifest } from "./tools/asset-manifest.ts";

export default defineConfig({
  // Relative base so the built viewer works from any sub-path (e.g. GitHub Pages).
  base: "./",
  publicDir: "public",
  plugins: [vue(), assetManifest()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "#data": fileURLToPath(new URL("./data", import.meta.url)),
    },
  },
  server: {
    watch: {
      // The repo holds gigabytes of art; only the .glb lists matter to the dev server.
      ignored: ["**/local/**", "**/*.blend", "**/*.blend1", "**/dist/**", "**/test-results/**", "**/playwright-report/**"],
    },
  },
  build: {
    // Keep compiled app chunks separate from the runtime assets copied from public/.
    assetsDir: "static",
    target: "es2022",
    // Babylon's engine + scene core is ~1 MB minified (~190 kB gzip) on its own.
    chunkSizeWarningLimit: 1100,
  },
});
