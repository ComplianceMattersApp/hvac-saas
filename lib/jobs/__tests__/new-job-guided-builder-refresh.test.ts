import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const formSource = readFileSync(
  path.join(process.cwd(), "app", "jobs", "new", "NewJobForm.tsx"),
  "utf8",
);

describe("/jobs/new guided builder refresh", () => {
  it("uses a shared guided-section shell for the main internal intake sections", () => {
    expect(formSource).toContain("guidedSectionShellClass");
    expect(formSource).toContain("renderGuidedSectionIntro({");
    expect(formSource).toContain('title: "Customer & Location"');
    expect(formSource).toContain('title: "Schedule"');
    expect(formSource).toContain('title: "Additional Details"');
    expect(formSource).toContain('title: createSectionTitle');
  });

  it("shows summary-first guided copy instead of final confidence copy", () => {
    expect(formSource).toContain("Find the customer and confirm where the work order should happen.");
    expect(formSource).toContain("Find the customer and confirm where the compliance job should happen.");
    expect(formSource).toContain("Choose visit details and add the work scope.");
    expect(formSource).toContain("Leave unscheduled if timing is not set yet.");
    expect(formSource).toContain("Permit, equipment, photos, and comments stay secondary.");
    expect(formSource).not.toContain("Final confidence");
  });

  it("keeps photos and additional comments inside Additional Details for internal intake", () => {
    expect(formSource).toContain("Photos");
    expect(formSource).toContain("Additional Comments");
    expect(formSource).toContain('name="photos"');
    expect(formSource).toContain('name="job_notes"');
  });

  it("does not expose request-source selection during customer intake", () => {
    expect(formSource).not.toContain("Request came from");
    expect(formSource).not.toContain('name="intake_request_source"');
  });

  it("folds internal billing controls into the guided Schedule section", () => {
    expect(formSource).toContain('title: "Schedule"');
    expect(formSource).toContain("Schedule the visit if needed, then confirm who gets billed later.");
    expect(formSource).toContain("Billing Recipient");
  });

  it("collapses customer and existing-location selectors after they are chosen", () => {
    expect(formSource).toContain("!isCustomerContextInternalMode && !createNewCustomer && !selectedCustomerId");
    expect(formSource).toContain("Change location");
    expect(formSource).toContain("Selected service location");
  });
});
