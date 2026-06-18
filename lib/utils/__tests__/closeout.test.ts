import { describe, expect, it } from "vitest";
import {
  getCloseoutNeeds,
  getCloseoutQueueNextStepLabel,
  getJobDetailCloseoutReadinessMessage,
  isInCloseoutQueue,
} from "@/lib/utils/closeout";

const failedEccJob = {
  field_complete: true,
  job_type: "ecc",
  ops_status: "failed",
  certs_complete: false,
};

describe("closeout queue projection", () => {
  it("keeps failed ECC jobs out of the closeout queue unless they have a closeout status", () => {
    const job = {
      ...failedEccJob,
      invoice_complete: false,
    };

    expect(getCloseoutNeeds(job)).toMatchObject({
      needsInvoice: true,
      needsCerts: false,
      isFailureFlow: true,
    });
    expect(isInCloseoutQueue(job)).toBe(false);
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

  it("keeps generic pending info jobs out of closeout when invoice remains pending", () => {
    const job = {
      field_complete: true,
      job_type: "ecc",
      ops_status: "pending_info",
      pending_info_reason: "Approval Needed: customer approval required",
      invoice_complete: false,
      certs_complete: true,
    };

    expect(getCloseoutNeeds(job)).toMatchObject({
      needsInvoice: true,
      needsCerts: false,
      isBlockedForCloseout: true,
    });
    expect(isInCloseoutQueue(job)).toBe(false);
  });

  it("keeps permit-missing jobs in closeout when invoice remains pending", () => {
    const job = {
      field_complete: true,
      job_type: "ecc",
      ops_status: "pending_info",
      pending_info_reason: "Permit Missing",
      invoice_complete: false,
      certs_complete: true,
    };

    expect(isInCloseoutQueue(job)).toBe(true);
  });

  it("keeps permit-missing on-hold jobs in closeout when invoice remains pending", () => {
    expect(
      isInCloseoutQueue({
        field_complete: true,
        job_type: "ecc",
        ops_status: "on_hold",
        on_hold_reason: "Permit required before closeout",
        invoice_complete: false,
        certs_complete: true,
      }),
    ).toBe(true);
  });

  it("keeps permit-missing jobs out of closeout when no closeout blocker remains", () => {
    expect(
      isInCloseoutQueue({
        field_complete: true,
        job_type: "ecc",
        ops_status: "pending_info",
        pending_info_reason: "Permit Missing",
        invoice_complete: true,
        certs_complete: true,
      }),
    ).toBe(false);
  });

  it("keeps generic on-hold, need-to-schedule, and retest rows out of closeout", () => {
    expect(
      isInCloseoutQueue({
        field_complete: true,
        job_type: "service",
        ops_status: "on_hold",
        on_hold_reason: "Status interrupt state test",
        invoice_complete: false,
      }),
    ).toBe(false);

    expect(
      isInCloseoutQueue({
        field_complete: true,
        job_type: "service",
        ops_status: "need_to_schedule",
        invoice_complete: false,
      }),
    ).toBe(false);

    expect(
      isInCloseoutQueue({
        field_complete: true,
        job_type: "ecc",
        ops_status: "retest_needed",
        invoice_complete: false,
        certs_complete: false,
      }),
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

  it("uses retest/review closeout banner copy for failed ECC after billing is complete", () => {
    const message = getJobDetailCloseoutReadinessMessage({
      field_complete: true,
      job_type: "ecc",
      ops_status: "failed",
      invoice_complete: true,
      certs_complete: false,
    });

    expect(message).toBe("Job needs retest or review before closeout.");
    expect(message).not.toContain("ready for closeout");
  });

  it("keeps billing in the closeout banner copy for failed ECC when invoice remains pending", () => {
    expect(
      getJobDetailCloseoutReadinessMessage({
        field_complete: true,
        job_type: "ecc",
        ops_status: "failed",
        invoice_complete: false,
        certs_complete: false,
      }),
    ).toBe("Complete billing; job needs retest or review.");
  });

  it("uses billing-only closeout banner copy for passed ECC with certs complete", () => {
    expect(
      getJobDetailCloseoutReadinessMessage({
        field_complete: true,
        job_type: "ecc",
        ops_status: "invoice_required",
        invoice_complete: false,
        certs_complete: true,
      }),
    ).toBe("Complete billing to close this job.");
  });

  it("uses cert-only closeout banner copy for passed ECC with billing complete", () => {
    expect(
      getJobDetailCloseoutReadinessMessage({
        field_complete: true,
        job_type: "ecc",
        ops_status: "paperwork_required",
        invoice_complete: true,
        certs_complete: false,
      }),
    ).toBe("Send certs to close this job.");
  });

  it("uses combined billing and cert closeout banner copy for passed ECC with both pending", () => {
    expect(
      getJobDetailCloseoutReadinessMessage({
        field_complete: true,
        job_type: "ecc",
        ops_status: "paperwork_required",
        invoice_complete: false,
        certs_complete: false,
      }),
    ).toBe("Send certs and complete billing to close this job.");
  });

  it("uses complete closeout banner copy for passed ECC when invoice and certs are complete", () => {
    expect(
      getJobDetailCloseoutReadinessMessage({
        field_complete: true,
        job_type: "ecc",
        ops_status: "closed",
        invoice_complete: true,
        certs_complete: true,
      }),
    ).toBe("Invoice and certs are complete.");
  });
});
