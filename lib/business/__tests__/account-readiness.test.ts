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
      entitlementStatus: "trial",
      isEntitlementActive: true,
      seatLimit: null,
      activeSeatCount: 1,
      trialEndsAt: null,
      entitlementValidUntil: null,
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
      },
      activeInternalUsersCount: 2,
      contractorsCount: 0,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);

    expect(summary.completedRequiredCount).toBe(5);
    expect(summary.totalRequiredCount).toBe(5);
    expect(summary.isOperationallyReady).toBe(true);
  });

  it("missing company name => incomplete", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "external_billing",
        logo_url: null,
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
        billing_mode: "internal_invoicing",
        logo_url: null,
      },
      activeInternalUsersCount: 0,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "active_internal_users");

    expect(item?.status).toBe("incomplete");
    expect(summary.isOperationallyReady).toBe(false);
  });

  it("missing logo remains optional", async () => {
    const supabase = makeSupabase({
      profile: {
        display_name: "Acme HVAC",
        support_email: "support@acme.test",
        support_phone: "(555) 111-2222",
        billing_mode: "internal_invoicing",
        logo_url: null,
      },
      activeInternalUsersCount: 1,
      contractorsCount: 0,
    });

    const summary = await resolveAccountReadiness("owner-1", supabase);
    const item = summary.items.find((x) => x.key === "company_logo");

    expect(item?.status).toBe("optional");
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

    await expect(resolveAccountReadiness("owner-1", supabase)).rejects.toThrow(
      "Failed to resolve account readiness business profile",
    );
  });
});