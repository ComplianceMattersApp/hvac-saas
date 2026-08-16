import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const opsPageSource = readFileSync(resolve(__dirname, "../../../app/ops/page.tsx"), "utf8");
const opsWorkspaceQueuesSource = readFileSync(
  resolve(__dirname, "../../../lib/ops/ops-workspace-queues.ts"),
  "utf8",
);
const opsWorkspaceOverviewLoaderSource = readFileSync(
  resolve(__dirname, "../../../lib/ops/ops-workspace-overview-loader.ts"),
  "utf8",
);
const opsPermitWorkspaceLoaderSource = readFileSync(
  resolve(__dirname, "../../../lib/ops/ops-permit-workspace-loader.ts"),
  "utf8",
);
const permitWorkspaceActionsSource = readFileSync(
  resolve(__dirname, "../../../app/ops/_actions/permit-workspace-actions.ts"),
  "utf8",
);
const opsPermitWorkspaceSource = readFileSync(
  resolve(__dirname, "../../../app/ops/_components/OpsPermitWorkspace.tsx"),
  "utf8",
);

function permitRenderBranch() {
  expect(opsPageSource).toContain("<OpsPermitWorkspace");
  expect(opsPageSource).toContain("snapshot={permitWorkspaceSnapshot}");
  return opsPermitWorkspaceSource;
}

