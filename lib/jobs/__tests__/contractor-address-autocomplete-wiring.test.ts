import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const coreFieldsSource = readFileSync(
  resolve(process.cwd(), "components/jobs/JobCoreFields.tsx"),
  "utf8",
);
const newJobSource = readFileSync(
  resolve(process.cwd(), "app/jobs/new/NewJobForm.tsx"),
  "utf8",
);
const jobActionsSource = readFileSync(
  resolve(process.cwd(), "lib/actions/job-actions.ts"),
  "utf8",
);
const finalizationSource = readFileSync(
  resolve(
    process.cwd(),
    "app/ops/admin/contractor-intake-submissions/[id]/_components/GuidedFinalizationWizard.tsx",
  ),
  "utf8",
);

describe("contractor intake address autocomplete wiring", () => {
  it("uses the shared assistant only for the external service-location block", () => {
    expect(coreFieldsSource).toContain('mode === "external" ? (');
    expect(coreFieldsSource).toContain("<ServiceLocationAddressFields showAddressLine2={false} />");
    expect(newJobSource).toContain('mode={myContractor?.id ? "external" : "internal"}');
    expect(newJobSource).toContain("hideServiceLocation={false}");
  });

  it("keeps nationwide state visible, editable, required, and free of a CA default", () => {
    expect(coreFieldsSource).toContain("<ServiceLocationAddressFields showAddressLine2={false} />");
    expect(coreFieldsSource).not.toContain('<input type="hidden" name="state" value="CA" />');
    expect(coreFieldsSource).toContain('name="state"');
    expect(jobActionsSource).not.toContain('(isContractorUser ? "CA" : null)');
  });

  it("preserves proposal-only durable submission and required address validation", () => {
    const contractorBranch = jobActionsSource.slice(
      jobActionsSource.indexOf("// Contractor proposal seam:"),
      jobActionsSource.indexOf("// -----------------------------", jobActionsSource.indexOf("// Contractor proposal seam:")),
    );
    expect(contractorBranch).toContain('.from("contractor_intake_submissions")');
    expect(contractorBranch).toContain("if (!address_line1 || !city || !state || !zip)");
    expect(contractorBranch).not.toContain('.from("customers").insert');
    expect(contractorBranch).not.toContain('.from("locations").insert');
    expect(contractorBranch).not.toContain('.from("jobs").insert');
  });

  it("keeps attachment upload separate from proposal submission", () => {
    expect(newJobSource).toContain("if (!submittedProposalId)");
    expect(newJobSource).toContain("createContractorProposalAttachmentUploadToken");
    expect(newJobSource).toContain("finalizeContractorProposalAttachments");
    expect(newJobSource.indexOf("function uploadProposalAttachments")).toBeGreaterThan(-1);
  });

  it("leaves reuse-first internal finalization unwired and removes stale CA fallbacks", () => {
    expect(finalizationSource).not.toContain("GoogleAddressAutocomplete");
    expect(finalizationSource).not.toContain('proposed.state || "CA"');
    expect(finalizationSource).toContain('name="existing_location_id"');
    expect(finalizationSource).toContain('name="new_state"');
  });

  it("does not introduce provider metadata or automatic form submission", () => {
    for (const forbidden of ["place_id", "placeId", "latitude", "longitude", "requestSubmit"] as const) {
      expect(coreFieldsSource).not.toContain(forbidden);
    }
  });
});
