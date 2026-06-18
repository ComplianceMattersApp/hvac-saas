import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const opsPageSource = readFileSync(resolve(__dirname, "../../../app/ops/page.tsx"), "utf8");

function permitRenderBranch() {
  const selectedRowsIndex = opsPageSource.indexOf("selectedPermitRows.length === 0");
  const start = opsPageSource.lastIndexOf('{selectedWorkspaceKey === "permits" ? (', selectedRowsIndex);
  const end = opsPageSource.indexOf(") : !selectedWorkspaceSection", start);
  expect(selectedRowsIndex).toBeGreaterThanOrEqual(0);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return opsPageSource.slice(start, end);
}

describe("Ops workspace permit queue wiring", () => {
  it("adds an allowlist-and-schema-guarded Permits chip to the Operations Workspace", () => {
    expect(opsPageSource).toContain("listActivePermitRequestQueueRowsIfAvailable");
    expect(opsPageSource).toContain("isPermitWorkflowEnabledForAccountOwner");
    expect(opsPageSource).toContain("permitWorkflowEnabled");
    expect(opsPageSource).toContain("permitRequestsSchemaAvailable");
    expect(opsPageSource).toContain("permitWorkflowEnabled && activePermitRequestsResult.schemaAvailable");
    expect(opsPageSource).toContain('activeBoardBucketFilter === "permits" && !permitRequestsSchemaAvailable');
    expect(opsPageSource).toContain('key: "permits"');
    expect(opsPageSource).toContain('label: "Permits"');
    expect(opsPageSource).toContain('bucket: "permits"');
  });

  it("selecting bucket=permits renders the active permit queue", () => {
    const branch = permitRenderBranch();

    expect(branch).toContain("selectedPermitRows");
    expect(branch).toContain("No active permit requests.");
    expect(branch).toContain("permitRequest.internalStatusLabel");
    expect(branch).toContain("permitQueueContext(permitRequest)");
    expect(branch).toContain("permitRequest.contractorName || permitRequest.contractorId");
    expect(branch).toContain("permitRequest.submittedAgeDays");
    expect(branch).toContain("permitRequest.serviceAddressTextSnapshot");
    expect(branch).toContain("permitRequest.jurisdiction");
  });

  it("renders a small internal manual intake entry point for permits", () => {
    expect(opsPageSource).toContain("createInternalManualPermitRequest");
    expect(opsPageSource).toContain("createManualPermitRequestFromOps");
    expect(opsPageSource).toContain("+ New Permit Request");
    expect(opsPageSource).toContain("Create one from a text, phone call, email, or photo request.");
    expect(opsPageSource).toContain("shouldExpandPermitCreateForm");
    expect(opsPageSource).toContain('name="contractor_id"');
    expect(opsPageSource).toContain('name="request_label"');
    expect(opsPageSource).toContain('name="intake_note"');
    expect(opsPageSource).toContain("Create Permit Request");
  });

  it("keeps the full create form collapsed by default and only opens from the create intent", () => {
    expect(opsPageSource).toContain("createIntent");
    expect(opsPageSource).toContain("open={shouldExpandPermitCreateForm}");
    expect(opsPageSource).toContain('id="permit-request-create"');
    expect(opsPageSource).not.toContain('No active permit requests.</div>\n                  <Link href=');
  });

  it("renders active-state permit controls with the mark-created completion entry point", () => {
    const branch = permitRenderBranch();

    expect(opsPageSource).toContain("acceptInternalPermitRequest");
    expect(opsPageSource).toContain("holdInternalPermitRequest");
    expect(opsPageSource).toContain("resumeInternalPermitRequest");
    expect(opsPageSource).toContain("markInternalPermitCreated");
    expect(opsPageSource).toContain("markPermitCreatedFromOps");
    expect(branch).toContain("Accept / Start Permit");
    expect(branch).toContain("Put On Hold");
    expect(branch).toContain("Resume / In Process");
    expect(branch).toContain("Mark Permit Created");
  });

  it("renders create-job-and-mark-created UI for unlinked active permit requests", () => {
    const branch = permitRenderBranch();

    expect(opsPageSource).toContain("createJobFromPermitRequestAndMarkCreated");
    expect(opsPageSource).toContain("createJobAndMarkPermitCreatedFromOps");
    expect(branch).toContain("No job is linked yet. Create the testing job from this permit request when the permit is ready.");
    expect(branch).toContain("Create Job & Mark Permit Created");
    expect(branch).toContain('name="customer_location_mode"');
    expect(branch).toContain('value="existing_existing"');
    expect(branch).toContain("Existing customer + existing location");
    expect(branch).toContain('value="existing_new"');
    expect(branch).toContain("Existing customer + new location");
    expect(branch).toContain('value="new_new"');
    expect(branch).toContain("New customer + new location");
    expect(branch).toContain('name="existing_customer_id"');
    expect(branch).toContain('name="existing_location_id"');
    expect(branch).toContain('name="customer_first_name"');
    expect(branch).toContain('name="customer_last_name"');
    expect(branch).toContain('name="address_line1"');
    expect(branch).toContain('name="city"');
    expect(branch).toContain('name="state"');
    expect(branch).toContain('name="zip"');
    expect(branch).toContain("Creates an unscheduled ECC testing job and moves it to Scheduling.");
    expect(branch).toContain("Creates an ECC testing job and places it On Hold");
  });

  it("keeps linked active permit requests on the existing mark-created path", () => {
    const branch = permitRenderBranch();

    expect(branch).toContain("permitRequest.jobId ? (");
    expect(branch).toContain('action={markPermitCreatedFromOps}');
    expect(branch).toContain('action={createJobAndMarkPermitCreatedFromOps}');
    expect(branch).toContain("Moves the linked job toward scheduling if it is not already scheduled.");
    expect(branch).toContain("Create Job & Mark Permit Created");
  });

  it("renders an internal permit intake review panel alongside route completion controls", () => {
    const branch = permitRenderBranch();

    expect(opsPageSource).toContain("updateInternalPermitRequestIntake");
    expect(opsPageSource).toContain("updatePermitRequestIntakeFromOps");
    expect(branch).toContain("Edit Permit Intake");
    expect(branch).toContain("Save Intake Details");
    expect(branch).toContain('name="request_label"');
    expect(branch).toContain('name="customer_first_name_snapshot"');
    expect(branch).toContain('name="service_address_text_snapshot"');
    expect(branch).toContain('name="permit_number"');
    expect(branch).toContain('name="post_permit_route"');
    expect(branch).toContain('value="ready_for_testing"');
    expect(branch).toContain('value="pending_install"');
    expect(branch).toContain("Ready for Testing");
    expect(branch).toContain("Pending Install");
    expect(branch).toContain("Moves the linked job toward scheduling if it is not already scheduled.");
    expect(branch).toContain("Moves the linked job to Waiting / On Hold");
  });

  it("renders read-only submitted permit files without upload controls", () => {
    const branch = permitRenderBranch();

    expect(opsPageSource).toContain("listInternalPermitRequestAttachmentsForAccount");
    expect(branch).toContain("Submitted files");
    expect(branch).toContain("No files attached.");
    expect(branch).toContain("attachment.signedUrl");
    expect(branch).not.toContain("Upload files");
  });

  it("does not add job-linking UI when an active permit request is not linked to a job", () => {
    const branch = permitRenderBranch();

    expect(branch).toContain("permitRequest.jobId");
    expect(branch).not.toContain("Link Job");
    expect(branch).not.toContain('name="job_id"');
  });

  it("surfaces mark-created action errors back on the Permits bucket", () => {
    expect(opsPageSource).toContain("permit_error");
    expect(opsPageSource).toContain("permitActionError");
    expect(opsPageSource).toContain("encodeURIComponent(message)");
    expect(opsPageSource).toContain("redirect(`/ops?bucket=permits&permit_error=");
    expect(opsPageSource).toContain('redirect("/ops?bucket=permits#ops-workspace")');
  });

  it("keeps existing Ops workbench chips and job queues in place", () => {
    expect(opsPageSource).toContain('key: "need_to_schedule"');
    expect(opsPageSource).toContain('label: "Needs Scheduling"');
    expect(opsPageSource).toContain('key: "field_work"');
    expect(opsPageSource).toContain('label: "Field Work"');
    expect(opsPageSource).toContain('key: "waiting"');
    expect(opsPageSource).toContain('label: "Waiting / Pending Info"');
    expect(opsPageSource).toContain('key: "exceptions"');
    expect(opsPageSource).toContain('label: "Exceptions"');
    expect(opsPageSource).toContain('key: "closeout"');
    expect(opsPageSource).toContain('label: "Closeout & Review"');
  });

  it("keeps permit UI mutations routed through server actions instead of inline lifecycle SQL", () => {
    const source = opsPageSource.toLowerCase();

    expect(source).not.toContain("insert into public.job_events");
    expect(source).not.toContain("update public.jobs set ops_status");
    expect(source).not.toContain("permit_request_events");
    expect(opsPageSource).toContain("createJobFromPermitRequestAndMarkCreated(formData)");
  });
});
