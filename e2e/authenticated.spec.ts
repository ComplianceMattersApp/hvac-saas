import { expect, test, type Page } from "@playwright/test";

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
 *
 * These specs are deliberately READ-ONLY: they prove each core surface renders
 * for a signed-in user without hitting the error boundary. Flows that mutate
 * data (creating customers/jobs, taking payments) belong in dedicated specs
 * with their own seeded fixtures and cleanup.
 */

const AUTH_READY = Boolean(
  process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD && process.env.E2E_BASE_URL,
);

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').first().fill(process.env.E2E_TEST_EMAIL!);
  await page.locator('input[name="password"]').first().fill(process.env.E2E_TEST_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForURL(/\/(ops|today|jobs|calendar)/, { timeout: 20_000 });
}

/** Assert the page rendered real content, not the error boundary or login. */
async function expectHealthySurface(page: Page) {
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText("Something went wrong.")).toHaveCount(0);
}

test.describe("Authenticated app (Phase 2 — gated on test credentials)", () => {
  test.skip(
    !AUTH_READY,
    "Set E2E_BASE_URL + E2E_TEST_EMAIL + E2E_TEST_PASSWORD (real test Supabase project) to run.",
  );

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("signs in and reaches an authenticated workspace", async ({ page }) => {
    // beforeEach already proved the full round-trip:
    // form -> Supabase auth -> session cookie -> gated page.
    await expectHealthySurface(page);
  });

  test("Today page renders the daily surface", async ({ page }) => {
    await page.goto("/today");
    await expectHealthySurface(page);
    // Either the mobile stream or the desktop main column must be present.
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("Jobs list renders", async ({ page }) => {
    await page.goto("/jobs");
    await expectHealthySurface(page);
    await expect(page.getByRole("heading", { name: "Jobs" }).first()).toBeVisible();
  });

  test("Calendar renders", async ({ page }) => {
    await page.goto("/calendar");
    await expectHealthySurface(page);
  });

  test("Customers list renders", async ({ page }) => {
    await page.goto("/customers");
    await expectHealthySurface(page);
  });

  test("Ops queues render", async ({ page }) => {
    await page.goto("/ops");
    await expectHealthySurface(page);
  });

  test("Reports surface renders", async ({ page }) => {
    await page.goto("/reports");
    await expectHealthySurface(page);
  });
});
