import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const formSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/new/NewJobForm.tsx"),
  "utf-8",
);

describe("NewJobForm — Create New Customer shortcut", () => {
  it("renders a top-level shortcut button with id create-new-customer-shortcut", () => {
    expect(formSource).toContain('id="create-new-customer-shortcut"');
  });

  it("shortcut button label is '+ New Customer'", () => {
    expect(formSource).toContain("+ New Customer");
  });

  it("shortcut button calls setCreateNewCustomer(true)", () => {
    expect(formSource).toContain("setCreateNewCustomer(true)");
  });

  it("shortcut button clears selectedCustomerId", () => {
    expect(formSource).toContain('setSelectedCustomerId("")');
  });

  it("shortcut appears before the customer search input in source order", () => {
    const shortcutIdx = formSource.indexOf('id="create-new-customer-shortcut"');
    const searchInputIdx = formSource.indexOf('id="internal_customer_finder"');
    expect(shortcutIdx).toBeGreaterThan(0);
    expect(searchInputIdx).toBeGreaterThan(0);
    expect(shortcutIdx).toBeLessThan(searchInputIdx);
  });

  it("original bottom 'Create new customer' fallback button is removed", () => {
    // The standalone bottom button with this exact label is gone; only the
    // new-customer card heading (different text) and the top shortcut remain.
    expect(formSource).not.toContain('"Create new customer"');
  });

  it("customer search input still present", () => {
    expect(formSource).toContain('id="internal_customer_finder"');
  });

  it("does not expose hybrid signup in /jobs/new form", () => {
    expect(formSource).not.toContain("/signup/hybrid");
  });
});
