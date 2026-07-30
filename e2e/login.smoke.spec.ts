import { expect, test } from "@playwright/test";

test.describe("public authentication shell", () => {
  test("renders the login page without a server or browser error", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    const response = await page.goto("/login");

    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { name: "EveryStep FieldWorks" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
