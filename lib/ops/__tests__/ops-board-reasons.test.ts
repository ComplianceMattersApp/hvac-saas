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

  it("builds friendly reason options from loaded rows without raw enum labels", () => {
    const options = buildOpsBoardReasonOptions([
      { ops_status: "need_to_schedule" },
      { ops_status: "pending_info", pending_info_reason: "Waiting on customer approval" },
      { job_type: "ecc", ops_status: "failed" },
      { job_type: "service", ops_status: "invoice_required", invoice_complete: false },
    ]);

    expect(options.map((option) => option.label)).toEqual([
      "Needs scheduling",
      "Waiting on approval",
      "Failed ECC test",
      "Needs invoice",
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
});
