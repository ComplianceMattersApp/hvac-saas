import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "scripts/**/*.test.ts",
      "app/api/stripe/webhook/__tests__/route.test.ts",
      "app/reports/invoices/export/__tests__/route.test.ts",
      "app/ops/export/__tests__/route.test.ts",
    ],
    clearMocks: true,
  },
});
