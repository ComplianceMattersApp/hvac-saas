import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const evaluateJobOpsStatusMock = vi.fn();
const healStalePaperworkOpsStatusMock = vi.fn();
const forceSetOpsStatusMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  requireInternalRole: vi.fn(),
  isInternalAccessError: vi.fn(() => false),
}));

vi.mock("@/lib/auth/internal-job-scope", () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
  loadScopedInternalServiceCaseForMutation: vi.fn(),
}));

vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) =>
    resolveBillingModeByAccountOwnerIdMock(...args),
  resolveInternalBusinessIdentityByAccountOwnerId: vi.fn(),
}));

vi.mock("@/lib/actions/job-evaluator", () => ({
  evaluateJobOpsStatus: (...args: unknown[]) => evaluateJobOpsStatusMock(...args),
  healStalePaperworkOpsStatus: (...args: unknown[]) => healStalePaperworkOpsStatusMock(...args),
}));

vi.mock("@/lib/actions/ops-status", () => ({
  forceSetOpsStatus: (...args: unknown[]) => forceSetOpsStatusMock(...args),
}));

vi.mock("@/lib/actions/ecc-status", () => ({
  evaluateEccOpsStatus: vi.fn(async () => undefined),
}));

vi.mock("@/lib/actions/job-ops-actions", () => ({
  releasePendingInfoAndRecompute: vi.fn(async () => null),
  releaseAndReevaluate: vi.fn(async () => null),
}));

