import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
  // Spaced learning is switched off on the site (lib/features) but stays covered by the tests.
  test: { environment: "node", include: ["src/**/*.test.ts"], env: { NEXT_PUBLIC_SPACED_LEARNING: "on" } },
});
