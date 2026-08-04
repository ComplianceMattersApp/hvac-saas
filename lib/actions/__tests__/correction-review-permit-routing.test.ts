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
  renderOperationalEmailLayout: vi.fn(() => "<html></html>"),
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

type JobSnapshot = Record<string, unknown>;

function makeReviewSupabaseFixture(jobSnapshot: JobSnapshot) {
  const jobsUpdates: Record<string, unknown>[] = [];
  const jobEvents: Record<string, unknown>[] = [];

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "internal-user-1" } },
        error: null,
      })),
    },
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: jobSnapshot, error: null })),
              maybeSingle: vi.fn(async () => ({ data: jobSnapshot, error: null })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            jobsUpdates.push(payload);
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            jobEvents.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: null })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    },
  };

  return { supabase, jobsUpdates, jobEvents };
}

function buildReviewFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("review_note", "pass");
  return formData;
}

// Regression: resolving a failure by correction review must route through the
// same permit-needed rule the canonical ECC evaluator applies. A raw
// paperwork_required write on a permit-missing job lands it in a state no
// queue claims (Closeout excludes permit-blocked cert-only work; Waiting
// requires pending_info) — the Job #1352 invisibility incident.
describe("correction review permit routing", () => {
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
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("routes permit-missing resolved failures to pending_info with the Permit Needed reason", async () => {
    const { supabase, jobsUpdates, jobEvents } = makeReviewSupabaseFixture({
      id: "job-1",
      job_type: "ecc",
      status: "completed",
      ops_status: "failed",
      field_complete: true,
      certs_complete: false,
      invoice_complete: true,
      permit_number: "none",
      pending_info_reason: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { resolveFailureByCorrectionReviewFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(resolveFailureByCorrectionReviewFromForm(buildReviewFormData())).rejects.toThrow(
      /REDIRECT/,
    );

    expect(jobsUpdates).toContainEqual({
      ops_status: "pending_info",
      pending_info_reason: "Permit Needed",
    });

    const narrative = jobEvents.find(
      (event) => event.event_type === "failure_resolved_by_correction_review",
    ) as { meta?: Record<string, unknown> } | undefined;
    expect(narrative?.meta?.to).toBe("pending_info");
    expect(narrative?.meta?.permit_needed_blocker_applied).toBe(true);
  });

  it("keeps valid-permit resolved failures on paperwork_required", async () => {
    const { supabase, jobsUpdates, jobEvents } = makeReviewSupabaseFixture({
      id: "job-1",
      job_type: "ecc",
      status: "completed",
      ops_status: "failed",
      field_complete: true,
      certs_complete: false,
      invoice_complete: true,
      permit_number: "PRM-2026-1352",
      pending_info_reason: null,
    });
    createClientMock.mockResolvedValue(supabase);

    const { resolveFailureByCorrectionReviewFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(resolveFailureByCorrectionReviewFromForm(buildReviewFormData())).rejects.toThrow(
      /REDIRECT/,
    );

    expect(jobsUpdates).toContainEqual({ ops_status: "paperwork_required" });
    expect(jobsUpdates).not.toContainEqual(
      expect.objectContaining({ ops_status: "pending_info" }),
    );

    const narrative = jobEvents.find(
      (event) => event.event_type === "failure_resolved_by_correction_review",
    ) as { meta?: Record<string, unknown> } | undefined;
    expect(narrative?.meta?.to).toBe("paperwork_required");
  });

  it("does not clobber an unrelated manual pending reason with the permit blocker", async () => {
    const { supabase, jobsUpdates } = makeReviewSupabaseFixture({
      id: "job-1",
      job_type: "ecc",
      status: "completed",
      ops_status: "failed",
      field_complete: true,
      certs_complete: false,
      invoice_complete: true,
      permit_number: "none",
      pending_info_reason: "Waiting on homeowner access",
    });
    createClientMock.mockResolvedValue(supabase);

    const { resolveFailureByCorrectionReviewFromForm } = await import("@/lib/actions/job-ops-actions");

    await expect(resolveFailureByCorrectionReviewFromForm(buildReviewFormData())).rejects.toThrow(
      /REDIRECT/,
    );

    expect(jobsUpdates).toContainEqual({ ops_status: "paperwork_required" });
  });
});