vi.mock("@/lib/actions/job-event-meta", () => ({
  buildMovementEventMeta: vi.fn(() => ({})),
  buildStaffingSnapshotMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

type JobRecord = {
  id: string;
  job_type: string;
  ops_status: string | null;
  invoice_number: string | null;
  invoice_complete: boolean;
  data_entry_completed_at: string | null;
};

function makeJobEventsSelectChain() {
  const chain = {
    eq: vi.fn(() => chain),
    contains: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };

  return chain;
}

function makeAllowSupabaseFixture(options?: { job?: Partial<JobRecord> }) {
  const jobUpdates: Array<{ values: Record<string, unknown>; eq: Array<[string, unknown]> }> = [];
  const jobEventInserts: Array<Record<string, unknown>> = [];
  const jobRecord: JobRecord = {
    id: "job-1",
    job_type: "service",
    ops_status: "scheduled",
    invoice_number: null,
    invoice_complete: false,
    data_entry_completed_at: null,
    ...options?.job,
  };

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: jobRecord, error: null })),
              maybeSingle: vi.fn(async () => ({ data: jobRecord, error: null })),
            })),
          })),
          update(values: Record<string, unknown>) {
            const record = { values, eq: [] as Array<[string, unknown]> };
            jobUpdates.push(record);
            return {
              eq(column: string, value: unknown) {
                record.eq.push([column, value]);
                return {
                  error: null,
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({ data: { id: value }, error: null })),
                  })),
                };
              },
            };
          },
        };
      }

      if (table === "job_events") {
        return {
          select: vi.fn(() => makeJobEventsSelectChain()),
          insert(values: Record<string, unknown>) {
            jobEventInserts.push(values);
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, jobUpdates, jobEventInserts };
}

function makeDenySupabaseFixture() {
  const writeCalls: Array<{ table: string; method: "update" | "insert" }> = [];

  const supabase = {
    from(table: string) {
      if (table === "jobs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: "job-1",
                  job_type: "service",
                  ops_status: "scheduled",
                  invoice_number: null,
                  invoice_complete: false,
                  data_entry_completed_at: null,
                },
                error: null,
              })),
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
          update: vi.fn(() => {
            writeCalls.push({ table, method: "update" });
            return {
              eq: vi.fn(() => ({
                error: null,
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            };
          }),
        };
      }

      if (table === "job_events") {
        return {
          select: vi.fn(() => makeJobEventsSelectChain()),
          insert: vi.fn(() => {
            writeCalls.push({ table, method: "insert" });
            return Promise.resolve({ error: null });
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase, writeCalls };
}

function buildUpdateJobCustomerFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("customer_first_name", "Taylor");
  formData.set("customer_last_name", "Bennett");
  formData.set("customer_email", "taylor@example.com");
  formData.set("customer_phone", "555-0100");
  formData.set("job_notes", "Updated scoped notes");
  return formData;
}

function buildAddPublicNoteFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("note", "Customer confirmed site access.");
  formData.set("tab", "ops");
  return formData;
}

function buildAddInternalNoteFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("note", "Internal follow-up logged.");
  formData.set("tab", "ops");
  formData.set("context", "contractor_report_review");
  formData.set("anchor_event_id", "event-1");
  formData.set("anchor_event_type", "report_review_requested");
  return formData;
}

function buildCompleteDataEntryFormData() {
  const formData = new FormData();
  formData.set("job_id", "job-1");
  formData.set("invoice_number", "INV-1001");
  return formData;
}

describe("internal job-detail customer/notes/data-entry same-account hardening", () => {
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
    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue("external_billing");
    evaluateJobOpsStatusMock.mockResolvedValue(undefined);
    healStalePaperworkOpsStatusMock.mockResolvedValue(true);
    forceSetOpsStatusMock.mockResolvedValue(undefined);
  });

  it("allows same-account internal updateJobCustomerFromForm past scoped-job preflight", async () => {
    const { supabase, jobUpdates, jobEventInserts } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { updateJobCustomerFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobCustomerFromForm(buildUpdateJobCustomerFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1",
    );

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1", select: "id" }),
    );
    expect(jobUpdates).toContainEqual({
      values: {
        customer_first_name: "Taylor",
        customer_last_name: "Bennett",
        customer_email: "taylor@example.com",
        customer_phone: "555-0100",
        job_notes: "Updated scoped notes",
      },
      eq: [["id", "job-1"]],
    });
    expect(jobEventInserts).toHaveLength(0);
  });

  it("allows same-account internal addPublicNoteFromForm past scoped-job preflight", async () => {
    const { supabase, jobEventInserts } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { addPublicNoteFromForm } = await import("@/lib/actions/job-actions");

    await expect(addPublicNoteFromForm(buildAddPublicNoteFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=note_added",
    );

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1", select: "id" }),
    );
    expect(jobEventInserts).toContainEqual({
      job_id: "job-1",
      event_type: "public_note",
      meta: { note: "Customer confirmed site access." },
      user_id: "internal-user-1",
    });
  });

  it("allows same-account internal addInternalNoteFromForm past scoped-job preflight", async () => {
    const { supabase, jobEventInserts } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { addInternalNoteFromForm } = await import("@/lib/actions/job-actions");

    await expect(addInternalNoteFromForm(buildAddInternalNoteFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?tab=ops&banner=follow_up_note_added",
    );

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1", select: "id" }),
    );
    expect(jobEventInserts).toContainEqual({
      job_id: "job-1",
      event_type: "internal_note",
      meta: {
        note: "Internal follow-up logged.",
        context: "contractor_report_review",
        anchor_event_id: "event-1",
        anchor_event_type: "report_review_requested",
      },
      user_id: "internal-user-1",
    });
  });

  it("allows same-account internal completeDataEntryFromForm past scoped-job preflight", async () => {
    const { supabase, jobUpdates, jobEventInserts } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);

    const { completeDataEntryFromForm } = await import("@/lib/actions/job-actions");

    await expect(completeDataEntryFromForm(buildCompleteDataEntryFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1",
    );

    expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "owner-1", jobId: "job-1", select: "id" }),
    );
    expect(resolveBillingModeByAccountOwnerIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ supabase, accountOwnerUserId: "owner-1" }),
    );
    expect(jobUpdates).toEqual(
      expect.arrayContaining([
        {
          values: {
            invoice_number: "INV-1001",
            invoice_complete: true,
            data_entry_completed_at: expect.any(String),
          },
          eq: [["id", "job-1"]],
        },
      ]),
    );
    expect(jobEventInserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          job_id: "job-1",
          event_type: "ops_update",
          user_id: "internal-user-1",
        }),
      ]),
    );
    expect(forceSetOpsStatusMock).toHaveBeenCalledWith("job-1", "closed");
    expect(evaluateJobOpsStatusMock).not.toHaveBeenCalled();
    expect(healStalePaperworkOpsStatusMock).not.toHaveBeenCalled();
  });

  it("denies cross-account internal updateJobCustomerFromForm before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { updateJobCustomerFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobCustomerFromForm(buildUpdateJobCustomerFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("denies cross-account internal addPublicNoteFromForm before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { addPublicNoteFromForm } = await import("@/lib/actions/job-actions");

    await expect(addPublicNoteFromForm(buildAddPublicNoteFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("denies cross-account internal addInternalNoteFromForm before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { addInternalNoteFromForm } = await import("@/lib/actions/job-actions");

    await expect(addInternalNoteFromForm(buildAddInternalNoteFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("denies cross-account internal completeDataEntryFromForm before jobs/job_events writes or ops projection work", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    const { completeDataEntryFromForm } = await import("@/lib/actions/job-actions");

    await expect(completeDataEntryFromForm(buildCompleteDataEntryFormData())).rejects.toThrow(
      "REDIRECT:/jobs/job-1?notice=not_authorized",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(resolveBillingModeByAccountOwnerIdMock).not.toHaveBeenCalled();
    expect(forceSetOpsStatusMock).not.toHaveBeenCalled();
    expect(evaluateJobOpsStatusMock).not.toHaveBeenCalled();
    expect(healStalePaperworkOpsStatusMock).not.toHaveBeenCalled();
  });

  it("denies non-internal updateJobCustomerFromForm before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const { updateJobCustomerFromForm } = await import("@/lib/actions/job-actions");

    await expect(updateJobCustomerFromForm(buildUpdateJobCustomerFormData())).rejects.toThrow(
      "Active internal user required.",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("denies non-internal addPublicNoteFromForm before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const { addPublicNoteFromForm } = await import("@/lib/actions/job-actions");

    await expect(addPublicNoteFromForm(buildAddPublicNoteFormData())).rejects.toThrow(
      "Active internal user required.",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("denies non-internal addInternalNoteFromForm before jobs/job_events writes", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const { addInternalNoteFromForm } = await import("@/lib/actions/job-actions");

    await expect(addInternalNoteFromForm(buildAddInternalNoteFormData())).rejects.toThrow(
      "Active internal user required.",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
  });

  it("denies non-internal completeDataEntryFromForm before jobs/job_events writes or ops projection work", async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("Active internal user required."));

    const { completeDataEntryFromForm } = await import("@/lib/actions/job-actions");

    await expect(completeDataEntryFromForm(buildCompleteDataEntryFormData())).rejects.toThrow(
      "Active internal user required.",
    );

    expect(writeCalls.filter((call) => ["jobs", "job_events"].includes(call.table))).toHaveLength(0);
    expect(resolveBillingModeByAccountOwnerIdMock).not.toHaveBeenCalled();
    expect(forceSetOpsStatusMock).not.toHaveBeenCalled();
    expect(evaluateJobOpsStatusMock).not.toHaveBeenCalled();
    expect(healStalePaperworkOpsStatusMock).not.toHaveBeenCalled();
  });
});