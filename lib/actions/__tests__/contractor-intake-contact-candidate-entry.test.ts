import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const isInternalAccessErrorMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();
const createJobMock = vi.fn();
const ensureActiveAssignmentAndNotifyMock = vi.fn();
const markInternalNewWorkNotificationsResolvedMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
  isInternalAccessError: (...args: unknown[]) => isInternalAccessErrorMock(...args),
}));

vi.mock("@/lib/business/platform-entitlement", () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
}));

vi.mock("@/lib/actions/job-actions", () => ({
  createJob: (...args: unknown[]) => createJobMock(...args),
  ensureActiveAssignmentAndNotify: (...args: unknown[]) => ensureActiveAssignmentAndNotifyMock(...args),
}));

vi.mock("@/lib/actions/notification-actions", () => ({
  markInternalNewWorkNotificationsResolved: (...args: unknown[]) =>
    markInternalNewWorkNotificationsResolvedMock(...args),
}));

function buildEntryFormData(overrides?: Record<string, string>) {
  const formData = new FormData();
  formData.set("submission_id", "11111111-1111-4111-8111-111111111111");
  formData.set("proposed_role", "responsible_party");
  formData.set("display_name", "Casey Rivera");
  formData.set("phone", "+15551234567");
  formData.set("email", "casey@example.com");
  formData.set("preferred_contact_method", "phone");
  formData.set("proposed_link_target", "default_from_role");
  formData.set("notes", "Dispatch primary");
  formData.set("account_owner_user_id", "spoofed-owner");

  for (const [key, value] of Object.entries(overrides ?? {})) {
    formData.set(key, value);
  }

  return formData;
}

