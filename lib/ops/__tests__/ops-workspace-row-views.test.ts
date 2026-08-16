import { describe, expect, it } from "vitest";
import { buildOpsWorkspaceEvidenceIndex } from "@/lib/ops/ops-workspace-evidence";
import {
  createOpsWorkspaceRowViewBuilders,
  resolveFollowUpUrgency,
  type OpsWorkspaceRowJob,
  type OpsWorkspaceRowViewContext,
} from "@/lib/ops/ops-workspace-row-views";

const NOW = new Date("2026-08-16T18:00:00.000Z");

function job(overrides: Partial<OpsWorkspaceRowJob> = {}): OpsWorkspaceRowJob {
  return {
    id: "job-1",
    title: "service call",
    status: "open",
    ops_status: "need_to_schedule",
    created_at: "2026-08-01T18:00:00.000Z",
    customer_first_name: "jANE",
    customer_last_name: "DOE",
    job_address: "123 Main St",
    city: "los angeles",
    job_type: "service",
    contractors: null,
    ...overrides,
  };
}

function builders(overrides: Partial<OpsWorkspaceRowViewContext> = {}) {
  return createOpsWorkspaceRowViewBuilders({
    accountTimeZone: "America/Los_Angeles",
    activeWorkspaceBaseHref: "/ops?bucket=pending",
    activeWorkspaceHref: "/ops?bucket=pending#ops-workspace",
    actorUserId: "user-1",
    assignmentDisplayMap: {},
    closeoutProjectionByJob: new Map(),
    defaultContractorName: "Internal HVAC",
    followUpTodayDate: "2026-08-16",
    latestCustomerAttemptByJob: new Map(),
    opsStatusEnteredAtByJob: new Map([
      ["job-1", { need_to_schedule: "2026-08-01T18:00:00.000Z" }],
    ]),
    serviceFollowUpByJob: new Map(),
    workspaceEvidence: buildOpsWorkspaceEvidenceIndex(),
    now: NOW,
    ...overrides,
  });
}

describe("Operations workspace row views", () => {
  it("builds a normalized Needs Scheduling view from one shared presentation contract", () => {
    const presentation = builders({
      latestCustomerAttemptByJob: new Map([
        ["job-1", "2026-08-15T17:30:00.000Z"],
      ]),
    });

    const view = presentation.buildJobRowView(job({ customer_phone: " 5551234567 " }), "need_to_schedule");

    expect(view).toMatchObject({
      kind: "need_to_schedule",
      title: "service call",
      customerName: "jANE Doe",
      address: "123 Main St, Los Angeles",
      contractorName: "Internal HVAC",
      reasonLabel: "Needs scheduling",
      ageLabel: "In queue 15d",
      ageDays: 15,
      phone: "5551234567",
      returnToHref: "/ops?bucket=pending#ops-workspace",
    });
    expect(view.recentAttemptText).not.toBe("No attempts yet");
  });

  it("builds Closeout needs, staffing, and next-step presentation from billing truth", () => {
    const presentation = builders({
      assignmentDisplayMap: {
        "job-1": [{
          job_id: "job-1",
          user_id: "tech-1",
          display_name: "alex TECH",
          is_primary: true,
          created_at: "2026-08-01T18:00:00.000Z",
        }],
      },
      closeoutProjectionByJob: new Map([
        ["job-1", {
          id: "job-1",
          field_complete: true,
          job_type: "ecc",
          ops_status: "paperwork_required",
          pending_info_reason: null,
          on_hold_reason: null,
          permit_number: "PERMIT-1",
          invoice_complete: false,
          certs_complete: false,
        }],
      ]),
    });

    const view = presentation.buildJobRowView(job({
      field_complete: true,
      job_type: "ecc",
      ops_status: "paperwork_required",
      permit_number: "PERMIT-1",
      invoice_complete: false,
      certs_complete: false,
    }), "closeout");

    expect(view).toMatchObject({
      kind: "closeout",
      needsLabel: "Invoice + paperwork",
      assignmentSummary: "Alex Tech",
    });
    expect(view.kind).toBe("closeout");
    if (view.kind === "closeout") expect(view.nextStepText).toBeTruthy();
  });

  it("keeps follow-up urgency boundaries deterministic", () => {
    expect(resolveFollowUpUrgency("", "2026-08-16")).toEqual({
      variant: "follow-up-unscheduled",
      label: "Needs date",
    });
    expect(resolveFollowUpUrgency("2026-08-15", "2026-08-16").label).toBe("1 day overdue");
    expect(resolveFollowUpUrgency("2026-08-16", "2026-08-16").label).toBe("Due today");
    expect(resolveFollowUpUrgency("2026-08-18", "2026-08-16").label).toBe("Due in 2 days");
    expect(resolveFollowUpUrgency("2026-08-20", "2026-08-16").label).toBe("Due in 4 days");
  });

  it("keeps held Waiting work visibly on hold", () => {
    const view = builders().buildJobRowView(job({
      status: "scheduled",
      ops_status: "on_hold",
      on_hold_reason: "Waiting for replacement part",
    }), "waiting");

    expect(view).toMatchObject({
      kind: "generic",
      reasonLabel: "On hold",
      actionLabel: "Open Job",
    });
    expect("stateChips" in view ? view.stateChips : []).toContainEqual({
      label: "On Hold",
      tone: "slate",
    });
  });

  it("formats field-payment review rows and preserves the active return anchor", () => {
    const view = builders().buildFieldPaymentReviewRowView({
      reportId: "report-1",
      accountOwnerUserId: "owner-1",
      jobId: "job-1",
      jobReference: "JOB-1",
      jobTitle: null,
      locationLabel: null,
      internalInvoiceId: "invoice-1",
      invoiceReference: "INV-1",
      customerId: "customer-1",
      customerDisplayName: null,
      paymentMethod: "check",
      amountCents: 12345,
      currency: "usd",
      reference: null,
      note: null,
      status: "reported",
      reportedByUserId: "user-1",
      reportedByDisplayName: "Office User",
      reportedAt: "2026-08-16T18:00:00.000Z",
      links: {
        invoiceWorkspaceHref: "/jobs/job-1/invoice",
        jobHref: "/jobs/job-1",
        customerHref: "/customers/customer-1",
      },
    });

    expect(view).toMatchObject({
      kind: "field_payment_review",
      title: "JOB-1",
      subtitle: "Customer",
      amountText: "$123.45",
      methodText: "Check",
      isSelfReported: true,
      returnToHref: "/ops?bucket=pending#ops-workspace-field-payment-report-1",
    });
  });
});
