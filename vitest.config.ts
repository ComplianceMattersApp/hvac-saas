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
    // Glob-based discovery so new tests run automatically. Previously this was a
    // hand-maintained allowlist, which silently orphaned any test not listed.
    include: [
      "lib/**/*.test.{ts,tsx}",
      "scripts/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
    ],
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      // Measure coverage of the code we actually ship, not the tests/config.
      include: ["lib/**", "app/**", "components/**"],
      exclude: [
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "lib/types/**",
      ],
    },
  },
});
