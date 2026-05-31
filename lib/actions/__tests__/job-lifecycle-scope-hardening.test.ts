import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const revalidatePathMock = vi.fn();
const refreshMock = vi.fn();
const sendEmailMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const resolveNotificationAccountOwnerUserIdMock = vi.fn();
const autoCountMaintenanceAgreementVisitsForCompletedServiceJobMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: (...args: unknown[]) => refreshMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  requireInternalRole: vi.fn(),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
  loadScopedInternalServiceCaseForMutation: vi.fn(),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: vi.fn(async () => undefined),
  healStalePaperworkOpsStatus: vi.fn(async () => true),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/job-ops-actions", () => ({
  releasePendingInfoAndRecompute: vi.fn(async () => null),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  createContractorIntakeProposalAwarenessNotification: vi.fn(async () => null),
  insertInternalNotificationForEvent: vi.fn(async () => null),
  markInternalNewWorkNotificationsResolved: vi.fn(async () => undefined),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
  buildStaffingSnapshotMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock("@/lib/notifications/account-owner", () => ({
  resolveNotificationAccountOwnerUserId: (...args: unknown[]) =>
    resolveNotificationAccountOwnerUserIdMock(...args),
}));

vi.mock("@/lib/maintenance-agreements/agreement-actions", () => ({
  createMaintenanceAgreementVisitLinkFromJobCreation: vi.fn(async () => false),
  autoCountMaintenanceAgreementVisitsForCompletedServiceJob: (...args: unknown[]) =>
    autoCountMaintenanceAgreementVisitsForCompletedServiceJobMock(...args),
}));

function makeDenySupabaseFixture() {
  const writeCalls: Array<{ table: string; method: "update" | "insert" }> = [];

  const supabase = {
    from(table: string) {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: null })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
        })),
        update: vi.fn(() => {
          writeCalls.push({ table, method: "update" });
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
                not: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
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
    from(_table: string) {
      throw new Error("ALLOW_PATH_REACHED");
    },
  };

  return { supabase };
}

function makeSchedulePreservationFixture(beforeOverrides: Record<string, unknown> = {}) {
  const jobsUpdates: Record<string, unknown>[] = [];
  const jobEvents: Record<string, unknown>[] = [];
  const before = {
    scheduled_date: "2026-04-20",
    window_start: "08:00",
    window_end: "10:00",
    ops_status: "scheduled",
    job_type: "ecc",
    status: "open",
    field_complete: false,
    permit_number: "PERMIT-123",
    jurisdiction: "Sacramento",
    permit_date: "2026-04-15",
    pending_info_reason: null,
    follow_up_date: null,
    next_action_note: null,
    action_required_by: null,
    ...beforeOverrides,
  };

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: before, error: null })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            jobsUpdates.push(payload);
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: "job-1" }, error: null })),
                })),
              })),
            };
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            jobEvents.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "evt-1" }, error: null })),
              })),
            };
          }),
        };
      }

      if (table === "notifications") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  in: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, jobsUpdates, jobEvents };
}

function makeAdvanceToCompletedServiceFixture() {
  const jobEvents: Record<string, unknown>[] = [];
  const jobsUpdates: Record<string, unknown>[] = [];

  const jobRecord: Record<string, unknown> = {
    id: "job-1",
    status: "in_process",
    on_the_way_at: null,
    parent_job_id: null,
    job_type: "service",
    ops_status: "scheduled",
    field_complete: false,
    field_complete_at: null,
    certs_complete: false,
    invoice_complete: false,
    scheduled_date: "2026-04-24",
    window_start: "09:00",
    window_end: "11:00",
  };

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn((_columns: string) => {
            const builder: any = {
              _id: "",
              eq: vi.fn((column: string, value: unknown) => {
                if (column === "id") {
                  builder._id = String(value ?? "");
                }
                return builder;
              }),
              single: vi.fn(async () => ({
                data: builder._id === "job-1" ? { ...jobRecord } : null,
                error: null,
              })),
              maybeSingle: vi.fn(async () => ({
                data: builder._id === "job-1" ? { ...jobRecord } : null,
                error: null,
              })),
            };

            return builder;
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            jobsUpdates.push(payload);
            Object.assign(jobRecord, payload);

            const chain: any = {
              eq: vi.fn(() => chain),
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: "job-1" }, error: null })),
              })),
              is: vi.fn(() => chain),
              not: vi.fn(() => chain),
            };

            return chain;
          }),
        };
      }

      if (table === "job_assignments") {
        return {
          select: vi.fn(() => {
            const builder: any = {
              eq: vi.fn(() => builder),
              maybeSingle: vi.fn(async () => ({ data: { id: "assign-1" }, error: null })),
            };
            return builder;
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            jobEvents.push(payload);
            const response = { data: { id: `evt-${jobEvents.length}` }, error: null };
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => response),
              })),
              single: vi.fn(async () => response),
              then: (onFulfilled: (value: typeof response) => unknown, onRejected?: (reason: unknown) => unknown) =>
                Promise.resolve(response).then(onFulfilled, onRejected),
            };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, jobsUpdates, jobEvents };
}

