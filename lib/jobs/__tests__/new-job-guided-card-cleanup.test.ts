import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const formSource = readFileSync(
  path.join(process.cwd(), "app", "jobs", "new", "NewJobForm.tsx"),
  "utf8",
);

describe("new job guided card cleanup", () => {
  it("renders Contractor as its own guided card", () => {
    expect(formSource).toContain('title: "Contractor"');
    expect(formSource).toContain('description: "Select the responsible contractor when this job belongs to one."');
    expect(formSource).toContain('summary: selectedContractorName || "No contractor selected."');
  });

  it("only shows Related Work for an existing customer and saved location", () => {
    expect(formSource).toContain(
      'isInternalMode && !createNewCustomer && selectedCustomerId && locationMode === "existing" && locationId',
    );
    expect(formSource).toContain("{shouldShowRelationshipStep ? (");
  });

  it("separates Billing from the Schedule card", () => {
    const scheduleStart = formSource.indexOf('title: "Schedule"');
    const scheduleEnd = formSource.indexOf("</section>", scheduleStart);
    const billingStart = formSource.indexOf('title: "Billing"', scheduleEnd);

    expect(scheduleStart).toBeGreaterThan(-1);
    expect(scheduleEnd).toBeGreaterThan(scheduleStart);
    expect(billingStart).toBeGreaterThan(scheduleEnd);
    expect(formSource).toContain('description: "Choose who should receive billing for this job."');
    expect(formSource).not.toContain("Billing / Paperwork Recipient");
    expect(formSource).not.toContain("Different billing/paperwork recipient?");
  });
});