function makeAdminFixture(params?: {
  submissionOwnerUserId?: string;
  failInsert?: boolean;
}) {
  const submissionOwner = params?.submissionOwnerUserId ?? "owner-1";

  const submissionRow = {
    id: "11111111-1111-4111-8111-111111111111",
    account_owner_user_id: submissionOwner,
    submitted_by_user_id: "contractor-user-1",
    contractor_id: "contractor-1",
    proposed_customer_first_name: "Pat",
    proposed_customer_last_name: "Tester",
    proposed_customer_phone: "555-0101",
    proposed_customer_email: "pat@example.com",
    proposed_address_line1: "123 Main St",
    proposed_city: "Pasadena",
    proposed_state: "CA",
    proposed_zip: "91101",
    proposed_location_nickname: null,
    proposed_job_type: "ecc",
    proposed_project_type: "alteration",
    proposed_title: "Proposal",
    proposed_job_notes: "note",
    proposed_permit_number: null,
    proposed_jurisdiction: null,
    proposed_permit_date: null,
    review_status: "pending",
  };

  const insertRows: Array<Record<string, unknown>> = [];
  const fromCalls: string[] = [];

  const admin = {
    from(table: string) {
      fromCalls.push(table);
      if (table === "contractor_intake_submissions") {
        return {
          select: vi.fn(() => {
            const query: any = {
              eq: vi.fn(() => query),
              maybeSingle: vi.fn(async () => ({
                data: submissionOwner === "owner-1" ? submissionRow : null,
                error: null,
              })),
            };
            return query;
          }),
        };
      }

      if (table === "contractor_intake_contact_candidates") {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            insertRows.push(payload);
            if (params?.failInsert) {
              return Promise.resolve({ error: { code: "23514", message: "check violation" } });
            }
            return Promise.resolve({ error: null });
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin, submissionRow, insertRows, fromCalls };
}

describe("contractor intake contact candidate entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "internal-user-1" } },
          error: null,
        })),
      },
    });

    requireInternalRoleMock.mockResolvedValue({
      internalUser: {
        user_id: "internal-user-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    isInternalAccessErrorMock.mockImplementation((error: unknown) =>
      String((error as Error)?.message ?? "").includes("Active internal user required."),
    );

    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: "allowed_active",
    });
  });

  it("internal same-account user can create candidate", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { addContractorIntakeContactCandidateFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(addContractorIntakeContactCandidateFromForm(buildEntryFormData())).rejects.toThrow(
      `REDIRECT:/ops/admin/contractor-intake-submissions/${fixture.submissionRow.id}?notice=candidate_added`,
    );

    expect(fixture.insertRows).toHaveLength(1);
    expect(fixture.insertRows[0]?.source_role).toBe("internal");
    expect(fixture.insertRows[0]?.source_type).toBe("internal_review");
    expect(fixture.insertRows[0]?.status).toBe("proposed");
    expect(fixture.insertRows[0]?.proposed_link_target).toBe("customer");
  });

  it("out-of-account submission rejected", async () => {
    const fixture = makeAdminFixture({ submissionOwnerUserId: "owner-2" });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { addContractorIntakeContactCandidateFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(addContractorIntakeContactCandidateFromForm(buildEntryFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/contractor-intake-submissions/11111111-1111-4111-8111-111111111111?notice=candidate_add_failed",
    );

    expect(fixture.insertRows).toHaveLength(0);
  });

  it("contractor or portal actor rejected", async () => {
    requireInternalRoleMock.mockRejectedValueOnce(new Error("Active internal user required."));

    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { addContractorIntakeContactCandidateFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(addContractorIntakeContactCandidateFromForm(buildEntryFormData())).rejects.toThrow(
      "REDIRECT:/ops",
    );

    expect(fixture.insertRows).toHaveLength(0);
  });

  it("account owner cannot be spoofed from form", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { addContractorIntakeContactCandidateFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(addContractorIntakeContactCandidateFromForm(buildEntryFormData())).rejects.toThrow(
      `REDIRECT:/ops/admin/contractor-intake-submissions/${fixture.submissionRow.id}?notice=candidate_added`,
    );

    expect(fixture.insertRows[0]?.account_owner_user_id).toBe("owner-1");
    expect(fixture.insertRows[0]?.account_owner_user_id).not.toBe("spoofed-owner");
  });

  it("invalid role rejected", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { addContractorIntakeContactCandidateFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(
      addContractorIntakeContactCandidateFromForm(buildEntryFormData({ proposed_role: "invalid_role" })),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/contractor-intake-submissions/11111111-1111-4111-8111-111111111111?notice=candidate_add_failed",
    );

    expect(fixture.insertRows).toHaveLength(0);
  });

  it("invalid role and target pairing rejected", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { addContractorIntakeContactCandidateFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(
      addContractorIntakeContactCandidateFromForm(
        buildEntryFormData({ proposed_role: "site_access_contact", proposed_link_target: "customer" }),
      ),
    ).rejects.toThrow(
      "REDIRECT:/ops/admin/contractor-intake-submissions/11111111-1111-4111-8111-111111111111?notice=candidate_add_failed",
    );

    expect(fixture.insertRows).toHaveLength(0);
  });

  it("does not write contact_recipients or trigger side effects", async () => {
    const fixture = makeAdminFixture();
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { addContractorIntakeContactCandidateFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(addContractorIntakeContactCandidateFromForm(buildEntryFormData())).rejects.toThrow(
      `REDIRECT:/ops/admin/contractor-intake-submissions/${fixture.submissionRow.id}?notice=candidate_added`,
    );

    expect(fixture.fromCalls.includes("contact_recipients")).toBe(false);
    expect(createJobMock).not.toHaveBeenCalled();
    expect(ensureActiveAssignmentAndNotifyMock).not.toHaveBeenCalled();
    expect(markInternalNewWorkNotificationsResolvedMock).not.toHaveBeenCalled();
  });

  it("returns failed notice when insert fails", async () => {
    const fixture = makeAdminFixture({ failInsert: true });
    createAdminClientMock.mockReturnValue(fixture.admin);

    const { addContractorIntakeContactCandidateFromForm } = await import(
      "@/lib/actions/contractor-intake-actions"
    );

    await expect(addContractorIntakeContactCandidateFromForm(buildEntryFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/contractor-intake-submissions/11111111-1111-4111-8111-111111111111?notice=candidate_add_failed",
    );
  });
});
