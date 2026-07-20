import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.fn();
const getEstimateByIdMock = vi.fn();
const isEstimateProposalLinksEnabledMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
  createClient: () => ({}),
}));

vi.mock("@/lib/estimates/estimate-read", () => ({
  getEstimateById: (...args: unknown[]) => getEstimateByIdMock(...args),
}));

vi.mock("@/lib/estimates/estimate-exposure", async () => {
  const actual = await vi.importActual<typeof import("@/lib/estimates/estimate-exposure")>(
    "@/lib/estimates/estimate-exposure"
  );
  return {
    ...actual,
    isEstimateProposalLinksEnabled: (...args: unknown[]) =>
      isEstimateProposalLinksEnabledMock(...args),
  };
});

const ACCOUNT_OWNER = "owner-1";
const ESTIMATE_ID = "est-1";

type CapturedDbCalls = {
  tables: string[];
  estimateUpdatePayload: Record<string, unknown> | null;
  estimateEventPayload: Record<string, unknown> | null;
  notificationInsertPayloads: Record<string, unknown>[];
};

function buildEstimate(overrides: Record<string, unknown> = {}) {
  return {
    id: ESTIMATE_ID,
    estimate_number: "EST-1001",
    account_owner_user_id: ACCOUNT_OWNER,
    status: "sent",
    options: [],
    ...overrides,
  };
}

function buildAdminClient(options?: {
  proposalLink?: Record<string, unknown> | null;
  proposalLinkError?: { code?: string; message?: string } | null;
  updateResultId?: string | null;
  updateError?: { code?: string; message?: string } | null;
  eventInsertError?: { code?: string; message?: string } | null;
  existingProposalApprovalNotificationId?: string | null;
  notificationInsertError?: { code?: string; message?: string } | null;
}) {
  const captured: CapturedDbCalls = {
    tables: [],
    estimateUpdatePayload: null,
    estimateEventPayload: null,
    notificationInsertPayloads: [],
  };

  const proposalLink = options?.proposalLink ?? null;
  const proposalLinkError = options?.proposalLinkError ?? null;
  const updateResultId = options?.updateResultId === undefined ? ESTIMATE_ID : options.updateResultId;
  const updateError = options?.updateError ?? null;
  const eventInsertError = options?.eventInsertError ?? null;
  const existingProposalApprovalNotificationId =
    options?.existingProposalApprovalNotificationId ?? null;
  const notificationInsertError = options?.notificationInsertError ?? null;

  const admin = {
    from: vi.fn((table: string) => {
      captured.tables.push(table);

      if (table === "estimate_proposal_links") {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({ data: proposalLink, error: proposalLinkError })),
        };
        return chain;
      }

      if (table === "estimates") {
        const chain: any = {
          update: vi.fn((payload: Record<string, unknown>) => {
            captured.estimateUpdatePayload = payload;
            return chain;
          }),
          eq: vi.fn(() => chain),
          select: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({
            data: updateResultId ? { id: updateResultId } : null,
            error: updateError,
          })),
        };
        return chain;
      }

      if (table === "estimate_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            captured.estimateEventPayload = payload;
            return { data: null, error: eventInsertError };
          }),
        };
      }

      if (table === "notifications") {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          contains: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({
            data: existingProposalApprovalNotificationId
              ? { id: existingProposalApprovalNotificationId }
              : null,
            error: null,
          })),
          insert: vi.fn((payload: Record<string, unknown>) => {
            captured.notificationInsertPayloads.push(payload);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: notificationInsertError ? null : { id: "notif-1" },
                  error: notificationInsertError,
                })),
              })),
            };
          }),
        };
        return chain;
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
        })),
      };
    }),
  };

  return { admin, captured };
}

