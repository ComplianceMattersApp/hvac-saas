import { describe, expect, it } from "vitest";

import {
  buildOpsBoardReasonOptions,
  filterOpsBoardRowsByReason,
  getOpsBoardReasonLabel,
  normalizeOpsBoardReason,
} from "@/lib/ops/ops-board-reasons";

describe("Operations Board reason mapping", () => {
  it("normalizes only supported reason keys", () => {
    expect(normalizeOpsBoardReason("needs_invoice")).toBe("needs_invoice");
    expect(normalizeOpsBoardReason("ops_status")).toBeNull();
    expect(normalizeOpsBoardReason("")).toBeNull();
  });

  it("maps closeout invoice and cert blockers with combined blocker winning", () => {
    expect(
      getOpsBoardReasonLabel({
        job_type: "ecc",
        ops_status: "paperwork_required",
        field_complete: true,
        invoice_complete: false,
        certs_complete: false,
      })?.label,
    ).toBe("Needs invoice and certs");

    expect(
      getOpsBoardReasonLabel({
        job_type: "service",
        ops_status: "invoice_required",
        field_complete: true,
        invoice_complete: false,
        certs_complete: true,
      })?.label,
    ).toBe("Needs invoice");

    expect(
      getOpsBoardReasonLabel({
        job_type: "ecc",
        ops_status: "paperwork_required",
        field_complete: true,
        invoice_complete: true,
        certs_complete: false,
      })?.label,
    ).toBe("Needs certs");
  });

  it("maps exception and waiting reasons from existing status and reason text", () => {
    expect(getOpsBoardReasonLabel({ job_type: "ecc", ops_status: "failed" })?.label).toBe("Failed ECC test");
    expect(getOpsBoardReasonLabel({ ops_status: "retest_needed" })?.label).toBe("Needs retest");
    expect(getOpsBoardReasonLabel({ ops_status: "pending_office_review" })?.label).toBe("Needs correction");
    expect(getOpsBoardReasonLabel({ ops_status: "problem", pending_info_reason: "Permit missing" })?.label).toBe("Needs permit");
    expect(getOpsBoardReasonLabel({ ops_status: "pending_info", pending_info_reason: "Materials Needed: capacitor" })?.label).toBe("Waiting on parts");
    expect(getOpsBoardReasonLabel({ ops_status: "pending_info", pending_info_reason: "Need permit number" })?.label).toBe("Waiting on permit");
    expect(getOpsBoardReasonLabel({ ops_status: "on_hold", on_hold_reason: "Customer asked to pause" })?.label).toBe("On hold");
  });

  it("uses closeout blockers as the primary reason in Closeout context without losing permit derivation elsewhere", () => {
    const row = {
      id: "permit-missing-needs-invoice",
      job_type: "ecc",
      ops_status: "pending_info",
      pending_info_reason: "Permit Missing",
      field_complete: true,
      invoice_complete: false,
      certs_complete: true,
    };

    expect(getOpsBoardReasonLabel(row)?.label).toBe("Waiting on permit");
    expect(getOpsBoardReasonLabel(row, { queueKey: "closeout" })?.label).toBe("Needs invoice");
    expect(filterOpsBoardRowsByReason([row], "needs_invoice", { queueKey: "closeout" }).map((item) => item.id)).toEqual([
      "permit-missing-needs-invoice",
    ]);
    expect(filterOpsBoardRowsByReason([row], "waiting_on_permit").map((item) => item.id)).toEqual([
      "permit-missing-needs-invoice",
    ]);
  });

  it("does not map generic blocked rows to closeout reasons in Closeout context", () => {
    const rows = [
      {
        id: "approval",
        job_type: "service",
        ops_status: "pending_info",
        pending_info_reason: "Approval Needed: Customer must approve",
        field_complete: true,
        invoice_complete: false,
      },
      {
        id: "hold",
        job_type: "service",
        ops_status: "on_hold",
        on_hold_reason: "Status interrupt state test",
        field_complete: true,
        invoice_complete: false,
      },
    ];

    expect(getOpsBoardReasonLabel(rows[0], { queueKey: "closeout" })?.label).toBe("Waiting on approval");
    expect(getOpsBoardReasonLabel(rows[1], { queueKey: "closeout" })?.label).toBe("On hold");
    expect(filterOpsBoardRowsByReason(rows, "needs_invoice", { queueKey: "closeout" })).toEqual([]);
  });

  it("builds Closeout reason options from contextual closeout work instead of permit text", () => {
    const options = buildOpsBoardReasonOptions(
      [
        {
          job_type: "ecc",
          ops_status: "pending_info",
          pending_info_reason: "Permit Missing",
          field_complete: true,
          invoice_complete: false,
          certs_complete: true,
        },
      ],
      { queueKey: "closeout" },
    );

    expect(options.map((option) => option.label)).toEqual(["Needs invoice"]);
  });

  it("keeps stronger failed ECC reasons above generic hold text", () => {
    const row = {
      id: "failed-ecc-on-hold-text",
      job_type: "ecc",
      ops_status: "failed",
      on_hold_reason: "Customer asked to pause",
    };

    expect(getOpsBoardReasonLabel(row)?.label).toBe("Failed ECC test");
    expect(filterOpsBoardRowsByReason([row], "failed_ecc_test").map((item) => item.id)).toEqual(["failed-ecc-on-hold-text"]);
    expect(filterOpsBoardRowsByReason([row], "on_hold")).toEqual([]);
  });

  it("builds friendly reason options from loaded rows without raw enum labels", () => {
    const options = buildOpsBoardReasonOptions([
      { ops_status: "need_to_schedule" },
      { ops_status: "pending_info", pending_info_reason: "Waiting on customer approval" },
      { job_type: "ecc", ops_status: "failed" },
      { job_type: "service", ops_status: "invoice_required", invoice_complete: false },
    ]);

    expect(options.map((option) => option.label)).toEqual([
      "Needs invoice",
      "Failed ECC test",
      "Waiting on approval",
      "Needs scheduling",
    ]);
    expect(options.map((option) => option.label)).not.toContain("ops_status");
    expect(options.map((option) => option.label)).not.toContain("invoice_required");
  });

  it("filters loaded rows by selected reason", () => {
    const rows = [
      { id: "invoice", job_type: "service", ops_status: "invoice_required", invoice_complete: false },
      { id: "certs", job_type: "ecc", ops_status: "paperwork_required", invoice_complete: true, certs_complete: false },
      { id: "both", job_type: "ecc", ops_status: "paperwork_required", invoice_complete: false, certs_complete: false },
      { id: "parts", ops_status: "pending_info", pending_info_reason: "Need parts" },
    ];

    expect(filterOpsBoardRowsByReason(rows, "needs_invoice").map((row) => row.id)).toEqual(["invoice"]);
    expect(filterOpsBoardRowsByReason(rows, "needs_certs").map((row) => row.id)).toEqual(["certs"]);
    expect(filterOpsBoardRowsByReason(rows, "needs_invoice_and_certs").map((row) => row.id)).toEqual(["both"]);
    expect(filterOpsBoardRowsByReason(rows, "waiting_on_parts").map((row) => row.id)).toEqual(["parts"]);
  });

  it("keeps on hold rows out of failed ECC filters", () => {
    const rows = [
      { id: "hold", job_type: "ecc", ops_status: "on_hold", on_hold_reason: "Failed test on hold" },
      { id: "failed", job_type: "ecc", ops_status: "failed", on_hold_reason: "On hold note remains" },
    ];

    expect(getOpsBoardReasonLabel(rows[0])?.label).toBe("On hold");
    expect(getOpsBoardReasonLabel(rows[1])?.label).toBe("Failed ECC test");
    expect(filterOpsBoardRowsByReason(rows, "failed_ecc_test").map((row) => row.id)).toEqual(["failed"]);
  });
});
