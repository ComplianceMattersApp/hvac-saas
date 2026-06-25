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
    expect(formSource).toContain('title: "Customer & Service Location"');
    expect(formSource).toContain('title: "Schedule"');
    expect(formSource).toContain('title: isCleaningMode ? "Site Details" : isContractorMode ? "Equipment" : "Additional Details"');
    expect(formSource).toContain('title: createSectionTitle');
  });

  it("shows summary-first guided copy instead of final confidence copy", () => {
    expect(formSource).toContain("Select the customer / responsible account and confirm where the work order should happen.");
    expect(formSource).toContain("Select the customer / responsible account and confirm where the compliance job should happen.");
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
    expect(formSource).toContain("Billing / Paperwork Recipient");
    expect(formSource).toContain("Different billing/paperwork recipient?");
    expect(formSource).toContain("Billing and paperwork default to the responsible account.");
  });

  it("keeps site/access contact toggle collapsed by default", () => {
    expect(formSource).toContain("Different site/access contact?");
    expect(formSource).toContain('name="site_access_contact_different"');
    expect(formSource).toContain("Defaults to responsible account contact details.");
  });

  it("keeps the Service Address choice visible after customer selection", () => {
    expect(formSource).toContain("!isCustomerContextInternalMode && !createNewCustomer && !selectedCustomerId");
    expect(formSource).toContain("Service Address");
    expect(formSource).toContain("This is where the job will take place.");
    expect(formSource).toContain("Use saved service address");
    expect(formSource).toContain("Add new service address");
    expect(formSource).toContain("Saved service address");
    expect(formSource).toContain("Selected service address");
    expect(formSource).toContain("Select saved service address...");
    expect(formSource).not.toContain("Default address");
  });

  it("wires saved service address selection to the submitted location id", () => {
    expect(formSource).toContain("value={locationId}");
    expect(formSource).toContain("setLocationId(e.target.value)");
    expect(formSource).toContain("selectedCustomerLocations.map((l) => (");
    expect(formSource).toContain('<input type="hidden" name="location_id" value={locationId} />');
  });

  it("wires add-new service address mode through Branch 2 fields", () => {
    expect(formSource).toContain('setLocationMode("new")');
    expect(formSource).toContain('setLocationId("")');
    expect(formSource).toContain('name="address_line1"');
    expect(formSource).toContain('name="address_line2"');
    expect(formSource).toContain('name="city"');
    expect(formSource).toContain('name="state"');
    expect(formSource).toContain('name="zip"');
    expect(formSource).toContain("This service address will be saved under the customer for future jobs.");
  });
});
