import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const customerPageSource = readFileSync(
  resolve(__dirname, "../../../app/customers/[id]/page.tsx"),
  "utf8",
);

describe("customer detail relationship hub wiring", () => {
  it("uses responsible account language in overview", () => {
    expect(customerPageSource).toContain("Responsible Account");
    expect(customerPageSource).toContain("Account Contact");
    expect(customerPageSource).toContain("Account Phone");
    expect(customerPageSource).toContain("Account Email");
    expect(customerPageSource).toContain("Account Summary");
  });

  it("keeps role contacts rendering in account contacts section", () => {
    expect(customerPageSource).toContain("Account Contacts");
    expect(customerPageSource).toContain("Customer / Account Role Contacts");
    expect(customerPageSource).toContain("<RoleContactsCard");
  });

  it("renders lightweight internal contact entry controls", () => {
    expect(customerPageSource).toContain("Add account contact");
    expect(customerPageSource).toContain("Save account contact");
    expect(customerPageSource).toContain("Add site/access contact");
    expect(customerPageSource).toContain("Save site/access contact");
    expect(customerPageSource).toContain("isInternalViewer ? (");
  });

  it("shows billing and paperwork defaults copy", () => {
    expect(customerPageSource).toContain("Billing / Paperwork Defaults");
    expect(customerPageSource).toContain("Billing / Paperwork Contact:");
    expect(customerPageSource).toContain("Saved billing contact");
    expect(customerPageSource).toContain(
      "Invoices and paperwork default to the responsible account unless a job or invoice has its own billing recipient.",
    );
  });

  it("keeps managed locations and recent active work sections", () => {
    expect(customerPageSource).toContain("Managed Locations");
    expect(customerPageSource).toContain("Recent / Active Work");
    expect(customerPageSource).toContain("View Location");
    expect(customerPageSource).toContain("Site / Access Contact");
  });

  it("includes read-only billing periods inside maintenance agreement cards", () => {
    expect(customerPageSource).toContain("Billing Periods");
    expect(customerPageSource).toContain(
      "Billing periods are for billing visibility only and do not control service visits.",
    );
    expect(customerPageSource).toContain(
      "Work orders, visits, next due date, and visit counting continue independently of billing period status.",
    );
    expect(customerPageSource).toContain(
      "No billing periods have been created for this service plan yet.",
    );
    expect(customerPageSource).toContain("listMaintenanceAgreementBillingPeriodsForCustomer");
    expect(customerPageSource).toContain("billingPeriodsByAgreementId");
    expect(customerPageSource).toContain("payment_display_state");
    expect(customerPageSource).not.toContain("collect now");
    expect(customerPageSource).not.toContain("generate invoice");
    expect(customerPageSource).not.toContain("link invoice");
    expect(customerPageSource).not.toContain("autopay");
    expect(customerPageSource).not.toContain("subscription");
  });
});
