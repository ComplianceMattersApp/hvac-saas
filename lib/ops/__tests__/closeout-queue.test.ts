import { describe, expect, it } from "vitest";

import { listCloseoutQueueJobs } from "@/lib/ops/closeout-queue";

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
});
