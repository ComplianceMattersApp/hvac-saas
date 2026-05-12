import { describe, expect, it } from "vitest";
import {
  buildPlatformOwnerDashboardModel,
  formatBillingModeLabel,
  formatOwnerConsoleDate,
  formatProductModeLabel,
  filterPlatformOwnerDashboardRows,
  isHiddenTestAccountRow,
  isPlatformInternalAccountRow,
  parseHiddenAccountEmails,
  parseInternalAccountEmails,
  summarizePlatformOwnerDashboardRows,
} from "@/lib/business/platform-owner-dashboard";

describe("platform owner dashboard model", () => {
  it("aggregates user counts per account and includes product/billing/entitlement fields", () => {
    const model = buildPlatformOwnerDashboardModel({
      businessProfiles: [
        {
          account_owner_user_id: "owner-1",
          display_name: "Acme Service",
          billing_mode: "self_serve",
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-02T00:00:00.000Z",
        },
      ],
      accountSettings: [
        {
          account_owner_user_id: "owner-1",
          product_mode: "hvac_service",
        },
      ],
      entitlements: [
        {
          account_owner_user_id: "owner-1",
          plan_key: "starter",
          entitlement_status: "trial",
          trial_ends_at: "2026-05-20T00:00:00.000Z",
        },
      ],
      internalUsers: [
        {
          account_owner_user_id: "owner-1",
          user_id: "u1",
          is_active: true,
        },
        {
          account_owner_user_id: "owner-1",
          user_id: "u2",
          is_active: false,
        },
      ],
      ownerProfiles: [
        {
          id: "owner-1",
          email: "owner@example.com",
          full_name: "Owner User",
        },
      ],
      ownerAuthUsers: [
        {
          id: "owner-1",
          email: "owner@example.com",
          invited_at: "2026-05-01T01:00:00.000Z",
          email_confirmed_at: null,
          confirmed_at: null,
          user_metadata: null,
        },
      ],
    });

    expect(model.summary.totalAccounts).toBe(1);
    expect(model.summary.hvacServiceAccounts).toBe(1);
    expect(model.summary.totalInternalUsers).toBe(2);
    expect(model.summary.activeInternalUsers).toBe(1);

    expect(model.rows[0]).toMatchObject({
      company: "Acme Service",
      ownerEmail: "owner@example.com",
      ownerName: "Owner User",
      accountOwnerUserId: "owner-1",
      productMode: "hvac_service",
      billingMode: "self_serve",
      planKey: "starter",
      entitlementStatus: "trial",
      trialEnd: "2026-05-20T00:00:00.000Z",
      activeUsers: 1,
      totalUsers: 2,
      setupInviteState: "invite_pending",
    });
  });

  it("does not expose raw stripe identifiers", () => {
    const model = buildPlatformOwnerDashboardModel({
      businessProfiles: [
        {
          account_owner_user_id: "owner-1",
          display_name: "Acme Service",
          billing_mode: "self_serve",
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-02T00:00:00.000Z",
        },
      ],
      accountSettings: [],
      entitlements: [
        {
          account_owner_user_id: "owner-1",
          plan_key: "starter",
          entitlement_status: "active",
          trial_ends_at: null,
          // Intentionally ignored by model: stripe_customer_id, stripe_subscription_id
        } as any,
      ],
      internalUsers: [],
      ownerProfiles: [],
      ownerAuthUsers: [],
    });

    expect(JSON.stringify(model)).not.toContain("stripe_customer_id");
    expect(JSON.stringify(model)).not.toContain("stripe_subscription_id");
    expect(JSON.stringify(model)).not.toContain("cus_");
    expect(JSON.stringify(model)).not.toContain("sub_");
  });

  it("filters current vs inactive vs all account views", () => {
    const model = buildPlatformOwnerDashboardModel({
      businessProfiles: [
        {
          account_owner_user_id: "a1",
          display_name: "Current Account",
          billing_mode: "self_serve",
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
        {
          account_owner_user_id: "a2",
          display_name: "Cancelled Account",
          billing_mode: "self_serve",
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
      ],
      accountSettings: [],
      entitlements: [
        {
          account_owner_user_id: "a1",
          plan_key: "starter",
          entitlement_status: "trial",
          trial_ends_at: null,
        },
        {
          account_owner_user_id: "a2",
          plan_key: "starter",
          entitlement_status: "cancelled",
          trial_ends_at: null,
        },
      ],
      internalUsers: [],
      ownerProfiles: [],
      ownerAuthUsers: [],
    });

    const currentRows = filterPlatformOwnerDashboardRows({
      rows: model.rows,
      view: "current",
    });
    const inactiveRows = filterPlatformOwnerDashboardRows({
      rows: model.rows,
      view: "inactive",
    });
    const allRows = filterPlatformOwnerDashboardRows({ rows: model.rows, view: "all" });

    expect(currentRows.map((row) => row.accountOwnerUserId)).toEqual(["a1"]);
    expect(inactiveRows.map((row) => row.accountOwnerUserId)).toEqual(["a2"]);
    expect(allRows).toHaveLength(2);
  });

  it("keeps current-focused summary counts and tracks hidden inactive accounts", () => {
    const model = buildPlatformOwnerDashboardModel({
      businessProfiles: [
        {
          account_owner_user_id: "a1",
          display_name: "Current Account",
          billing_mode: "self_serve",
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
        {
          account_owner_user_id: "a2",
          display_name: "Cancelled Account",
          billing_mode: "self_serve",
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
      ],
      accountSettings: [
        {
          account_owner_user_id: "a1",
          product_mode: "hvac_service",
        },
        {
          account_owner_user_id: "a2",
          product_mode: "ecc_hers",
        },
      ],
      entitlements: [
        {
          account_owner_user_id: "a1",
          plan_key: "starter",
          entitlement_status: "active",
          trial_ends_at: null,
        },
        {
          account_owner_user_id: "a2",
          plan_key: "starter",
          entitlement_status: "cancelled",
          trial_ends_at: null,
        },
      ],
      internalUsers: [
        {
          account_owner_user_id: "a1",
          user_id: "u1",
          is_active: true,
        },
        {
          account_owner_user_id: "a2",
          user_id: "u2",
          is_active: false,
        },
      ],
      ownerProfiles: [],
      ownerAuthUsers: [],
    });

    const currentRows = filterPlatformOwnerDashboardRows({
      rows: model.rows,
      view: "current",
    });
    const summary = summarizePlatformOwnerDashboardRows({
      rows: currentRows,
      allRows: model.rows,
    });

    expect(summary.displayedAccounts).toBe(1);
    expect(summary.displayedActiveAccounts).toBe(1);
    expect(summary.displayedHvacServiceAccounts).toBe(1);
    expect(summary.displayedEccAccounts).toBe(0);
    expect(summary.hiddenInactiveCancelledAccounts).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Hidden test-account helpers
// ---------------------------------------------------------------------------

describe("parseHiddenAccountEmails", () => {
  it("returns empty set when env var is absent", () => {
    expect(parseHiddenAccountEmails({}).size).toBe(0);
  });

  it("returns empty set when env var is an empty string", () => {
    expect(parseHiddenAccountEmails({ PLATFORM_OWNER_HIDDEN_ACCOUNT_EMAILS: "" }).size).toBe(0);
    expect(parseHiddenAccountEmails({ PLATFORM_OWNER_HIDDEN_ACCOUNT_EMAILS: "  " }).size).toBe(0);
  });

  it("parses a single email", () => {
    const result = parseHiddenAccountEmails({
      PLATFORM_OWNER_HIDDEN_ACCOUNT_EMAILS: "test@example.com",
    });
    expect(result.has("test@example.com")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("parses multiple comma-separated emails and lowercases/trims them", () => {
    const result = parseHiddenAccountEmails({
      PLATFORM_OWNER_HIDDEN_ACCOUNT_EMAILS: "  Test@Example.com , ANOTHER@example.com  ",
    });
    expect(result.has("test@example.com")).toBe(true);
    expect(result.has("another@example.com")).toBe(true);
    expect(result.size).toBe(2);
  });
});

describe("parseInternalAccountEmails", () => {
  it("returns empty set when env var is absent", () => {
    expect(parseInternalAccountEmails({}).size).toBe(0);
  });

  it("parses comma-separated values case-insensitively", () => {
    const result = parseInternalAccountEmails({
      PLATFORM_OWNER_INTERNAL_ACCOUNT_EMAILS: " Eddie@Example.com ,SECOND@example.com ",
    });
    expect(result.has("eddie@example.com")).toBe(true);
    expect(result.has("second@example.com")).toBe(true);
    expect(result.size).toBe(2);
  });
});

describe("isHiddenTestAccountRow", () => {
  const makeRow = (email: string | null) => ({
    company: "Co",
    ownerEmail: email,
    ownerName: null,
    accountOwnerUserId: "x",
    productMode: null,
    billingMode: null,
    planKey: null,
    entitlementStatus: null,
    trialEnd: null,
    activeUsers: 0,
    totalUsers: 0,
    createdAt: null,
    updatedAt: null,
    setupInviteState: "unknown" as const,
  });

  it("returns false when hiddenEmails is empty", () => {
    expect(isHiddenTestAccountRow(makeRow("test@example.com"), new Set())).toBe(false);
  });

  it("returns true for an exact match", () => {
    expect(
      isHiddenTestAccountRow(makeRow("test@example.com"), new Set(["test@example.com"])),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(
      isHiddenTestAccountRow(makeRow("TEST@EXAMPLE.COM"), new Set(["test@example.com"])),
    ).toBe(true);
  });

  it("returns false when email is null", () => {
    expect(isHiddenTestAccountRow(makeRow(null), new Set(["test@example.com"]))).toBe(false);
  });
});

describe("isPlatformInternalAccountRow", () => {
  const makeRow = (email: string | null) => ({
    company: "Co",
    ownerEmail: email,
    ownerName: null,
    accountOwnerUserId: "x",
    productMode: null,
    billingMode: null,
    planKey: null,
    entitlementStatus: null,
    trialEnd: null,
    activeUsers: 0,
    totalUsers: 0,
    createdAt: null,
    updatedAt: null,
    setupInviteState: "unknown" as const,
  });

  it("matches case-insensitively", () => {
    expect(
      isPlatformInternalAccountRow(
        makeRow("OWNER@EXAMPLE.COM"),
        new Set(["owner@example.com"]),
      ),
    ).toBe(true);
  });

  it("returns false when email missing", () => {
    expect(isPlatformInternalAccountRow(makeRow(null), new Set(["owner@example.com"]))).toBe(false);
  });
});

describe("hidden account filter integration", () => {
  function buildTwoRows() {
    return buildPlatformOwnerDashboardModel({
      businessProfiles: [
        {
          account_owner_user_id: "real-1",
          display_name: "Real Company",
          billing_mode: "self_serve",
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
        {
          account_owner_user_id: "test-1",
          display_name: "Test Account",
          billing_mode: "self_serve",
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
      ],
      accountSettings: [],
      entitlements: [
        {
          account_owner_user_id: "real-1",
          plan_key: "starter",
          entitlement_status: "active",
          trial_ends_at: null,
        },
        {
          account_owner_user_id: "test-1",
          plan_key: "starter",
          entitlement_status: "active",
          trial_ends_at: null,
        },
      ],
      internalUsers: [],
      ownerProfiles: [
        { id: "real-1", email: "real@example.com", full_name: "Real Owner" },
        { id: "test-1", email: "test@internal.com", full_name: "Test Owner" },
      ],
      ownerAuthUsers: [],
    });
  }

  it("hides test account from current view when email is in hidden set", () => {
    const model = buildTwoRows();
    const hiddenEmails = new Set(["test@internal.com"]);
    const rows = filterPlatformOwnerDashboardRows({ rows: model.rows, view: "current", hiddenEmails });
    expect(rows.map((r) => r.accountOwnerUserId)).toEqual(["real-1"]);
  });

  it("shows only test account in hidden view", () => {
    const model = buildTwoRows();
    const hiddenEmails = new Set(["test@internal.com"]);
    const rows = filterPlatformOwnerDashboardRows({ rows: model.rows, view: "hidden", hiddenEmails });
    expect(rows.map((r) => r.accountOwnerUserId)).toEqual(["test-1"]);
  });

  it("all view includes all accounts regardless of hidden set", () => {
    const model = buildTwoRows();
    const hiddenEmails = new Set(["test@internal.com"]);
    const rows = filterPlatformOwnerDashboardRows({ rows: model.rows, view: "all", hiddenEmails });
    expect(rows).toHaveLength(2);
  });

  it("behavior unchanged when hiddenEmails is empty", () => {
    const model = buildTwoRows();
    const rows = filterPlatformOwnerDashboardRows({ rows: model.rows, view: "current" });
    expect(rows).toHaveLength(2);
  });

  it("excludes platform/internal accounts from current view", () => {
    const model = buildTwoRows();
    const internalEmails = new Set(["real@example.com"]);
    const rows = filterPlatformOwnerDashboardRows({
      rows: model.rows,
      view: "current",
      internalEmails,
    });
    expect(rows.map((r) => r.accountOwnerUserId)).toEqual(["test-1"]);
  });

  it("shows internal accounts in platform view", () => {
    const model = buildTwoRows();
    const internalEmails = new Set(["real@example.com"]);
    const rows = filterPlatformOwnerDashboardRows({
      rows: model.rows,
      view: "platform",
      internalEmails,
    });
    expect(rows.map((r) => r.accountOwnerUserId)).toEqual(["real-1"]);
  });

  it("summarize counts hiddenTestAccounts correctly", () => {
    const model = buildTwoRows();
    const hiddenEmails = new Set(["test@internal.com"]);
    const currentRows = filterPlatformOwnerDashboardRows({ rows: model.rows, view: "current", hiddenEmails });
    const summary = summarizePlatformOwnerDashboardRows({
      rows: currentRows,
      allRows: model.rows,
      hiddenEmails,
    });
    expect(summary.displayedAccounts).toBe(1);
    expect(summary.hiddenTestAccounts).toBe(1);
    // cancelled count should be 0 — neither is cancelled
    expect(summary.hiddenInactiveCancelledAccounts).toBe(0);
  });

  it("summary separates customer and platform/internal counts", () => {
    const model = buildTwoRows();
    const internalEmails = new Set(["real@example.com"]);
    const currentRows = filterPlatformOwnerDashboardRows({
      rows: model.rows,
      view: "all",
      internalEmails,
    });
    const summary = summarizePlatformOwnerDashboardRows({
      rows: currentRows,
      allRows: model.rows,
      internalEmails,
    });

    expect(summary.displayedAccounts).toBe(2);
    expect(summary.displayedCustomerAccounts).toBe(1);
    expect(summary.displayedPlatformInternalAccounts).toBe(1);
  });
});

describe("friendly display helpers", () => {
  const baseRow = {
    company: "Company",
    ownerEmail: "owner@example.com",
    ownerName: "Owner",
    accountOwnerUserId: "owner-1",
    productMode: null as any,
    billingMode: null,
    planKey: null,
    entitlementStatus: null,
    trialEnd: null,
    activeUsers: 0,
    totalUsers: 0,
    createdAt: null,
    updatedAt: null,
    setupInviteState: "unknown",
  };

  it("maps product mode labels", () => {
    expect(
      formatProductModeLabel({
        row: { ...baseRow, productMode: "hvac_service" },
      } as any),
    ).toBe("HVAC Service");
    expect(
      formatProductModeLabel({
        row: { ...baseRow, productMode: "ecc_hers" },
      } as any),
    ).toBe("ECC");
    expect(
      formatProductModeLabel({
        row: { ...baseRow, productMode: "hybrid" },
      } as any),
    ).toBe("Hybrid");
  });

  it("shows Platform / Internal for internal null product mode", () => {
    const row = { ...baseRow, ownerEmail: "internal@example.com", productMode: null } as any;
    expect(
      formatProductModeLabel({ row, internalEmails: new Set(["internal@example.com"]) }),
    ).toBe("Platform / Internal");
  });

  it("shows Not Set for customer null product mode", () => {
    expect(formatProductModeLabel({ row: { ...baseRow, productMode: null } as any })).toBe("Not Set");
  });

  it("maps billing mode labels", () => {
    expect(formatBillingModeLabel("external_billing")).toBe("External Billing");
    expect(formatBillingModeLabel("internal_invoicing")).toBe("Internal Invoicing");
    expect(formatBillingModeLabel(null)).toBe("Not Set");
  });

  it("formats owner-console dates as MM-DD-YYYY", () => {
    expect(formatOwnerConsoleDate("2026-05-10T13:10:00.000Z")).toMatch(/^\d{2}-\d{2}-\d{4}$/);
    expect(formatOwnerConsoleDate(null)).toBe("-");
    expect(formatOwnerConsoleDate("not-a-date")).toBe("-");
  });
});

describe("owner console company fallback", () => {
  function buildBaseInput() {
    return {
      businessProfiles: [
        {
          account_owner_user_id: "owner-1",
          display_name: "Tenant Company",
          billing_mode: "external_billing",
          created_at: "2026-05-01T00:00:00.000Z",
          updated_at: "2026-05-01T00:00:00.000Z",
        },
      ],
      accountSettings: [],
      entitlements: [],
      internalUsers: [],
      ownerProfiles: [{ id: "owner-1", email: "owner@example.com", full_name: "Owner" }],
      ownerAuthUsers: [
        {
          id: "owner-1",
          email: "owner@example.com",
          invited_at: null,
          email_confirmed_at: null,
          confirmed_at: null,
          user_metadata: null as Record<string, unknown> | null,
        },
      ],
    };
  }

  it("prefers tenant business profile display name when present", () => {
    const input = buildBaseInput();
    const model = buildPlatformOwnerDashboardModel(input);

    expect(model.rows[0]?.company).toBe("Tenant Company");
  });

  it("uses captured signup/provisioning company name when business profile shows platform default", () => {
    const input = buildBaseInput();
    input.businessProfiles[0] = {
      ...input.businessProfiles[0],
      display_name: "Compliance Matters",
    };
    input.ownerAuthUsers[0] = {
      ...input.ownerAuthUsers[0],
      user_metadata: {
        business_display_name: "Angkor Heating and Air",
      },
    };

    const model = buildPlatformOwnerDashboardModel(input);

    expect(model.rows[0]?.company).toBe("Angkor Heating and Air");
  });

  it("uses neutral placeholder when no tenant-safe company name is available", () => {
    const input = buildBaseInput();
    input.businessProfiles[0] = {
      ...input.businessProfiles[0],
      display_name: "Compliance Matters",
    };

    const model = buildPlatformOwnerDashboardModel(input);

    expect(model.rows[0]?.company).toBe("Awaiting company setup");
  });

  it("keeps platform/internal account company when explicitly internal", () => {
    const input = buildBaseInput();
    input.businessProfiles[0] = {
      ...input.businessProfiles[0],
      display_name: "Compliance Matters",
    };
    input.ownerProfiles[0] = {
      ...input.ownerProfiles[0],
      email: "internal@example.com",
    };
    input.ownerAuthUsers[0] = {
      ...input.ownerAuthUsers[0],
      email: "internal@example.com",
    };

    const model = buildPlatformOwnerDashboardModel({
      ...input,
      internalOwnerEmails: new Set(["internal@example.com"]),
    });

    expect(model.rows[0]?.company).toBe("Compliance Matters");
  });
});
