import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end (browser) tests. These boot the real Next.js app and drive it in a
 * real Chromium browser — complementary to the vitest unit/component tests.
 *
 * Phase 1 (this config): PUBLIC, no-auth pages (login, signup, legal). The app
 * boots against a placeholder Supabase backend — enough to server-render and
 * hydrate these pages without real credentials.
 *
 * Phase 2 (gated, see e2e/authenticated.spec.ts): pages behind login need a real
 * test Supabase project + a seeded test account. Those specs skip themselves
 * until E2E_BASE_URL / E2E_TEST_EMAIL / E2E_TEST_PASSWORD are provided.
 */

// `||` (not `??`): CI passes unset secrets through as empty strings, which must
// fall back to the local dev server exactly like a missing variable does.
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";

// In sandboxes/CI where a matched browser is pre-installed at a fixed path,
// point Playwright straight at it (set PLAYWRIGHT_CHROMIUM_PATH). When unset,
// Playwright uses the browser it downloaded via `playwright install`.
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

// Placeholder public env so the app can boot without real secrets. These are
// NOT credentials — they only let the client construct and pages render. Any
// real data fetch against them fails, which is why Phase 1 covers public pages.
const placeholderAppEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "placeholder-service-key",
  NEXT_PUBLIC_APP_URL: BASE_URL,
  APP_URL: BASE_URL,
  AUTH_SECRET: "placeholder-auth-secret-e2e-only",
  NEXTAUTH_SECRET: "placeholder-auth-secret-e2e-only",
};

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    ...(chromiumExecutablePath
      ? { launchOptions: { executablePath: chromiumExecutablePath } }
      : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Only manage a dev server when pointing at localhost. If E2E_BASE_URL points
  // at an already-running deployment, skip the webServer block.
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: placeholderAppEnv,
        },
      }),
});