describe("Ops workspace permit queue wiring", () => {
  it("keeps permit presentation details behind the dedicated workspace boundary", () => {
    expect(opsPageSource).toContain('import OpsPermitWorkspace from "./_components/OpsPermitWorkspace";');
    expect(opsPageSource).toContain("<OpsPermitWorkspace");
    expect(opsPageSource).not.toContain('name="permit_request_id"');
    expect(opsPageSource).not.toContain("<ServiceLocationAddressFields");
    expect(opsPageSource).not.toContain("<ImmediateSubmitButton");
    expect(opsPermitWorkspaceSource).toContain('name="permit_request_id"');
  });

  it("locks permit workflow submissions and shows immediate pending feedback", () => {
    expect(opsPermitWorkspaceSource).toContain('import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";');
    for (const pendingText of [
      "Creating permit...",
      "Starting...",
      "Updating...",
      "Resuming...",
      "Removing...",
      "Saving intake...",
      "Creating job...",
    ]) {
      expect(opsPermitWorkspaceSource).toContain(`pendingText="${pendingText}"`);
    }
  });

  it("adds an allowlist-and-schema-guarded Permits chip to the Operations Workspace", () => {
    expect(opsWorkspaceOverviewLoaderSource).toContain("listActivePermitRequestQueueRowsIfAvailable");
    expect(opsPageSource).toContain("isPermitWorkflowEnabledForAccountOwner");
    expect(opsPageSource).toContain("permitWorkflowEnabled");
    expect(opsWorkspaceOverviewLoaderSource).toContain("permitRequestsSchemaAvailable");
    expect(opsWorkspaceOverviewLoaderSource).toContain("params.permitWorkflowEnabled && params.activePermitRequestsResult.schemaAvailable");
    expect(opsWorkspaceOverviewLoaderSource).toContain("resolveEffectiveOpsBoardBucketFilter");
    expect(opsWorkspaceOverviewLoaderSource).toContain("permitRequestsSchemaAvailable,");
    expect(opsWorkspaceOverviewLoaderSource).toContain("buildOpsWorkspaceTabs({");
    expect(opsWorkspaceQueuesSource).toContain('key: "permits"');
    expect(opsWorkspaceQueuesSource).toContain('label: "Permits"');
    expect(opsWorkspaceQueuesSource).toContain('bucket: "permits"');
  });

  it("selecting bucket=permits renders the active permit queue", () => {
    const branch = permitRenderBranch();

    expect(branch).toContain("snapshot.rows");
    expect(branch).toContain("No active permit requests.");
    expect(branch).toContain("permitRequest.internalStatusLabel");
    expect(branch).toContain("subtitle={display.context}");
    expect(branch).toContain("permitRequest.contractorName || permitRequest.contractorId");
    expect(branch).toContain("value: display.submitted");
    expect(branch).toContain("permitRequest.addressLine1Snapshot");
    expect(branch).toContain("permitRequest.citySnapshot");
    expect(branch).toContain("permitRequest.stateSnapshot");
    expect(branch).toContain("permitRequest.zipSnapshot");
    expect(branch).toContain("permitRequest.jurisdiction");
  });

  it("renders a small internal manual intake entry point for permits", () => {
    expect(permitWorkspaceActionsSource).toContain("createInternalManualPermitRequest");
    expect(opsPermitWorkspaceSource).toContain("createManualPermitRequestFromOps");
    expect(opsPermitWorkspaceSource).toContain("+ New Permit Request");
    expect(opsPermitWorkspaceSource).toContain("Create one from a text, phone call, email, or photo request.");
    expect(opsPageSource).toContain("shouldExpandPermitCreateForm");
    expect(opsPermitWorkspaceSource).toContain('name="contractor_id"');
    expect(opsPermitWorkspaceSource).toContain('name="request_label"');
    expect(opsPermitWorkspaceSource).toContain('name="intake_note"');
    expect(opsPermitWorkspaceSource).toContain("<ServiceLocationAddressFields");
    expect(opsPermitWorkspaceSource).toContain('addressLine1Name="service_address_text"');
    expect(opsPermitWorkspaceSource).toContain("Create Permit Request");
  });

  it("keeps the full create form collapsed by default and only opens from the create intent", () => {
    expect(opsPageSource).toContain("createIntent");
    expect(opsPageSource).toContain("expandCreateForm={shouldExpandPermitCreateForm}");
    expect(opsPermitWorkspaceSource).toContain("open={expanded}");
    expect(opsPermitWorkspaceSource).toContain('id="permit-request-create"');
  });

  it("renders active-state permit controls with the mark-created completion entry point", () => {
    const branch = permitRenderBranch();

    expect(permitWorkspaceActionsSource).toContain("acceptInternalPermitRequest");
    expect(permitWorkspaceActionsSource).toContain("holdInternalPermitRequest");
    expect(permitWorkspaceActionsSource).toContain("resumeInternalPermitRequest");
    expect(permitWorkspaceActionsSource).toContain("markInternalPermitCreated");
    expect(permitWorkspaceActionsSource).toContain("markInternalPermitRequestNotNeeded");
    expect(opsPermitWorkspaceSource).toContain("markPermitCreatedFromOps");
    expect(branch).toContain("Accept / Start Permit");
    expect(branch).toContain("Put On Hold");
    expect(branch).toContain("Resume / In Process");
    expect(branch).toContain("Mark Permit Created");
    expect(branch).toContain("Permit No Longer Needed");
    expect(branch).toContain('name="reason"');
    expect(branch).toContain("Mark Not Needed");
    expect(branch).toContain("preserves its history");
    expect(branch).toContain('name="internal_note"');
    expect(branch).toContain("Add or correct the internal note that should appear on the job.");
    expect(permitWorkspaceActionsSource).toContain("redirect(`/jobs/${jobId}`)");
  });

  it("renders create-job-and-mark-created UI for unlinked active permit requests", () => {
    const branch = permitRenderBranch();

    expect(permitWorkspaceActionsSource).toContain("createJobFromPermitRequestAndMarkCreated");
    expect(opsPermitWorkspaceSource).toContain("createJobAndMarkPermitCreatedFromOps");
    expect(branch).toContain("No job is linked yet. This will start the customer/job record from the permit intake below.");
    expect(branch).toContain("Permit intake draft");
    expect(branch).toContain("Create Job From Permit Intake");
    expect(branch).toContain('name="customer_location_mode"');
    expect(branch).toContain('value="new_new"');
    expect(branch).toContain('name="project_type"');
    expect(branch).toContain('value="alteration"');
    expect(branch).toContain('value="all_new"');
    expect(branch).toContain('name="billing_recipient"');
    expect(branch).toContain('value="contractor"');
    expect(branch).toContain('value="customer"');
    expect(branch).toContain('name="customer_first_name"');
    expect(branch).toContain('name="customer_last_name"');
    expect(branch).toContain('name="address_line1"');
    expect(branch).toContain('name="city"');
    expect(branch).toContain('name="state"');
    expect(branch).toContain('name="zip"');
    expect(branch).not.toContain("Existing customer + existing location");
    expect(branch).not.toContain("Existing customer + new location");
    expect(branch).not.toContain("New customer + new location");
    expect(branch).not.toContain('name="existing_customer_id"');
    expect(branch).not.toContain('name="existing_location_id"');
    expect(branch).toContain("Is the job ready to be tested?");
    expect(branch).toContain("ECC project type");
    expect(branch).toContain("Billing party");
    expect(branch).toContain("Ready - schedule now or queue for scheduling");
    expect(branch).toContain("Waiting for install");
    expect(branch).toContain("Creates an unscheduled ECC testing job and places it in the waiting to be scheduled queue.");
    expect(branch).toContain("Creates an ECC testing job and places it in Waiting / Pending Info as On Hold: Permit pulled and waiting for install.");
  });

  it("keeps linked active permit requests on the existing mark-created path", () => {
    const branch = permitRenderBranch();

    expect(branch).toContain("const isLinked = Boolean(permitRequest.jobId)");
    expect(branch).toContain("isLinked ? (");
    expect(branch).toContain('action={markPermitCreatedFromOps}');
    expect(branch).toContain('action={createJobAndMarkPermitCreatedFromOps}');
    expect(branch).toContain("Moves the linked job to scheduling when it is unscheduled, or keeps it scheduled if it already has a time.");
    expect(branch).toContain("Create Job From Permit Intake");
  });

  it("renders an internal permit intake review panel alongside route completion controls", () => {
    const branch = permitRenderBranch();

    expect(permitWorkspaceActionsSource).toContain("updateInternalPermitRequestIntake");
    expect(opsPermitWorkspaceSource).toContain("updatePermitRequestIntakeFromOps");
    expect(branch).toContain("Edit Permit Intake");
    expect(branch).toContain("Save Intake Details");
    expect(branch).toContain('name="request_label"');
    expect(branch).toContain('name="customer_first_name_snapshot"');
    expect(branch).toContain('name="customer_email_snapshot"');
    expect(branch).toContain('name="customer_phone_snapshot"');
    expect(branch).toContain('name="service_address_text_snapshot"');
    expect(branch).toContain('name="total_value"');
    expect(branch).toContain("permitRequest.addressLine2Snapshot");
    expect(branch).toContain('label="Internal intake note"');
    expect(branch).toContain('name="permit_number"');
    expect(branch).toContain('name="post_permit_route"');
    expect(branch).toContain('value="ready_for_testing"');
    expect(branch).toContain('value="pending_install"');
    expect(branch).toContain("Is the job ready to be tested?");
    expect(branch).toContain("Ready - schedule now or queue for scheduling");
    expect(branch).toContain("Waiting for install");
    expect(branch).toContain("Moves the linked job to scheduling when it is unscheduled, or keeps it scheduled if it already has a time.");
    expect(branch).toContain("Moves the linked job to Waiting / Pending Info as On Hold: Permit pulled and waiting for install.");
  });

  it("renders read-only submitted permit files without upload controls", () => {
    const branch = permitRenderBranch();

    expect(opsPermitWorkspaceLoaderSource).toContain("listInternalPermitRequestAttachmentsForAccount");
    expect(opsPageSource).toContain("loadOpsPermitWorkspaceSnapshot");
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
    expect(permitWorkspaceActionsSource).toContain("encodeURIComponent(message)");
    expect(permitWorkspaceActionsSource).toContain("/ops?bucket=permits&permit_error=");
    expect(permitWorkspaceActionsSource).toContain('const PERMIT_WORKSPACE_HREF = "/ops?bucket=permits#ops-workspace"');
  });

  it("keeps existing Ops workbench chips and job queues in place", () => {
    expect(opsWorkspaceOverviewLoaderSource).toContain("buildOpsWorkspaceTabs({");
    expect(opsWorkspaceQueuesSource).toContain('key: "need_to_schedule"');
    expect(opsWorkspaceQueuesSource).toContain('label: "Needs Scheduling"');
    expect(opsWorkspaceQueuesSource).toContain('key: "field_work"');
    expect(opsWorkspaceQueuesSource).toContain('label: "Field Work"');
    expect(opsWorkspaceQueuesSource).toContain('key: "waiting"');
    expect(opsWorkspaceQueuesSource).toContain('label: "Waiting / Pending Info"');
    expect(opsWorkspaceQueuesSource).toContain('key: "exceptions"');
    expect(opsWorkspaceQueuesSource).toContain('label: "Exceptions"');
    expect(opsWorkspaceQueuesSource).toContain('key: "closeout"');
    expect(opsWorkspaceQueuesSource).toContain('label: "Closeout & Review"');
  });

  it("keeps permit UI mutations routed through server actions instead of inline lifecycle SQL", () => {
    const source = `${opsPageSource}\n${opsPermitWorkspaceSource}\n${permitWorkspaceActionsSource}`.toLowerCase();

    expect(source).not.toContain("insert into public.job_events");
    expect(source).not.toContain("update public.jobs set ops_status");
    expect(source).not.toContain("permit_request_events");
    expect(permitWorkspaceActionsSource).toContain("createJobFromPermitRequestAndMarkCreated(formData)");
    expect(opsPageSource).not.toContain("createJobAndMarkPermitCreatedFromOps");
  });
});