function makeScheduleEmailFixture(input: {
  beforeOverrides?: Record<string, unknown>;
  scheduledSnapshotOverrides?: Record<string, unknown>;
  existingDedupeByType?: string[];
  historyByType?: string[];
} = {}) {
  const jobsUpdates: Record<string, unknown>[] = [];
  const jobEvents: Record<string, unknown>[] = [];
  const notificationInserts: Record<string, unknown>[] = [];
  const notificationUpdates: Record<string, unknown>[] = [];
  const existingDedupeByType = new Set(input.existingDedupeByType ?? []);
  const historyByType = new Set(input.historyByType ?? []);
  let jobSelectCount = 0;

  const before = {
    scheduled_date: null,
    window_start: null,
    window_end: null,
    ops_status: "need_to_schedule",
    job_type: "service",
    status: "open",
    field_complete: false,
    permit_number: null,
    jurisdiction: null,
    permit_date: null,
    pending_info_reason: null,
    follow_up_date: null,
    next_action_note: null,
    action_required_by: null,
    ...input.beforeOverrides,
  };

  const scheduledSnapshot = {
    id: "job-1",
    job_type: "service",
    customer_first_name: "Eddie",
    customer_last_name: "Test",
    customer_phone: null,
    customer_email: "eddie@compliancemattersca.com",
    customer_id: "cust-1",
    job_address: "123 Main",
    city: "Town",
    scheduled_date: "2026-04-24",
    window_start: "09:00",
    window_end: "11:00",
    contractor_id: null,
    contractors: null,
    customers: { owner_user_id: "owner-1" },
    locations: { owner_user_id: "owner-1" },
    ...input.scheduledSnapshotOverrides,
  };

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => {
                jobSelectCount += 1;
                if (jobSelectCount === 1) return { data: before, error: null };
                return { data: scheduledSnapshot, error: null };
              }),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            jobsUpdates.push(payload);
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: "job-1" }, error: null })),
                })),
              })),
            };
          }),
        };
      }

      if (table === "job_events") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            jobEvents.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "evt-1" }, error: null })),
              })),
            };
          }),
        };
      }

      if (table === "notifications") {
        return {
          select: vi.fn(() => {
            let notificationType = "";
            let usedContains = false;
            const query: any = {
              eq: vi.fn((column: string, value: unknown) => {
                if (column === "notification_type") {
                  notificationType = String(value ?? "").trim();
                }
                return query;
              }),
              contains: vi.fn(() => {
                usedContains = true;
                return query;
              }),
              in: vi.fn(() => query),
              order: vi.fn(() => query),
              limit: vi.fn(() => query),
              maybeSingle: vi.fn(async () => {
                const hasRow = usedContains
                  ? existingDedupeByType.has(notificationType)
                  : historyByType.has(notificationType);
                return {
                  data: hasRow ? { id: `notif-${notificationType}`, status: "sent" } : null,
                  error: null,
                };
              }),
            };
            return query;
          }),
          insert: vi.fn((payload: Record<string, unknown>) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                notificationInserts.push(payload);
                return { data: { id: `notif-${notificationInserts.length}` }, error: null };
              }),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(async () => {
              notificationUpdates.push(payload);
              return { error: null };
            }),
          })),
        };
      }

      if (table === "internal_business_profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  account_owner_user_id: "owner-1",
                  display_name: "Tenant Co",
                  support_email: null,
                  support_phone: null,
                  logo_url: null,
                  billing_mode: "external_billing",
                  created_at: "",
                  updated_at: "",
                },
                error: null,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { supabase, jobsUpdates, jobEvents, notificationInserts, notificationUpdates };
}

function buildJobOnlyFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  return formData;
}

function buildRevertFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("tab", "info");
  return formData;
}

function buildScheduleFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("scheduled_date", "2026-04-23");
  formData.set("window_start", "08:00");
  formData.set("window_end", "10:00");
  return formData;
}

function buildScheduleOnlyFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("scheduled_date", "2026-04-24");
  formData.set("window_start", "09:00");
  formData.set("window_end", "11:00");
  formData.set("no_redirect", "1");
  return formData;
}

function buildScheduleWithPermitFormData() {
  const formData = buildScheduleOnlyFormData();
  formData.set("permit_number", "SERVICE-777");
  formData.set("jurisdiction", "Oakland");
  formData.set("permit_date", "2026-04-26");
  return formData;
}

describe("internal same-account lifecycle scheduling hardening", () => {
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

    sendEmailMock.mockResolvedValue(undefined);
    resolveNotificationAccountOwnerUserIdMock.mockResolvedValue("owner-1");
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
    autoCountMaintenanceAgreementVisitsForCompletedServiceJobMock.mockResolvedValue({
      evaluatedLinks: 1,
      eligibleLinks: 1,
      countedLinks: 1,
      alreadyCountedLinks: 0,
      skippedLinks: 0,
    });
  });

  it("denies cross-account internal advanceJobStatusFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { advanceJobStatusFromForm } = await import("@/lib/actions/job-actions");

    await expect(advanceJobStatusFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("denies cross-account internal revertOnTheWayFromForm before writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { revertOnTheWayFromForm } = await import("@/lib/actions/job-actions");

    await expect(revertOnTheWayFromForm(buildRevertFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("denies cross-account internal updateJobScheduleFromForm before writes or emails", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("allows same-account internal advanceJobStatusFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { advanceJobStatusFromForm } = await import("@/lib/actions/job-actions");

    await expect(advanceJobStatusFromForm(buildJobOnlyFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("triggers maintenance visit auto-count for non-ECC service completion", async () => {
    const { supabase, jobsUpdates } = makeAdvanceToCompletedServiceFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { advanceJobStatusFromForm } = await import("@/lib/actions/job-actions");

    await expect(advanceJobStatusFromForm(buildJobOnlyFormData())).rejects.toThrow(
      "banner=status_updated",
    );

    expect(jobsUpdates).toContainEqual(
      expect.objectContaining({
        status: "completed",
        field_complete: true,
        ops_status: "invoice_required",
      }),
    );
    expect(autoCountMaintenanceAgreementVisitsForCompletedServiceJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: supabase,
        accountOwnerUserId: "owner-1",
        jobId: "job-1",
        actingUserId: "internal-user-1",
      }),
    );
  });

  it("allows same-account internal revertOnTheWayFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { revertOnTheWayFromForm } = await import("@/lib/actions/job-actions");

    await expect(revertOnTheWayFromForm(buildRevertFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows same-account internal updateJobScheduleFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("preserves permit fields when schedule-only form omits permit inputs", async () => {
    const { supabase, jobsUpdates, jobEvents } = makeSchedulePreservationFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await updateJobScheduleFromForm(buildScheduleOnlyFormData());

    expect(jobsUpdates).toHaveLength(1);
    expect(jobsUpdates[0]).toEqual(
      expect.objectContaining({
        scheduled_date: "2026-04-24",
        window_start: "09:00",
        window_end: "11:00",
        permit_number: "PERMIT-123",
        jurisdiction: "Sacramento",
        permit_date: "2026-04-15",
      }),
    );
    expect(jobEvents[0]?.meta).toEqual(
      expect.objectContaining({
        after: expect.objectContaining({
          permit_number: "PERMIT-123",
          jurisdiction: "Sacramento",
          permit_date: "2026-04-15",
        }),
      }),
    );
  });

  it("preserves permit fields when blank unschedule form omits permit inputs", async () => {
    const { supabase, jobsUpdates } = makeSchedulePreservationFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const formData = new FormData();
    formData.set("job_id", "job-1");
    formData.set("unschedule", "1");
    formData.set("no_redirect", "1");

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await updateJobScheduleFromForm(formData);

    expect(jobsUpdates[0]).toEqual(
      expect.objectContaining({
        scheduled_date: null,
        window_start: null,
        window_end: null,
        permit_number: "PERMIT-123",
        jurisdiction: "Sacramento",
        permit_date: "2026-04-15",
      }),
    );
  });

  it("allows service schedule updates to write provided permit fields", async () => {
    const { supabase, jobsUpdates, jobEvents } = makeSchedulePreservationFixture({
      job_type: "service",
      permit_number: "LEGACY-100",
      jurisdiction: "Stockton",
      permit_date: "2026-04-02",
    });
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await updateJobScheduleFromForm(buildScheduleWithPermitFormData());

    expect(jobsUpdates).toHaveLength(1);
    expect(jobsUpdates[0]).toEqual(
      expect.objectContaining({
        permit_number: "SERVICE-777",
        jurisdiction: "Oakland",
        permit_date: "2026-04-26",
      }),
    );
    expect(jobEvents[0]?.meta).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({
          permit_number: "LEGACY-100",
          jurisdiction: "Stockton",
          permit_date: "2026-04-02",
        }),
        after: expect.objectContaining({
          permit_number: "SERVICE-777",
          jurisdiction: "Oakland",
          permit_date: "2026-04-26",
        }),
      }),
    );
  });

  it("allows same-account internal markJobFailedFromForm past scope preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { markJobFailedFromForm } = await import("@/lib/actions/job-actions");

    await expect(markJobFailedFromForm(buildJobOnlyFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1" }),
    );
    expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1" }),
    );
  });

  it("allows valid trial internal updateJobScheduleFromForm past entitlement preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_trial",
    });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
  });

  it("blocks expired trial internal updateJobScheduleFromForm before writes or emails", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_expired",
    });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("blocks null-ended trial internal updateJobScheduleFromForm before writes or emails", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_trial_missing_end",
    });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("allows internal comped updateJobScheduleFromForm past entitlement preflight", async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: "allowed_internal_comped",
    });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow("ALLOW_PATH_REACHED");
  });

  it("blocks missing entitlement internal updateJobScheduleFromForm before writes or emails", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: "blocked_missing_entitlement",
    });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns safe schedule_saved_notification_failed banner when scheduled-email side effects throw", async () => {
    const jobUpdates: Record<string, unknown>[] = [];
    const jobEvents: Record<string, unknown>[] = [];
    let jobSelectCount = 0;

    const before = {
      scheduled_date: null,
      window_start: null,
      window_end: null,
      ops_status: "need_to_schedule",
      job_type: "service",
      status: "open",
      field_complete: false,
      permit_number: null,
      jurisdiction: null,
      permit_date: null,
      pending_info_reason: null,
      follow_up_date: null,
      next_action_note: null,
      action_required_by: null,
    };

    const scheduledSnapshot = {
      id: "job-1",
      job_type: "service",
      customer_first_name: "Eddie",
      customer_last_name: "Test",
      customer_phone: null,
      customer_email: "eddie@compliancemattersca.com",
      job_address: "123 Main",
      city: "Town",
      scheduled_date: "2026-04-23",
      window_start: "08:00",
      window_end: "10:00",
      contractor_id: null,
      contractors: null,
      customers: { owner_user_id: "owner-1" },
      locations: { owner_user_id: "owner-1" },
    };

    const supabase = {
      from(table: string) {
        if (table === "jobs") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => {
                  jobSelectCount += 1;
                  if (jobSelectCount === 1) return { data: before, error: null };
                  return { data: scheduledSnapshot, error: null };
                }),
              })),
            })),
            update: vi.fn((payload: Record<string, unknown>) => {
              jobUpdates.push(payload);
              return {
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({ data: { id: "job-1" }, error: null })),
                  })),
                })),
              };
            }),
          };
        }

        if (table === "job_events") {
          return {
            insert: vi.fn((payload: Record<string, unknown>) => {
              jobEvents.push(payload);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: "evt-1" }, error: null })),
                })),
              };
            }),
          };
        }

        if (table === "notifications") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  contains: vi.fn(() => ({
                    in: vi.fn(() => ({
                      order: vi.fn(() => ({
                        limit: vi.fn(() => ({
                          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                        })),
                      })),
                    })),
                  })),
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      in: vi.fn(() => ({
                        order: vi.fn(() => ({
                          limit: vi.fn(() => ({
                            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                          })),
                        })),
                      })),
                    })),
                  })),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "notif-1" }, error: null })),
              })),
            })),
          };
        }

        if (table === "internal_business_profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    account_owner_user_id: "owner-1",
                    display_name: "Tenant Co",
                    support_email: null,
                    support_phone: null,
                    logo_url: null,
                    billing_mode: "external_billing",
                    created_at: "",
                    updated_at: "",
                  },
                  error: null,
                })),
              })),
            })),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });
    resolveNotificationAccountOwnerUserIdMock.mockRejectedValueOnce(new Error("owner resolution failed"));

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?banner=schedule_saved_notification_failed",
    );

    expect(resolveNotificationAccountOwnerUserIdMock).toHaveBeenCalled();
    expect(jobUpdates).toHaveLength(1);
    expect(jobEvents.length).toBeGreaterThan(0);
  });

  it("sends the normal customer scheduled confirmation on first schedule", async () => {
    const { supabase, jobsUpdates } = makeScheduleEmailFixture({
      beforeOverrides: {
        scheduled_date: null,
        window_start: null,
        window_end: null,
        ops_status: "need_to_schedule",
      },
      scheduledSnapshotOverrides: {
        scheduled_date: "2026-04-24",
        window_start: "09:00",
        window_end: "11:00",
      },
    });

    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await updateJobScheduleFromForm(buildScheduleOnlyFormData());

    expect(jobsUpdates).toHaveLength(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sendArgs = sendEmailMock.mock.calls[0]?.[0] as { subject?: string; html?: string };
    expect(String(sendArgs?.subject ?? "")).toContain("Job Scheduled");
    expect(String(sendArgs?.html ?? "")).toContain("Your appointment is scheduled");
    expect(String(sendArgs?.html ?? "")).not.toContain("Your schedule has been updated");
  });

  it("sends updated customer schedule confirmation wording on reschedule", async () => {
    const { supabase, jobsUpdates } = makeScheduleEmailFixture({
      beforeOverrides: {
        scheduled_date: "2026-04-20",
        window_start: "08:00",
        window_end: "10:00",
        ops_status: "scheduled",
      },
      scheduledSnapshotOverrides: {
        scheduled_date: "2026-04-24",
        window_start: "09:00",
        window_end: "11:00",
      },
    });

    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await updateJobScheduleFromForm(buildScheduleOnlyFormData());

    expect(jobsUpdates).toHaveLength(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sendArgs = sendEmailMock.mock.calls[0]?.[0] as { subject?: string; html?: string };
    expect(String(sendArgs?.subject ?? "")).toContain("Appointment Updated");
    expect(String(sendArgs?.html ?? "")).toContain("Your schedule has been updated");
    expect(String(sendArgs?.html ?? "")).toContain("your appointment has been rescheduled");
  });

  it("does not send schedule email when schedule details are unchanged", async () => {
    const { supabase, jobsUpdates, jobEvents } = makeScheduleEmailFixture({
      beforeOverrides: {
        scheduled_date: "2026-04-24",
        window_start: "09:00",
        window_end: "11:00",
        ops_status: "scheduled",
      },
      scheduledSnapshotOverrides: {
        scheduled_date: "2026-04-24",
        window_start: "09:00",
        window_end: "11:00",
      },
    });

    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await updateJobScheduleFromForm(buildScheduleOnlyFormData());

    expect(jobsUpdates).toHaveLength(0);
    expect(jobEvents).toHaveLength(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("keeps schedule update successful when schedule email send fails", async () => {
    const { supabase, jobsUpdates, jobEvents, notificationUpdates } = makeScheduleEmailFixture({
      beforeOverrides: {
        scheduled_date: null,
        window_start: null,
        window_end: null,
        ops_status: "need_to_schedule",
      },
      scheduledSnapshotOverrides: {
        scheduled_date: "2026-04-24",
        window_start: "09:00",
        window_end: "11:00",
      },
    });

    sendEmailMock.mockRejectedValueOnce(new Error("smtp offline"));
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: "job-1" });

    const { updateJobScheduleFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobScheduleFromForm(buildScheduleOnlyFormData())).resolves.toBeUndefined();

    expect(jobsUpdates).toHaveLength(1);
    expect(jobEvents.length).toBeGreaterThan(0);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(notificationUpdates.some((row) => String(row.status) === "failed")).toBe(true);
  });
});
