import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const findExistingContractorReportEmailDeliveryMock = vi.fn();
const insertContractorReportEmailDeliveryNotificationMock = vi.fn();
const insertInternalNotificationForEventMock = vi.fn();
const markContractorReportEmailDeliveryNotificationMock = vi.fn();
const resolveInternalBusinessIdentityByAccountOwnerIdMock = vi.fn();
const sendEmailMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
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

vi.mock("@/lib/actions/notification-actions", () => ({
  findExistingContractorReportEmailDelivery: (...args: unknown[]) =>
    findExistingContractorReportEmailDeliveryMock(...args),
  insertContractorReportEmailDeliveryNotification: (...args: unknown[]) =>
    insertContractorReportEmailDeliveryNotificationMock(...args),
  insertInternalNotificationForEvent: (...args: unknown[]) =>
    insertInternalNotificationForEventMock(...args),
  markContractorReportEmailDeliveryNotification: (...args: unknown[]) =>
    markContractorReportEmailDeliveryNotificationMock(...args),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: vi.fn(async () => "external_billing"),
  resolveInternalBusinessIdentityByAccountOwnerId: (...args: unknown[]) =>
    resolveInternalBusinessIdentityByAccountOwnerIdMock(...args),
}));

vi.mock("@/lib/email/layout", () => ({
  resolveAppUrl: vi.fn(() => "http://localhost:3000"),
  renderSystemEmailLayout: vi.fn(() => "<html></html>"),
  escapeHtml: vi.fn((value: string) => value),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
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
            single: vi.fn(async () => ({ data: null, error: null })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [], error: null })),
              limit: vi.fn(async () => ({ data: [], error: null })),
            })),
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
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "event-1" }, error: null })),
            })),
          };
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

describe("internal same-account contractor report hardening", () => {
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

    findExistingContractorReportEmailDeliveryMock.mockResolvedValue(null);
    insertContractorReportEmailDeliveryNotificationMock.mockResolvedValue({ id: "delivery-1" });
    insertInternalNotificationForEventMock.mockResolvedValue(undefined);
    markContractorReportEmailDeliveryNotificationMock.mockResolvedValue(undefined);
    resolveInternalBusinessIdentityByAccountOwnerIdMock.mockResolvedValue({
      display_name: "Compliance Matters",
      support_phone: null,
      support_email: null,
    });
    sendEmailMock.mockResolvedValue(undefined);
  });

  it("denies cross-account internal generateContractorReportPreview before reads and side effects", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { generateContractorReportPreview } = await import("@/lib/actions/job-ops-actions");

    await expect(generateContractorReportPreview({ jobId: "job-1" })).rejects.toThrow("Not authorized");

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(insertInternalNotificationForEventMock).not.toHaveBeenCalled();
    expect(insertContractorReportEmailDeliveryNotificationMock).not.toHaveBeenCalled();
    expect(markContractorReportEmailDeliveryNotificationMock).not.toHaveBeenCalled();
    expect(findExistingContractorReportEmailDeliveryMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("denies cross-account internal sendContractorReport before writes and side effects", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

    await expect(sendContractorReport({ jobId: "job-1" })).rejects.toThrow("Not authorized");

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(insertInternalNotificationForEventMock).not.toHaveBeenCalled();
    expect(insertContractorReportEmailDeliveryNotificationMock).not.toHaveBeenCalled();
    expect(markContractorReportEmailDeliveryNotificationMock).not.toHaveBeenCalled();
    expect(findExistingContractorReportEmailDeliveryMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("allows same-account internal generateContractorReportPreview past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { generateContractorReportPreview } = await import("@/lib/actions/job-ops-actions");

    await expect(generateContractorReportPreview({ jobId: "job-1" })).rejects.toThrow("ALLOW_PATH_REACHED");
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
  });

  it("allows same-account internal sendContractorReport past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { sendContractorReport } = await import("@/lib/actions/job-ops-actions");

    await expect(sendContractorReport({ jobId: "job-1" })).rejects.toThrow("ALLOW_PATH_REACHED");
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
  });
});
