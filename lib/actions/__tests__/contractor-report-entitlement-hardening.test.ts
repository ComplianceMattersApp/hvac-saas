import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const revalidatePathMock = vi.fn();

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
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  findExistingContractorReportEmailDelivery: vi.fn(async () => null),
  insertContractorReportEmailDeliveryNotification: vi.fn(async () => ({ id: "notif-1" })),
  insertInternalNotificationForEvent: vi.fn(async () => ({})),
  markContractorReportEmailDeliveryNotification: vi.fn(async () => ({})),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveInternalBusinessIdentityByAccountOwnerId: vi.fn(async () => ({
    display_name: "Test Support",
    support_phone: "555-1234",
    support_email: "support@test.com",
  })),
}));

vi.mock("@/lib/email/layout", () => ({
  resolveAppUrl: vi.fn(() => "http://localhost:3000"),
  renderSystemEmailLayout: vi.fn(() => "<html></html>"),
  escapeHtml: vi.fn((value: string) => value),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: vi.fn(async () => ({})),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/portal/resolveContractorIssues", () => ({
  extractFailureReasons: vi.fn(() => ["Test failure reason"]),
  finalRunPass: vi.fn(() => true),
}));

function makeContractorReportFixture() {
  const writes: Array<{ table: string; op: string }> = [];

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: "job-1",
                  ops_status: "failed",
                  contractor_id: "contractor-1",
                  pending_info_reason: null,
                  follow_up_date: null,
                  next_action_note: null,
                  action_required_by: null,
                  scheduled_date: "2026-04-25",
                  window_start: "09:00",
                  window_end: "11:00",
                  customer_first_name: "Test",
                  customer_last_name: "Customer",
                  contractors: {
                    email: "contractor@test.com",
                    owner_user_id: "owner-1",
                    name: "Test Contractor",
                  },
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn(() => {
            writes.push({ table, op: "insert" });
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: "event-1" },
                  error: null,
                })),
              })),
            };
          }),
        };
      }

      if (table === "internal_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { user_id: "user-1" },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      if (table === "ecc_test_runs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: [
                      {
                        created_at: "2026-04-20T10:00:00Z",
                        computed: true,
                        computed_pass: false,
                        override_pass: null,
                        is_completed: true,
                      },
                    ],
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { supabase, writes };
}

describe("contractor report entitlement hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    loadScopedInternalJobForMutationMock.mockResolvedValue({
      id: "job-1",
    });

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  describe("generateContractorReportPreview", () => {
    it("allows active account preview generation", async () => {
      const { supabase } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(preview).toBeDefined();
      expect(preview.title).toBeDefined();
    });

    it("allows valid trial preview generation", async () => {
      const { supabase } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      expect(preview).toBeDefined();
    });

    it("blocks expired trial preview generation before report resolution", async () => {
      const { supabase } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_expired",
      });

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      await expect(generateContractorReportPreview({ jobId: "job-1" })).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );
    });

    it("blocks null-ended trial preview generation before report resolution", async () => {
      const { supabase } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_missing_end",
      });

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      await expect(generateContractorReportPreview({ jobId: "job-1" })).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );
    });

    it("allows internal comped preview generation", async () => {
      const { supabase } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      const preview = await generateContractorReportPreview({ jobId: "job-1" });

      expect(preview).toBeDefined();
    });

    it("blocks missing entitlement preview generation before report resolution", async () => {
      const { supabase } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_missing_entitlement",
      });

      const { generateContractorReportPreview } = await import(
        "@/lib/actions/job-ops-actions"
      );

      await expect(generateContractorReportPreview({ jobId: "job-1" })).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );
    });
  });

  describe("sendContractorReport", () => {
    it("allows active account report send and writes events", async () => {
      const { supabase, writes } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);

      const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

      const result = await sendContractorReport({
        jobId: "job-1",
        contractorNote: "Test note",
      });

      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: "owner-1" }),
      );
      expect(result.ok).toBe(true);
      expect(writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
      expect(revalidatePathMock).toHaveBeenCalled();
    });

    it("allows valid trial report send", async () => {
      const { supabase, writes } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_trial",
      });

      const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

      const result = await sendContractorReport({
        jobId: "job-1",
      });

      expect(result.ok).toBe(true);
      expect(writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
    });

    it("blocks expired trial report send before writes", async () => {
      const { supabase, writes } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_expired",
      });

      const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

      await expect(
        sendContractorReport({
          jobId: "job-1",
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("blocks null-ended trial report send before writes", async () => {
      const { supabase, writes } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_trial_missing_end",
      });

      const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

      await expect(
        sendContractorReport({
          jobId: "job-1",
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("allows internal comped report send", async () => {
      const { supabase, writes } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: true,
        reason: "allowed_internal_comped",
      });

      const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

      const result = await sendContractorReport({
        jobId: "job-1",
      });

      expect(result.ok).toBe(true);
      expect(writes.some((w) => w.table === "job_events" && w.op === "insert")).toBe(true);
    });

    it("blocks missing entitlement report send before writes", async () => {
      const { supabase, writes } = makeContractorReportFixture();
      createClientMock.mockResolvedValue(supabase);
      resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
        authorized: false,
        reason: "blocked_missing_entitlement",
      });

      const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

      await expect(
        sendContractorReport({
          jobId: "job-1",
        }),
      ).rejects.toThrow(
        "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
      );

      expect(writes).toHaveLength(0);
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });
});
