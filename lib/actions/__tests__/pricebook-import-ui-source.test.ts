import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRICEBOOK_IMPORT_TEMPLATE_CSV } from "@/lib/business/pricebook-import";

const panelSource = readFileSync(
  join(process.cwd(), "app/ops/admin/pricebook/PricebookImportPanel.tsx"),
  "utf8",
);
const routeSource = readFileSync(
  join(process.cwd(), "app/ops/admin/pricebook/import-template/route.ts"),
  "utf8",
);

describe("pricebook import UI source", () => {
  it("renders the requested import language and preview sections", () => {
    expect(panelSource).toContain("Import services and add-ons");
    expect(panelSource).toContain("Download template");
    expect(panelSource).toContain("Upload CSV");
    expect(panelSource).toContain("Ready to add");
    expect(panelSource).toContain("Already exists");
    expect(panelSource).toContain("Needs review");
    expect(panelSource).toContain("This import does not create jobs, invoices, charges, payments, or checklist tasks.");
  });

  it("includes the page column guide and examples", () => {
    [
      "Service Name",
      "Category",
      "Kind",
      "Unit",
      "Price",
      "Active",
      "Description",
      "Deep Cleaning is a Service counted by Job.",
      "Extra Labor Hour is Labor counted by Hour.",
      "After-Hours Service can be set to Active = No until you are ready to use it.",
    ].forEach((copy) => {
      expect(panelSource).toContain(copy);
    });
  });

  it("template route uses admin access and the friendly CSV template", () => {
    expect(routeSource).toContain('requireInternalRole("admin"');
    expect(routeSource).toContain("PRICEBOOK_IMPORT_TEMPLATE_CSV");
    expect(PRICEBOOK_IMPORT_TEMPLATE_CSV).toContain(
      "Service Name,Category,Kind,Unit,Price,Active,Description",
    );
    expect(PRICEBOOK_IMPORT_TEMPLATE_CSV).toContain(
      "General Cleaning,Cleaning,Service,Job,0,Yes,Standard one-off cleaning service",
    );
  });
});
