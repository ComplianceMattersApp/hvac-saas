import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(resolve(__dirname, "../../..", path), "utf-8");
}

describe("customer-only entrypoint wiring", () => {
  it("standalone customer route uses the customer-only action and no intake actions", () => {
    const pageSource = readRepoFile("app/customers/new/page.tsx");

    expect(pageSource).toContain("createCustomerOnlyFromForm");
    expect(pageSource).not.toContain("createJobFromForm");
    expect(pageSource).not.toContain("contractor-intake-actions");
    expect(pageSource).not.toContain("finalizeContractorIntakeSubmissionFromForm");
  });

  it("mobile New Customer shortcut points to standalone customer creation", () => {
    const mobileMenuSource = readRepoFile("components/layout/MobileShellMenu.tsx");

    expect(mobileMenuSource).toContain('href="/customers/new"');
    expect(mobileMenuSource).not.toContain('href="/jobs/new?create_customer=1"');
  });

  it("/jobs/new customer shortcut cannot submit the parent intake form", () => {
    const newJobFormSource = readRepoFile("app/jobs/new/NewJobForm.tsx");
    const shortcutIndex = newJobFormSource.indexOf('id="create-new-customer-shortcut"');
    const shortcutSource = newJobFormSource.slice(Math.max(0, shortcutIndex - 300), shortcutIndex + 500);

    expect(shortcutIndex).toBeGreaterThan(0);
    expect(shortcutSource).toContain('type="button"');
    expect(shortcutSource).toContain("setCreateNewCustomer(true)");
  });
});
