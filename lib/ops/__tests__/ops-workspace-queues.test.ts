import { describe, expect, it } from "vitest";
import {
  isContractorIntakeQueueAvailableForProductMode,
  resolveEffectiveOpsBoardBucketFilter,
  resolveVisibleOpsWorkspaceQueueKeys,
} from "@/lib/ops/ops-workspace-queues";

describe("Ops workspace queue product-mode gating", () => {
  it("keeps the Intake chip visible for ECC/HERS and Hybrid modes", () => {
    expect(isContractorIntakeQueueAvailableForProductMode("ecc_hers")).toBe(true);
    expect(isContractorIntakeQueueAvailableForProductMode("hybrid")).toBe(true);

    expect(
      resolveVisibleOpsWorkspaceQueueKeys({
        productMode: "ecc_hers",
        permitRequestsSchemaAvailable: true,
      }),
    ).toContain("contractor_intake");
  });

  it("hides the Intake chip for Service/HVAC mode", () => {
    expect(isContractorIntakeQueueAvailableForProductMode("hvac_service")).toBe(false);
    expect(
      resolveVisibleOpsWorkspaceQueueKeys({
        productMode: "hvac_service",
        permitRequestsSchemaAvailable: true,
      }),
    ).not.toContain("contractor_intake");
  });

  it("hides the Intake chip for Cleaning mode", () => {
    expect(isContractorIntakeQueueAvailableForProductMode("cleaning_services")).toBe(false);
    expect(
      resolveVisibleOpsWorkspaceQueueKeys({
        productMode: "cleaning_services",
        permitRequestsSchemaAvailable: true,
      }),
    ).not.toContain("contractor_intake");
  });

  it("falls back to Needs Scheduling when non-ECC modes request Intake", () => {
    expect(
      resolveEffectiveOpsBoardBucketFilter({
        requestedBucket: "contractor_intake",
        productMode: "hvac_service",
        permitRequestsSchemaAvailable: true,
      }),
    ).toBe("pending");

    expect(
      resolveEffectiveOpsBoardBucketFilter({
        requestedBucket: "contractor_intake",
        productMode: "cleaning_services",
        permitRequestsSchemaAvailable: true,
      }),
    ).toBe("pending");
  });

  it("preserves Intake selection for ECC-capable modes", () => {
    expect(
      resolveEffectiveOpsBoardBucketFilter({
        requestedBucket: "contractor_intake",
        productMode: "ecc_hers",
        permitRequestsSchemaAvailable: true,
      }),
    ).toBe("contractor_intake");
  });

  it("keeps follow-up reminders visible across product modes", () => {
    expect(
      resolveVisibleOpsWorkspaceQueueKeys({
        productMode: "ecc_hers",
        permitRequestsSchemaAvailable: true,
      }),
    ).toContain("follow_ups");

    expect(
      resolveEffectiveOpsBoardBucketFilter({
        requestedBucket: "follow_ups",
        productMode: "hvac_service",
        permitRequestsSchemaAvailable: false,
      }),
    ).toBe("follow_ups");
  });
});