describe("approveEstimateFromProposalLink", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    isEstimateProposalLinksEnabledMock.mockReturnValue(true);
  });

  it("approves a flat sent proposal with typed name", async () => {
    const { admin, captured } = buildAdminClient({
      proposalLink: {
        id: "plink-1",
        estimate_id: ESTIMATE_ID,
        account_owner_user_id: ACCOUNT_OWNER,
        status: "active",
        expires_at: "2099-01-01T00:00:00.000Z",
        revoked_at: null,
      },
    });
    createAdminClientMock.mockReturnValue(admin);
    getEstimateByIdMock.mockResolvedValue(buildEstimate());

    const { approveEstimateFromProposalLink } = await import(
      "@/lib/estimates/estimate-proposal-public-approval"
    );
    const result = await approveEstimateFromProposalLink({
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      approverName: "Taylor Customer",
      selectedOptionSlotIndex: null,
      approvalNote: "Please call before arrival.",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.proposalMode).toBe("single_option_flat");
    expect(captured.estimateUpdatePayload?.status).toBe("approved");
    expect(captured.estimateUpdatePayload?.selected_option_id).toBeNull();
    expect(captured.estimateEventPayload?.event_type).toBe("estimate_approved");
    expect(captured.estimateEventPayload?.meta).toMatchObject({
      response_source: "customer_proposal_link",
      proposal_link_id: "plink-1",
      approver_name: "Taylor Customer",
      selected_option_id: null,
    });
    expect(captured.notificationInsertPayloads).toHaveLength(1);
    expect(captured.notificationInsertPayloads[0]).toMatchObject({
      account_owner_user_id: ACCOUNT_OWNER,
      recipient_type: "internal",
      recipient_ref: null,
      channel: "in_app",
      notification_type: "internal_estimate_proposal_approved",
      subject: "Proposal Approved",
      body: "Taylor Customer approved estimate EST-1001.",
      status: "queued",
      payload: {
        source: "customer_proposal_link",
        estimate_id: ESTIMATE_ID,
        estimate_number: "EST-1001",
        proposal_link_id: "plink-1",
      },
    });
    expect(captured.tables).not.toContain("jobs");
    expect(captured.tables).not.toContain("invoices");
    expect(captured.tables).not.toContain("payments");
    expect(captured.tables).not.toContain("sms_messages");
  });

  it("requires selected option for multi-option proposals", async () => {
    const { admin } = buildAdminClient({
      proposalLink: {
        id: "plink-1",
        estimate_id: ESTIMATE_ID,
        account_owner_user_id: ACCOUNT_OWNER,
        status: "active",
        expires_at: "2099-01-01T00:00:00.000Z",
        revoked_at: null,
      },
    });
    createAdminClientMock.mockReturnValue(admin);
    getEstimateByIdMock.mockResolvedValue(
      buildEstimate({
        options: [
          {
            id: "opt-1",
            slot_index: 1,
            label: "Good",
            total_cents: 120000,
            line_items: [{ id: "line-1" }],
          },
        ],
      })
    );

    const { approveEstimateFromProposalLink } = await import(
      "@/lib/estimates/estimate-proposal-public-approval"
    );
    const result = await approveEstimateFromProposalLink({
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      approverName: "Taylor Customer",
      selectedOptionSlotIndex: null,
    });

    expect(result).toEqual({ success: false, error: "selected_option_required" });
  });

  it("persists selected option snapshots for multi-option approvals", async () => {
    const { admin, captured } = buildAdminClient({
      proposalLink: {
        id: "plink-1",
        estimate_id: ESTIMATE_ID,
        account_owner_user_id: ACCOUNT_OWNER,
        status: "active",
        expires_at: "2099-01-01T00:00:00.000Z",
        revoked_at: null,
      },
    });
    createAdminClientMock.mockReturnValue(admin);
    getEstimateByIdMock.mockResolvedValue(
      buildEstimate({
        options: [
          {
            id: "opt-1",
            slot_index: 1,
            label: "Good",
            total_cents: 120000,
          },
          {
            id: "opt-2",
            slot_index: 2,
            label: "Best",
            total_cents: 160000,
            line_items: [{ id: "line-2" }],
          },
        ],
      })
    );

    const { approveEstimateFromProposalLink } = await import(
      "@/lib/estimates/estimate-proposal-public-approval"
    );
    const result = await approveEstimateFromProposalLink({
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      approverName: "Taylor Customer",
      selectedOptionSlotIndex: 2,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.selectedOptionId).toBe("opt-2");
    expect(result.selectedOptionLabelSnapshot).toBe("Best");
    expect(result.selectedOptionTotalCents).toBe(160000);
    expect(captured.estimateUpdatePayload).toMatchObject({
      selected_option_id: "opt-2",
      selected_option_label_snapshot: "Best",
      selected_option_total_cents: 160000,
    });
    expect(captured.notificationInsertPayloads).toHaveLength(1);
    expect(captured.notificationInsertPayloads[0]?.body).toBe(
      "Taylor Customer approved Best for estimate EST-1001."
    );
  });

  it("blocks missing approver name", async () => {
    const { approveEstimateFromProposalLink } = await import(
      "@/lib/estimates/estimate-proposal-public-approval"
    );
    const result = await approveEstimateFromProposalLink({
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      approverName: "",
      selectedOptionSlotIndex: null,
    });

    expect(result).toEqual({ success: false, error: "approver_name_required" });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("blocks malformed and invalid tokens", async () => {
    const { admin } = buildAdminClient({ proposalLink: null });
    createAdminClientMock.mockReturnValue(admin);

    const { approveEstimateFromProposalLink } = await import(
      "@/lib/estimates/estimate-proposal-public-approval"
    );

    const malformed = await approveEstimateFromProposalLink({
      rawToken: "bad token",
      approverName: "Taylor Customer",
      selectedOptionSlotIndex: null,
    });
    const notFound = await approveEstimateFromProposalLink({
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      approverName: "Taylor Customer",
      selectedOptionSlotIndex: null,
    });

    expect(malformed).toEqual({ success: false, error: "proposal_unavailable" });
    expect(notFound).toEqual({ success: false, error: "proposal_unavailable" });
  });

  it("blocks revoked and expired links", async () => {
    const { admin: revokedAdmin } = buildAdminClient({
      proposalLink: {
        id: "plink-revoked",
        estimate_id: ESTIMATE_ID,
        account_owner_user_id: ACCOUNT_OWNER,
        status: "active",
        expires_at: "2099-01-01T00:00:00.000Z",
        revoked_at: "2026-05-01T00:00:00.000Z",
      },
    });
    const { admin: expiredAdmin } = buildAdminClient({
      proposalLink: {
        id: "plink-expired",
        estimate_id: ESTIMATE_ID,
        account_owner_user_id: ACCOUNT_OWNER,
        status: "active",
        expires_at: "2000-01-01T00:00:00.000Z",
        revoked_at: null,
      },
    });

    createAdminClientMock
      .mockReturnValueOnce(revokedAdmin)
      .mockReturnValueOnce(expiredAdmin);
    getEstimateByIdMock.mockResolvedValue(buildEstimate());

    const { approveEstimateFromProposalLink } = await import(
      "@/lib/estimates/estimate-proposal-public-approval"
    );
    const revokedResult = await approveEstimateFromProposalLink({
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      approverName: "Taylor Customer",
      selectedOptionSlotIndex: null,
    });
    const expiredResult = await approveEstimateFromProposalLink({
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      approverName: "Taylor Customer",
      selectedOptionSlotIndex: null,
    });

    expect(revokedResult).toEqual({ success: false, error: "proposal_unavailable" });
    expect(expiredResult).toEqual({ success: false, error: "proposal_unavailable" });
  });

  it.each(["draft", "approved", "converted"])(
    "blocks ineligible estimate status %s",
    async (status) => {
      const { admin } = buildAdminClient({
        proposalLink: {
          id: "plink-1",
          estimate_id: ESTIMATE_ID,
          account_owner_user_id: ACCOUNT_OWNER,
          status: "active",
          expires_at: "2099-01-01T00:00:00.000Z",
          revoked_at: null,
        },
      });
      createAdminClientMock.mockReturnValue(admin);
      getEstimateByIdMock.mockResolvedValue(buildEstimate({ status }));

      const { approveEstimateFromProposalLink } = await import(
        "@/lib/estimates/estimate-proposal-public-approval"
      );
      const result = await approveEstimateFromProposalLink({
        rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
        approverName: "Taylor Customer",
        selectedOptionSlotIndex: null,
      });

      expect(result).toEqual({ success: false, error: "proposal_unavailable" });
    }
  );

  it("blocks wrong estimate and option pairing", async () => {
    const { admin } = buildAdminClient({
      proposalLink: {
        id: "plink-1",
        estimate_id: ESTIMATE_ID,
        account_owner_user_id: ACCOUNT_OWNER,
        status: "active",
        expires_at: "2099-01-01T00:00:00.000Z",
        revoked_at: null,
      },
    });
    createAdminClientMock.mockReturnValue(admin);
    getEstimateByIdMock.mockResolvedValue(
      buildEstimate({
        options: [
          {
            id: "opt-1",
            slot_index: 1,
            label: "Good",
            total_cents: 120000,
          },
        ],
      })
    );

    const { approveEstimateFromProposalLink } = await import(
      "@/lib/estimates/estimate-proposal-public-approval"
    );
    const result = await approveEstimateFromProposalLink({
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      approverName: "Taylor Customer",
      selectedOptionSlotIndex: 2,
    });

    expect(result).toEqual({ success: false, error: "selected_option_invalid" });
  });

  it("writes customer_proposal_link event metadata and never stores raw token", async () => {
    const { admin, captured } = buildAdminClient({
      proposalLink: {
        id: "plink-1",
        estimate_id: ESTIMATE_ID,
        account_owner_user_id: ACCOUNT_OWNER,
        status: "active",
        expires_at: "2099-01-01T00:00:00.000Z",
        revoked_at: null,
      },
    });
    createAdminClientMock.mockReturnValue(admin);
    getEstimateByIdMock.mockResolvedValue(buildEstimate());

    const { approveEstimateFromProposalLink } = await import(
      "@/lib/estimates/estimate-proposal-public-approval"
    );

    const rawToken = "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789";
    const result = await approveEstimateFromProposalLink({
      rawToken,
      approverName: "Taylor Customer",
      selectedOptionSlotIndex: null,
      approvalNote: "Thanks.",
    });

    expect(result.success).toBe(true);
    const eventMeta = (captured.estimateEventPayload?.meta ?? {}) as Record<string, unknown>;
    expect(eventMeta.response_source).toBe("customer_proposal_link");
    expect(eventMeta.approver_name).toBe("Taylor Customer");
    expect(eventMeta.proposal_link_id).toBe("plink-1");
    const serializedMeta = JSON.stringify(eventMeta);
    expect(serializedMeta).not.toContain(rawToken);
    expect(serializedMeta).not.toContain("token_hash");

    const notificationPayload =
      (captured.notificationInsertPayloads[0]?.payload as Record<string, unknown> | undefined) ?? {};
    const serializedNotificationPayload = JSON.stringify(notificationPayload);
    expect(serializedNotificationPayload).not.toContain(rawToken);
    expect(serializedNotificationPayload).not.toContain("token_hash");
  });

  it("does not create duplicate internal notification when dedupe key already exists", async () => {
    const { admin, captured } = buildAdminClient({
      proposalLink: {
        id: "plink-1",
        estimate_id: ESTIMATE_ID,
        account_owner_user_id: ACCOUNT_OWNER,
        status: "active",
        expires_at: "2099-01-01T00:00:00.000Z",
        revoked_at: null,
      },
      existingProposalApprovalNotificationId: "notif-existing",
    });
    createAdminClientMock.mockReturnValue(admin);
    getEstimateByIdMock.mockResolvedValue(buildEstimate());

    const { approveEstimateFromProposalLink } = await import(
      "@/lib/estimates/estimate-proposal-public-approval"
    );
    const result = await approveEstimateFromProposalLink({
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      approverName: "Taylor Customer",
      selectedOptionSlotIndex: null,
    });

    expect(result.success).toBe(true);
    expect(captured.notificationInsertPayloads).toHaveLength(0);
  });

  it("stale already-approved requests do not write duplicate notifications", async () => {
    const { admin, captured } = buildAdminClient({
      proposalLink: {
        id: "plink-1",
        estimate_id: ESTIMATE_ID,
        account_owner_user_id: ACCOUNT_OWNER,
        status: "active",
        expires_at: "2099-01-01T00:00:00.000Z",
        revoked_at: null,
      },
      updateResultId: null,
    });
    createAdminClientMock.mockReturnValue(admin);
    getEstimateByIdMock.mockResolvedValue(buildEstimate());

    const { approveEstimateFromProposalLink } = await import(
      "@/lib/estimates/estimate-proposal-public-approval"
    );
    const result = await approveEstimateFromProposalLink({
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      approverName: "Taylor Customer",
      selectedOptionSlotIndex: null,
    });

    expect(result).toEqual({ success: false, error: "proposal_unavailable" });
    expect(captured.notificationInsertPayloads).toHaveLength(0);
  });

  it("keeps approval truth when internal notification insert fails", async () => {
    const { admin, captured } = buildAdminClient({
      proposalLink: {
        id: "plink-1",
        estimate_id: ESTIMATE_ID,
        account_owner_user_id: ACCOUNT_OWNER,
        status: "active",
        expires_at: "2099-01-01T00:00:00.000Z",
        revoked_at: null,
      },
      notificationInsertError: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
    });
    createAdminClientMock.mockReturnValue(admin);
    getEstimateByIdMock.mockResolvedValue(buildEstimate());

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { approveEstimateFromProposalLink } = await import(
      "@/lib/estimates/estimate-proposal-public-approval"
    );
    const result = await approveEstimateFromProposalLink({
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      approverName: "Taylor Customer",
      selectedOptionSlotIndex: null,
    });

    expect(result.success).toBe(true);
    expect(captured.estimateUpdatePayload?.status).toBe("approved");
    expect(captured.estimateEventPayload?.event_type).toBe("estimate_approved");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("fails closed when proposal link schema is unavailable", async () => {
    const { admin } = buildAdminClient({
      proposalLinkError: {
        code: "42P01",
        message: "relation estimate_proposal_links does not exist",
      },
    });
    createAdminClientMock.mockReturnValue(admin);

    const { approveEstimateFromProposalLink } = await import(
      "@/lib/estimates/estimate-proposal-public-approval"
    );
    const result = await approveEstimateFromProposalLink({
      rawToken: "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789",
      approverName: "Taylor Customer",
      selectedOptionSlotIndex: null,
    });

    expect(result).toEqual({ success: false, error: "proposal_unavailable" });
  });
});
