import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const revalidatePathMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (error: unknown) => {
    return Boolean(error) && typeof error === "object" && "code" in (error as Record<string, unknown>);
  },
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: vi.fn(async () => undefined),
  healStalePaperworkOpsStatus: vi.fn(async () => true),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  findExistingContractorReportEmailDelivery: vi.fn(async () => null),
  insertContractorReportEmailDeliveryNotification: vi.fn(async () => ({ id: "delivery-1" })),
  insertInternalNotificationForEvent: vi.fn(async () => undefined),
  markContractorReportEmailDeliveryNotification: vi.fn(async () => undefined),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: vi.fn(async () => "external_billing"),
  resolveInternalBusinessIdentityByAccountOwnerId: vi.fn(async () => ({
    display_name: "Compliance Matters",
    support_phone: null,
    support_email: null,
  })),
}));

vi.mock("@/lib/email/layout", () => ({
  resolveAppUrl: vi.fn(() => "http://localhost:3000"),
  renderSystemEmailLayout: vi.fn(() => "<html></html>"),
  escapeHtml: vi.fn((value: string) => value),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/portal/resolveContractorIssues", () => ({
  extractFailureReasons: vi.fn(() => []),
  finalRunPass: vi.fn(() => true),
}));

function makeDenySupabaseFixture() {
  const writeCalls: Array<{ table: string; method: "update" | "insert" }> = [];

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "internal-user-1" } },
        error: null,
      })),
    },
    from(table: string) {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [], error: null })),
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              single: vi.fn(async () => ({ data: null, error: null })),
              limit: vi.fn(async () => ({ data: [], error: null })),
            })),
            single: vi.fn(async () => ({ data: null, error: null })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
        update: vi.fn(() => {
          writeCalls.push({ table, method: "update" });
          return {
            eq: vi.fn(async () => ({ error: null })),
          };
        }),
        insert: vi.fn(() => {
          writeCalls.push({ table, method: "insert" });
          return Promise.resolve({ error: null });
        }),
      };
    },
  };

  return { supabase, writeCalls };
}

function makeAllowSupabaseFixture() {
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "internal-user-1" } },
        error: null,
      })),
    },
    from(_table: string) {
      throw new Error("ALLOW_PATH_REACHED");
    },
  };

  return { supabase };
}

function buildJobOnlyFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  return formData;
}

function buildUpdateOpsDetailsFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("follow_up_date", "2026-04-23");
  formData.set("next_action_note", "Need callback");
  formData.set("action_required_by", "customer");
  return formData;
}

function buildUpdateOpsFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("ops_status", "pending_info");
  formData.set("status_reason", "Need permit details");
  return formData;
}

function buildContactAttemptFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("method", "call");
  formData.set("result", "no_answer");
  return formData;
}

describe("internal same-account ops/contact mutation hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: "internal-user-1",
      internalUser: {
        user_id: "internal-user-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  function expectNoOperationalWrites(writeCalls: Array<{ table: string; method: "update" | "insert" }>) {
    expect(
      writeCalls.filter((call) => ["jobs", "job_events", "notifications"].includes(call.table)),
    ).toHaveLength(0);
  }

  it("denies cross-account internal resolveFailureByCorrectionReviewFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { resolveFailureByCorrectionReviewFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(resolveFailureByCorrectionReviewFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls).toHaveLength(0);
  });

  it("denies cross-account internal markCertsCompleteFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { markCertsCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markCertsCompleteFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls).toHaveLength(0);
  });

  it("denies cross-account internal markInvoiceCompleteFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { markInvoiceCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markInvoiceCompleteFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls).toHaveLength(0);
  });

  it("denies cross-account internal updateJobOpsDetailsFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { updateJobOpsDetailsFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(updateJobOpsDetailsFromForm(buildUpdateOpsDetailsFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls).toHaveLength(0);
  });

  it("denies cross-account internal updateJobOpsFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { updateJobOpsFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(updateJobOpsFromForm(buildUpdateOpsFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls).toHaveLength(0);
  });

  it("denies cross-account internal markJobFieldCompleteFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { markJobFieldCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markJobFieldCompleteFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls).toHaveLength(0);
  });

  it("denies cross-account internal logCustomerContactAttemptFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { logCustomerContactAttemptFromForm } = await import("@/lib/actions/job-contact-actions");

    await expect(logCustomerContactAttemptFromForm(buildContactAttemptFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls).toHaveLength(0);
  });

  it("denies cross-account internal releasePendingInfoAndRecomputeFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { releasePendingInfoAndRecomputeFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(releasePendingInfoAndRecomputeFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls).toHaveLength(0);
  });

  it("denies cross-account internal releaseAndReevaluateFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { releaseAndReevaluateFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(releaseAndReevaluateFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls).toHaveLength(0);
  });

  it("allows same-account internal resolveFailureByCorrectionReviewFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { resolveFailureByCorrectionReviewFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(resolveFailureByCorrectionReviewFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
  });

  it("allows same-account internal markCertsCompleteFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { markCertsCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markCertsCompleteFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
  });

  it("allows same-account internal markInvoiceCompleteFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { markInvoiceCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markInvoiceCompleteFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
  });

  it("allows same-account internal updateJobOpsDetailsFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobOpsDetailsFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(updateJobOpsDetailsFromForm(buildUpdateOpsDetailsFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows same-account internal updateJobOpsFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobOpsFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(updateJobOpsFromForm(buildUpdateOpsFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows same-account internal markJobFieldCompleteFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { markJobFieldCompleteFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(markJobFieldCompleteFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows same-account internal logCustomerContactAttemptFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { logCustomerContactAttemptFromForm } = await import("@/lib/actions/job-contact-actions");

    await expect(logCustomerContactAttemptFromForm(buildContactAttemptFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows same-account internal releasePendingInfoAndRecomputeFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { releasePendingInfoAndRecomputeFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(releasePendingInfoAndRecomputeFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows same-account internal releaseAndReevaluateFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { releaseAndReevaluateFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(releaseAndReevaluateFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows valid trial internal updateJobOpsFromForm past entitlement preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_trial",
    });

    const { updateJobOpsFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(updateJobOpsFromForm(buildUpdateOpsFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
  });

  it("blocks expired trial internal updateJobOpsFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_expired",
    });

    const { updateJobOpsFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(updateJobOpsFromForm(buildUpdateOpsFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
    );

    expectNoOperationalWrites(writeCalls);
  });

  it("blocks null-ended trial internal updateJobOpsFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_missing_end",
    });

    const { updateJobOpsFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(updateJobOpsFromForm(buildUpdateOpsFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
    );

    expectNoOperationalWrites(writeCalls);
  });

  it("allows internal comped updateJobOpsFromForm past entitlement preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_internal_comped",
    });

    const { updateJobOpsFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(updateJobOpsFromForm(buildUpdateOpsFormData())).rejects.toThrow(
      "ALLOW_PATH_REACHED",
    );
  });

  it("blocks missing entitlement internal updateJobOpsFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_missing_entitlement",
    });

    const { updateJobOpsFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(updateJobOpsFromForm(buildUpdateOpsFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
    );

    expectNoOperationalWrites(writeCalls);
  });
});
