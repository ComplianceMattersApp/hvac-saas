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
};

function buildEstimate(overrides: Record<string, unknown> = {}) {
  return {
    id: ESTIMATE_ID,
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
}) {
  const captured: CapturedDbCalls = {
    tables: [],
    estimateUpdatePayload: null,
    estimateEventPayload: null,
  };

  const proposalLink = options?.proposalLink ?? null;
  const proposalLinkError = options?.proposalLinkError ?? null;
  const updateResultId = options?.updateResultId === undefined ? ESTIMATE_ID : options.updateResultId;
  const updateError = options?.updateError ?? null;
  const eventInsertError = options?.eventInsertError ?? null;

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
    expect(captured.tables).toEqual([
      "estimate_proposal_links",
      "estimates",
      "estimate_events",
    ]);
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
