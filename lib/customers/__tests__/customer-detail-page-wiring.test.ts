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
});
