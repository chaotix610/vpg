import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import { assetManifest } from "./tools/asset-manifest.ts";

export default defineConfig({
  // Content modules read the public asset index through a virtual module.
  plugins: [assetManifest()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "#data": fileURLToPath(new URL("./data", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Browser and GPU resources belong to e2e tests; future sim tests run here headless.
  },
});
