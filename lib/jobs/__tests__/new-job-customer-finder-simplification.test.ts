import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const formSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/new/NewJobForm.tsx"),
  "utf-8",
);

describe("New job customer finder simplification", () => {
  it("hides customer rows until a meaningful query is entered", () => {
    expect(formSource).toContain("if (query.length < 2) return [];");
    expect(formSource).toContain("hasMeaningfulCustomerQuery && filteredGuidedCustomers.length > 0");
  });

  it("uses field-first customer finder copy", () => {
    expect(formSource).toContain("Search customer name, phone, or address.");
    expect(formSource).toContain("Search customer name, phone, or address");
    expect(formSource).toContain("No matching customers found.");
    expect(formSource).not.toContain("Type customer name to find the best match.");
  });

  it("keeps create-new customer path available", () => {
    expect(formSource).toContain("create-new-customer-shortcut");
    expect(formSource).toContain("+ New Customer");
  });
});
