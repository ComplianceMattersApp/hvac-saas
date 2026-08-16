import { describe, expect, it } from "vitest";
import {
  OPS_WORKSPACE_QUEUE_DEFINITIONS,
  buildOpsWorkspaceTabs,
  opsWorkspaceQueueHref,
  resolveOpsWorkspaceQueueKey,
  isContractorIntakeQueueAvailableForProductMode,
  resolveEffectiveOpsBoardBucketFilter,
  resolveVisibleOpsWorkspaceQueueKeys,
} from "@/lib/ops/ops-workspace-queues";

describe("Ops workspace queue product-mode gating", () => {
  it("keeps every bucket mapped to one canonical queue definition", () => {
    const definitions = Object.values(OPS_WORKSPACE_QUEUE_DEFINITIONS);

    expect(new Set(definitions.map((item) => item.key)).size).toBe(definitions.length);
    expect(new Set(definitions.map((item) => item.bucket)).size).toBe(definitions.length);
    for (const definition of definitions) {
      expect(resolveOpsWorkspaceQueueKey(definition.bucket)).toBe(definition.key);
      expect(definition.label).not.toBe("");
      expect(definition.mobileLabel).not.toBe("");
    }
  });

  it("builds queue tabs from canonical labels, counts, gates, and destinations", () => {
    const tabs = buildOpsWorkspaceTabs({
      counts: {
        need_to_schedule: 2,
        field_work: 3,
        without_tech: 4,
        waiting: 5,
        exceptions: 6,
        closeout: 7,
        follow_ups: 8,
        contractor_intake: 9,
        permits: 10,
        updates: 11,
      },
      contractorScopeFilter: "contractor-1,contractor-2",
      contractorIntakeQueueAvailable: true,
      permitRequestsSchemaAvailable: true,
    });

    expect(tabs.map((tab) => [tab.key, tab.label, tab.count])).toEqual([
      ["need_to_schedule", "Needs Scheduling", 2],
      ["field_work", "Field Work", 3],
      ["without_tech", "Needs Assignment", 4],
      ["waiting", "Waiting / Pending Info", 5],
      ["exceptions", "Exceptions", 6],
      ["closeout", "Closeout & Review", 7],
      ["follow_ups", "Follow Ups", 8],
      ["contractor_intake", "Contractor Intake", 9],
      ["permits", "Permits", 10],
      ["updates", "Updates", 11],
    ]);
    expect(tabs.find((tab) => tab.key === "waiting")?.href).toBe(
      "/ops?bucket=waiting&contractor=contractor-1%2Ccontractor-2#ops-workspace",
    );
    expect(tabs.find((tab) => tab.key === "need_to_schedule")?.href).toBe(
      "/ops/call-list?contractor=contractor-1%2Ccontractor-2",
    );
  });

  it("omits unavailable optional tabs and normalizes invalid counts", () => {
    const tabs = buildOpsWorkspaceTabs({
      counts: { waiting: -2, exceptions: Number.NaN },
      contractorIntakeQueueAvailable: false,
      permitRequestsSchemaAvailable: false,
    });

    expect(tabs.some((tab) => tab.key === "contractor_intake")).toBe(false);
    expect(tabs.some((tab) => tab.key === "permits")).toBe(false);
    expect(tabs.find((tab) => tab.key === "waiting")?.count).toBe(0);
    expect(tabs.find((tab) => tab.key === "exceptions")?.count).toBe(0);
  });

  it("builds stable queue URLs with optional contractor and sort filters", () => {
    expect(opsWorkspaceQueueHref("exceptions")).toBe(
      "/ops?bucket=exceptions#ops-workspace",
    );
    expect(opsWorkspaceQueueHref("exceptions", {
      contractor: "contractor-1,contractor-2",
      sort: "newest",
    })).toBe(
      "/ops?bucket=exceptions&contractor=contractor-1%2Ccontractor-2&sort=newest#ops-workspace",
    );
    expect(opsWorkspaceQueueHref("exceptions", { sort: "oldest" })).toBe(
      "/ops?bucket=exceptions#ops-workspace",
    );
  });

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

  it("preserves Needs Assignment as a selectable board bucket", () => {
    expect(
      resolveEffectiveOpsBoardBucketFilter({
        requestedBucket: "without_tech",
        productMode: "hvac_service",
        permitRequestsSchemaAvailable: false,
      }),
    ).toBe("without_tech");
  });
});
