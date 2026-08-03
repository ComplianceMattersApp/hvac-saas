import { expect, test } from "@playwright/test";

/**
 * Phase 1 E2E: PUBLIC (no-auth) pages, driven in a real browser against the
 * booted app. These assert the pages actually render and their core wiring
 * works — the kind of "did we ship a broken public page / build?" regression a
 * unit test can't catch.
 */

test.describe("Login page", () => {
  test("renders the sign-in form with email + password and a submit control", async ({ page }) => {
    await page.goto("/login");

    // Credential inputs are present and typeable (selected by their form field
    // names, which are the stable contract the submit handler reads).
    const email = page.locator('input[name="email"]').first();
    const password = page.locator('input[name="password"]').first();
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(email).toHaveAttribute("type", "email");
    await expect(password).toHaveAttribute("type", "password");
    await email.fill("user@example.com");
    await password.fill("hunter2");
    await expect(email).toHaveValue("user@example.com");

    // A sign-in action exists.
    await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
  });

  test("offers the Service / ECC / Cleaning trial entry points", async ({ page }) => {
    await page.goto("/login?signup=1");

    await expect(page.locator('a[href="/signup/service"]').first()).toBeVisible();
    await expect(page.locator('a[href="/signup/ecc"]').first()).toBeVisible();
    await expect(page.locator('a[href="/signup/cleaning"]').first()).toBeVisible();
  });
});

test.describe("Signup", () => {
  test("/signup routes into the guided signup entry (login in signup mode)", async ({ page }) => {
    await page.goto("/signup");
    // Server redirects /signup -> /login?signup=1.
    await expect(page).toHaveURL(/\/login\?signup=1/);
  });

  test("the Service signup page renders a signup form", async ({ page }) => {
    await page.goto("/signup/service");
    await expect(page.locator("form").first()).toBeVisible();
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
  });
});

test.describe("Legal pages", () => {
  test("privacy policy renders its heading", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /privacy policy/i }).first()).toBeVisible();
  });

  test("terms of service renders its heading", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /terms of service/i }).first()).toBeVisible();
  });
});

test.describe("Unauthenticated access control", () => {
  test("visiting an app page while logged out lands on login, not the app", async ({ page }) => {
    // The ops dashboard is behind auth; logged out we must not see its content.
    await page.goto("/ops");
    await expect(page).toHaveURL(/\/login/);
  });
});
