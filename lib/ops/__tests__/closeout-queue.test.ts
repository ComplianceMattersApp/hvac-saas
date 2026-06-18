import { describe, expect, it } from "vitest";

import {
  canShowExternalInvoiceSentAction,
  listCloseoutQueueJobs,
  sortCloseoutQueueJobs,
} from "@/lib/ops/closeout-queue";

describe("listCloseoutQueueJobs", () => {
  it("includes scheduled closeout-needed jobs via canonical closeout projection", () => {
    const jobs = [
      {
        id: "job-closeout-scheduled",
        status: "open",
        job_type: "ecc",
        ops_status: "paperwork_required",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
        scheduled_date: "2026-05-19",
      },
      {
        id: "job-not-closeout",
        status: "open",
        job_type: "service",
        ops_status: "scheduled",
        field_complete: false,
        certs_complete: false,
        invoice_complete: false,
      },
    ];

    const rows = listCloseoutQueueJobs(jobs, (job) => job);
    expect(rows.map((row) => row.id)).toEqual(["job-closeout-scheduled"]);
  });

  it("keeps dashboard count and list consistency by deriving both from the same list", () => {
    const jobs = [
      {
        id: "job-a",
        job_type: "ecc",
        ops_status: "paperwork_required",
        field_complete: true,
        certs_complete: true,
        invoice_complete: false,
      },
      {
        id: "job-b",
        job_type: "ecc",
        ops_status: "closed",
        field_complete: true,
        certs_complete: true,
        invoice_complete: true,
      },
      {
        id: "job-c",
        job_type: "service",
        ops_status: "invoice_required",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
      },
    ];

    const rows = listCloseoutQueueJobs(jobs, (job) => job);
    const count = rows.length;

    expect(rows.map((row) => row.id)).toEqual(["job-a", "job-c"]);
    expect(count).toBe(2);
  });

  it("includes permit-missing jobs when invoice closeout is still needed", () => {
    const jobs = [
      {
        id: "permit-missing-needs-invoice",
        job_type: "ecc",
        ops_status: "pending_info",
        pending_info_reason: "Permit Missing",
        field_complete: true,
        certs_complete: true,
        invoice_complete: false,
      },
      {
        id: "generic-approval-needs-invoice",
        job_type: "service",
        ops_status: "pending_info",
        pending_info_reason: "Approval Needed: Test Approval Needed",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
      },
      {
        id: "generic-on-hold-needs-invoice",
        job_type: "service",
        ops_status: "on_hold",
        on_hold_reason: "Status interrupt state test",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
      },
      {
        id: "need-to-schedule-needs-invoice",
        job_type: "service",
        ops_status: "need_to_schedule",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
      },
      {
        id: "permit-missing-no-closeout-blocker",
        job_type: "ecc",
        ops_status: "pending_info",
        pending_info_reason: "Permit Missing",
        field_complete: true,
        certs_complete: true,
        invoice_complete: true,
      },
    ];

    const rows = listCloseoutQueueJobs(jobs, (job) => job);

    expect(rows.map((row) => row.id)).toEqual(["permit-missing-needs-invoice"]);
    expect(rows[0]?.pending_info_reason).toBe("Permit Missing");
  });

  it("includes permit-missing jobs with combined invoice and cert closeout work", () => {
    const rows = listCloseoutQueueJobs([
      {
        id: "permit-missing-needs-invoice-and-certs",
        job_type: "ecc",
        ops_status: "pending_info",
        pending_info_reason: "Permit Needed",
        field_complete: true,
        certs_complete: false,
        invoice_complete: false,
      },
    ], (job) => job);

    expect(rows.map((row) => row.id)).toEqual(["permit-missing-needs-invoice-and-certs"]);
  });
});

describe("canShowExternalInvoiceSentAction", () => {
  it("shows the action for external billing rows that still need invoice follow-up", () => {
    expect(
      canShowExternalInvoiceSentAction({
        needsInvoice: true,
        billingState: {
          lightweightBillingAllowed: true,
          usesInternalInvoicing: false,
          jobInvoiceCompleteProjection: false,
        },
      }),
    ).toBe(true);
  });

  it("hides the action when internal invoicing owns billing closeout", () => {
    expect(
      canShowExternalInvoiceSentAction({
        needsInvoice: true,
        billingState: {
          lightweightBillingAllowed: false,
          usesInternalInvoicing: true,
          jobInvoiceCompleteProjection: false,
        },
      }),
    ).toBe(false);
  });

  it("hides the action after external billing completion tracking is already satisfied", () => {
    expect(
      canShowExternalInvoiceSentAction({
        needsInvoice: false,
        billingState: {
          lightweightBillingAllowed: true,
          usesInternalInvoicing: false,
          jobInvoiceCompleteProjection: true,
        },
      }),
    ).toBe(false);
  });
});

describe("sortCloseoutQueueJobs", () => {
  it("sorts contractors alphabetically and puts unnamed contractors after named contractors", () => {
    const contractorNames: Record<string, string | null> = {
      "job-a": "Zephyr HVAC",
      "job-b": "Alpha Air",
      "job-c": null,
      "job-d": "alpha air",
    };

    const rows = sortCloseoutQueueJobs(
      [
        { id: "job-a", created_at: "2026-05-20T12:00:00Z" },
        { id: "job-b", created_at: "2026-05-20T11:00:00Z" },
        { id: "job-c", created_at: "2026-05-20T10:00:00Z" },
        { id: "job-d", created_at: "2026-05-20T09:00:00Z" },
      ],
      "contractor",
      (job) => contractorNames[job.id ?? ""] ?? null,
      (job) => job.created_at,
      (job) => job.id,
    );

    expect(rows.map((row) => row.id)).toEqual(["job-b", "job-d", "job-a", "job-c"]);
  });

  it("keeps newest and oldest sorting deterministic", () => {
    const rows = [
      { id: "job-a", created_at: "2026-05-20T09:00:00Z" },
      { id: "job-b", created_at: "2026-05-20T11:00:00Z" },
      { id: "job-c", created_at: "2026-05-20T10:00:00Z" },
    ];

    expect(
      sortCloseoutQueueJobs(rows, "newest", () => null, (job) => job.created_at, (job) => job.id).map((row) => row.id),
    ).toEqual([
      "job-b",
      "job-c",
      "job-a",
    ]);
    expect(
      sortCloseoutQueueJobs(rows, "oldest", () => null, (job) => job.created_at, (job) => job.id).map((row) => row.id),
    ).toEqual([
      "job-a",
      "job-c",
      "job-b",
    ]);
  });
});
