import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAccountReadiness } from "@/lib/business/account-readiness";

const resolveAccountEntitlementMock = vi.fn();

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveAccountEntitlement: (...args: unknown[]) => resolveAccountEntitlementMock(...args),
}));

function makeSupabase(opts?: {
  profile?: {
    display_name: string | null;
    support_email: string | null;
    support_phone: string | null;
    billing_mode: string | null;
    logo_url: string | null;
    stripe_connected_account_id?: string | null;
    stripe_connect_onboarding_status?: string | null;
    stripe_charges_enabled?: boolean | null;
    stripe_payouts_enabled?: boolean | null;
    stripe_details_submitted?: boolean | null;
    stripe_connect_disabled_reason?: string | null;
    stripe_connect_last_synced_at?: string | null;
    profile_reviewed_at?: string | null;
    team_reviewed_at?: string | null;
  } | null;
  profileError?: { message: string } | null;
  activeInternalUsersCount?: number;
  activeInternalUsersError?: { message: string } | null;
  contractorsCount?: number;
  contractorsError?: { message: string } | null;
}) {
  const profile = opts?.profile ?? null;
  const profileError = opts?.profileError ?? null;
  const activeInternalUsersCount = opts?.activeInternalUsersCount ?? 0;
  const activeInternalUsersError = opts?.activeInternalUsersError ?? null;
  const contractorsCount = opts?.contractorsCount ?? 0;
  const contractorsError = opts?.contractorsError ?? null;

  return {
    from: vi.fn((table: string) => {
      if (table === "internal_business_profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: profile, error: profileError })),
            })),
          })),
        };
      }

      if (table === "internal_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: null,
                count: activeInternalUsersCount,
                error: activeInternalUsersError,
              })),
            })),
          })),
        };
      }

      if (table === "contractors") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: null,
              count: contractorsCount,
              error: contractorsError,
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  } as any;
}

