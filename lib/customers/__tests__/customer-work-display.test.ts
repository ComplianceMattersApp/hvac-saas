import { describe, expect, it } from "vitest";
import {
  deriveCustomerWorkCaseRollup,
  formatCustomerWorkAddress,
  formatCustomerWorkFailureReason,
  formatCustomerWorkPersonName,
} from "@/lib/customers/customer-work-display";

describe("customer work display helpers", () => {
  it("shows a single closed child job case as Closed", () => {
    expect(deriveCustomerWorkCaseRollup([{ status: "completed", ops_status: "closed" }]).label).toBe("Closed");
  });

  it("does not show Open for a single cancelled child job case", () => {
    expect(deriveCustomerWorkCaseRollup([{ status: "cancelled", ops_status: "need_to_schedule" }]).label).toBe(
      "Cancelled",
    );
  });

  it("keeps a case Open when any child job is active", () => {
    expect(
      deriveCustomerWorkCaseRollup([
        { status: "completed", ops_status: "closed" },
        { status: "open", ops_status: "scheduled" },
      ]).label,
    ).toBe("Open");
  });

  it("uses Needs Review when active work has unresolved failed/retest/waiting state", () => {
    expect(deriveCustomerWorkCaseRollup([{ status: "open", ops_status: "failed" }]).label).toBe("Needs Review");
    expect(deriveCustomerWorkCaseRollup([{ status: "open", ops_status: "retest_needed" }]).label).toBe(
      "Needs Review",
    );
    expect(deriveCustomerWorkCaseRollup([{ status: "open", ops_status: "pending_info" }]).label).toBe(
      "Needs Review",
    );
  });

  it("normalizes all-uppercase person and city values for display only", () => {
    expect(formatCustomerWorkPersonName("SHANIE GEORGE")).toBe("Shanie George");
    expect(formatCustomerWorkAddress({ job_address: "8118 Montgomery Ave", city: "STOCKTON" })).toBe(
      "8118 Montgomery Ave, Stockton",
    );
  });

  it("preserves already mixed-case names while handling punctuation", () => {
    expect(formatCustomerWorkPersonName("Eddie Castellanos")).toBe("Eddie Castellanos");
    expect(formatCustomerWorkPersonName("O'CONNOR MCDONALD")).toBe("O'Connor McDonald");
  });

  it("shows a specific failed reason when a safe loaded reason is present", () => {
    expect(
      formatCustomerWorkFailureReason({
        status: "open",
        ops_status: "failed",
        service_visit_reason: "Duct Leakage",
      }),
    ).toBe("Failed: Duct Leakage");
  });

  it("falls back to a generic failed label without inventing a reason", () => {
    expect(formatCustomerWorkFailureReason({ status: "open", ops_status: "failed" })).toBe("Failed");
  });
});
