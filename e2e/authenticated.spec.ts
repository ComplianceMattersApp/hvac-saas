import { expect, test } from "@playwright/test";

/**
 * Phase 2 E2E: pages behind login. These require a REAL test Supabase project
 * and a seeded test account — they cannot run against the placeholder backend.
 * They skip themselves until the credentials are provided, so this file is safe
 * to keep in CI (it reports as skipped, never failed).
 *
 * To run:
 *   E2E_BASE_URL=<url to an app pointed at a real test Supabase project> \
 *   E2E_TEST_EMAIL=<seeded test user> \
 *   E2E_TEST_PASSWORD=<password> \
 *   npm run test:e2e
 */

const AUTH_READY = Boolean(
  process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD && process.env.E2E_BASE_URL,
);

test.describe("Authenticated app (Phase 2 — gated on test credentials)", () => {
  test.skip(
    !AUTH_READY,
    "Set E2E_BASE_URL + E2E_TEST_EMAIL + E2E_TEST_PASSWORD (real test Supabase project) to run.",
  );

  test("signs in and reaches an authenticated workspace", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').first().fill(process.env.E2E_TEST_EMAIL!);
    await page.locator('input[name="password"]').first().fill(process.env.E2E_TEST_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).first().click();

    // Landing on any authenticated surface (and no longer on /login) proves the
    // full round-trip: form -> Supabase auth -> session cookie -> gated page.
    await page.waitForURL(/\/(ops|today|jobs|calendar)/, { timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });
});