describe("resolveAccountReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAccountEntitlementMock.mockResolvedValue({
      planKey: "starter",
      entitlementStatus: "active",
      isEntitlementActive: true,
      isInternalComped: false,
      internalCompedSignal: "none",
      seatLimit: null,
      activeSeatCount: 1,
      trialEndsAt: null,
      entitlementValidUntil: null,
      billingCustomerLinked: true,
      billingSubscriptionLinked: true,
      billingSubscriptionStatus: "active",
      billingCurrentPeriodEnd: null,
      billingCancelAtPeriodEnd: false,
    });
  });

  it("all required items complete => isOperationallyReady true", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: "storage://attachments/company-profile/logo.png",
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 2,
      contractorsCount: 0,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);

    expect(summary.completedRequiredCount).toBe(6);
    expect(summary.totalRequiredCount).toBe(6);
    expect(summary.isOperationallyReady).toBe(true);
  });

  it("provisioned fields present but no review timestamps => only team access can be complete", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: null,
        profile_reviewed_at: null,
        team_reviewed_at: null,
      },
      activeInternalUsersCount: 1,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);

    expect(summary.completedRequiredCount).toBe(2);
    expect(summary.isOperationallyReady).toBe(false);
    expect(summary.items.find((x) => x.key === "company_name")?.status).toBe("incomplete");
    expect(summary.items.find((x) => x.key === "support_email")?.status).toBe("incomplete");
    expect(summary.items.find((x) => x.key === "support_phone")?.status).toBe("incomplete");
    expect(summary.items.find((x) => x.key === "billing_mode")?.status).toBe("incomplete");
    expect(summary.items.find((x) => x.key === "active_internal_users")?.status).toBe("complete");
  });

  it("profile reviewed but team not => 6 of 6 complete when active users exist", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: null,
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: null,
      },
      activeInternalUsersCount: 1,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);

    expect(summary.completedRequiredCount).toBe(6);
    expect(summary.isOperationallyReady).toBe(true);
    expect(summary.items.find((x) => x.key === "active_internal_users")?.status).toBe("complete");
  });

  it("team reviewed but profile not => 2 of 6 complete", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: null,
        profile_reviewed_at: null,
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 1,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);

    expect(summary.completedRequiredCount).toBe(2);
    expect(summary.isOperationallyReady).toBe(false);
    expect(summary.items.find((x) => x.key === "active_internal_users")?.status).toBe("complete");
  });

  it("app subscription is required and incomplete when trial has no billing links", async () => {
    resolveAccountEntitlementMock.mockResolvedValueOnce({
      planKey: "starter",
      entitlementStatus: "trial",
      isEntitlementActive: true,
      isInternalComped: false,
      internalCompedSignal: "none",
      seatLimit: null,
      activeSeatCount: 1,
      trialEndsAt: null,
      entitlementValidUntil: null,
      billingCustomerLinked: false,
      billingSubscriptionLinked: false,
      billingSubscriptionStatus: null,
      billingCurrentPeriodEnd: null,
      billingCancelAtPeriodEnd: false,
    });

    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: null,
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 1,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "app_subscription");

    expect(item?.status).toBe("incomplete");
    expect(item?.label).toBe("App subscription");
    expect(item?.description).toBe("Set up your Compliance Matters subscription before the trial ends.");
    expect(item?.href).toBe("/ops/admin/company-profile#account-billing");
    expect(summary.isOperationallyReady).toBe(false);
  });

  it("app subscription is complete when account is internally comped", async () => {
    resolveAccountEntitlementMock.mockResolvedValueOnce({
      planKey: "starter",
      entitlementStatus: "active",
      isEntitlementActive: true,
      isInternalComped: true,
      internalCompedSignal: "notes_marker",
      seatLimit: null,
      activeSeatCount: 1,
      trialEndsAt: null,
      entitlementValidUntil: null,
      billingCustomerLinked: false,
      billingSubscriptionLinked: false,
      billingSubscriptionStatus: null,
      billingCurrentPeriodEnd: null,
      billingCancelAtPeriodEnd: false,
    });

    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: null,
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 1,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "app_subscription");

    expect(item?.status).toBe("complete");
    expect(item?.description).toBe("Subscription is handled internally.");
  });

  it("team access item uses count-based copy when users exist", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: null,
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: null,
      },
      activeInternalUsersCount: 2,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "active_internal_users");

    expect(item?.label).toBe("Team access");
    expect(item?.description).toContain("2 active internal users");
    expect(item?.description).toContain("Add more users later from Internal Users if your team grows.");
  });

  it("missing company name => incomplete", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: null,
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 1,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "company_name");

    expect(item?.status).toBe("incomplete");
    expect(summary.isOperationallyReady).toBe(false);
  });

  it("missing support email => incomplete", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: null,
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: null,
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 1,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "support_email");

    expect(item?.status).toBe("incomplete");
    expect(summary.isOperationallyReady).toBe(false);
  });

  it("missing support phone => incomplete", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "",
        billing_mode: "external_billing",
        logo_url: null,
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 1,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "support_phone");

    expect(item?.status).toBe("incomplete");
    expect(summary.isOperationallyReady).toBe(false);
  });

  it("missing billing mode => incomplete", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: null,
        logo_url: null,
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 1,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "billing_mode");

    expect(item?.status).toBe("incomplete");
    expect(summary.isOperationallyReady).toBe(false);
  });

  it("zero active internal users => incomplete", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: null,
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 0,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "active_internal_users");

    expect(item?.label).toBe("Team access");
    expect(item?.status).toBe("incomplete");
    expect(item?.description).toBe("No active internal users found. Add or activate an internal user to finish setup.");
    expect(summary.isOperationallyReady).toBe(false);
  });

  it("missing logo remains optional", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: null,
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 1,
      contractorsCount: 0,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "company_logo");

    expect(item?.status).toBe("optional");
    expect(item?.description).toBe("Add your logo for branded documents and messages.");
    expect(summary.isOperationallyReady).toBe(true);
  });

  it("uploaded logo is hidden from optional items", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: "storage://attachments/company-profile/logo.png",
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 1,
      contractorsCount: 0,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "company_logo");

    expect(item).toBeUndefined();
    expect(summary.isOperationallyReady).toBe(true);
  });

  it("accept online invoice payments is required when internal invoicing is not ready", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "internal_invoicing",
        logo_url: null,
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 1,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "accept_online_invoice_payments");

    expect(item?.status).toBe("incomplete");
    expect(item?.label).toBe("Online Payments");
    expect(item?.description).toBe("Let customers pay invoices online through Compliance Matters.");
    expect(item?.href).toBe("/ops/admin/company-profile#accept-payments");
    expect(summary.isOperationallyReady).toBe(false);
  });

  it("accept online invoice payments is complete when internal invoicing payment setup is ready", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "internal_invoicing",
        logo_url: null,
        stripe_connected_account_id: "acct_123",
        stripe_connect_onboarding_status: "complete",
        stripe_charges_enabled: true,
        stripe_payouts_enabled: true,
        stripe_details_submitted: true,
        stripe_connect_disabled_reason: null,
        stripe_connect_last_synced_at: "2026-04-26T00:00:00Z",
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 1,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "accept_online_invoice_payments");

    expect(item?.status).toBe("complete");
    expect(item?.description).toBe("Online invoice payments are ready.");
    expect(summary.isOperationallyReady).toBe(true);
  });

  it("online invoice payments remains optional when billing is tracked outside Compliance Matters", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: null,
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 1,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "online_invoice_payments");

    expect(item?.status).toBe("optional");
    expect(item?.description).toBe("Not used when your company tracks billing outside Compliance Matters.");
    expect(item?.href).toBe("/ops/admin/company-profile#accept-payments");
    expect(summary.isOperationallyReady).toBe(true);
  });

  it("no contractors remains optional", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: null,
        profile_reviewed_at: "2026-04-26T00:00:00Z",
        team_reviewed_at: "2026-04-26T00:00:00Z",
      },
      activeInternalUsersCount: 1,
      contractorsCount: 0,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "contractor_directory");

    expect(item?.status).toBe("optional");
    expect(summary.isOperationallyReady).toBe(true);
  });

  it("resolver throws on real DB errors", async () => {
    const supabase = makeSupabase({
      profileError: { message: "db down" },
    });

    await expect(resolveAccountReadiness("owner-1", supabase)).rejects.toThrow("db down");
  });
});
