import { describe, expect, it } from "vitest";
import {
  getCloseoutNeeds,
  getCloseoutQueueNextStepLabel,
  isInCloseoutQueue,
} from "@/lib/utils/closeout";

const failedEccJob = {
  field_complete: true,
  job_type: "ecc",
  ops_status: "failed",
  certs_complete: false,
};

describe("closeout queue projection", () => {
  it("keeps failed ECC jobs with unsent invoices in the closeout queue", () => {
    const job = {
      ...failedEccJob,
      invoice_complete: false,
    };

    expect(getCloseoutNeeds(job)).toMatchObject({
      needsInvoice: true,
      needsCerts: false,
      isFailureFlow: true,
    });
    expect(isInCloseoutQueue(job)).toBe(true);
  });

  it("removes failed ECC jobs from the closeout queue after invoice is sent", () => {
    const job = {
      ...failedEccJob,
      invoice_complete: true,
    };

    expect(getCloseoutNeeds(job)).toMatchObject({
      needsInvoice: false,
      needsCerts: false,
      isFailureFlow: true,
    });
    expect(isInCloseoutQueue(job)).toBe(false);
  });

  it("does not treat failed ECC jobs as needing cert closeout while failure is unresolved", () => {
    expect(getCloseoutNeeds({ ...failedEccJob, invoice_complete: true }).needsCerts).toBe(false);
  });

  it("keeps passed ECC closeout behavior unchanged", () => {
    expect(
      isInCloseoutQueue({
        field_complete: true,
        job_type: "ecc",
        ops_status: "paperwork_required",
        certs_complete: false,
        invoice_complete: false,
      })
    ).toBe(true);

    expect(
      isInCloseoutQueue({
        field_complete: true,
        job_type: "ecc",
        ops_status: "closed",
        certs_complete: true,
        invoice_complete: true,
      })
    ).toBe(false);
  });

  it("preserves external billing completion tracking semantics through invoice_complete", () => {
    expect(
      isInCloseoutQueue({
        field_complete: true,
        job_type: "service",
        ops_status: "invoice_required",
        invoice_complete: false,
      })
    ).toBe(true);

    expect(
      isInCloseoutQueue({
        field_complete: true,
        job_type: "service",
        ops_status: "invoice_required",
        invoice_complete: true,
      })
    ).toBe(false);
  });

  it("keeps paperwork blocker after external billing completion when ECC certs are still incomplete", () => {
    const job = {
      field_complete: true,
      job_type: "ecc",
      ops_status: "paperwork_required",
      invoice_complete: true,
      certs_complete: false,
    };

    expect(getCloseoutNeeds(job)).toMatchObject({
      needsInvoice: false,
      needsCerts: true,
    });
    expect(isInCloseoutQueue(job)).toBe(true);
  });

  it("uses invoice and send certs copy when both blockers remain", () => {
    expect(
      getCloseoutQueueNextStepLabel({
        field_complete: true,
        job_type: "ecc",
        ops_status: "paperwork_required",
        invoice_complete: false,
        certs_complete: false,
      }),
    ).toBe("Invoice and send certs");
  });

  it("uses send certs copy when only paperwork remains", () => {
    expect(
      getCloseoutQueueNextStepLabel({
        field_complete: true,
        job_type: "ecc",
        ops_status: "paperwork_required",
        invoice_complete: true,
        certs_complete: false,
      }),
    ).toBe("Send certs");
  });

  it("uses invoice copy when only invoice remains", () => {
    expect(
      getCloseoutQueueNextStepLabel({
        field_complete: true,
        job_type: "service",
        ops_status: "invoice_required",
        invoice_complete: false,
      }),
    ).toBe("Invoice");
  });
});
