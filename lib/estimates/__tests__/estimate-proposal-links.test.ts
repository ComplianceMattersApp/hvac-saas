import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isEstimatesEnabledMock = vi.fn();
const sendEmailMock = vi.fn();
const smsProviderMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: () => ({}),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock("@/lib/estimates/estimate-exposure", () => ({
  isEstimatesEnabled: (...args: unknown[]) => isEstimatesEnabledMock(...args),
}));

vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock("@/lib/communications/sms-provider-delivery-preflight", () => ({
  runSmsProviderDeliveryPreflight: (...args: unknown[]) => smsProviderMock(...args),
}));

const ACCOUNT_OWNER = "owner-aaa";
const USER_ID = "user-111";
const ESTIMATE_ID = "est-001";

function makeInternalUser(accountOwnerUserId = ACCOUNT_OWNER) {
  return {
    internalUser: {
      user_id: USER_ID,
      account_owner_user_id: accountOwnerUserId,
      role: "admin" as const,
      is_active: true,
    },
  };
}

function makeEstimateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ESTIMATE_ID,
    status: "sent",
    account_owner_user_id: ACCOUNT_OWNER,
    ...overrides,
  };
}

function makeProposalLinkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "plink-001",
    estimate_id: ESTIMATE_ID,
    account_owner_user_id: ACCOUNT_OWNER,
    token_hash: "hash-001",
    recipient_email_snapshot: "owner@client.com",
    status: "active",
    created_at: "2026-05-23T12:00:00.000Z",
    created_by_user_id: USER_ID,
    expires_at: "2026-06-06T12:00:00.000Z",
    revoked_at: null,
    revoked_by_user_id: null,
    last_viewed_at: null,
    last_viewed_ip_hash: null,
    last_user_agent_hash: null,
    sent_at: null,
    last_sent_at: null,
    ...overrides,
  };
}

function makeSupabaseClient(options?: {
  estimateRow?: Record<string, unknown> | null;
  proposalLinkRows?: Array<Record<string, unknown>>;
  insertProposalLinkError?: string | null;
  estimateError?: string | null;
}) {
  const estimateRow =
    options && Object.prototype.hasOwnProperty.call(options, "estimateRow")
      ? options.estimateRow ?? null
      : makeEstimateRow();
  const proposalLinkRows = [...(options?.proposalLinkRows ?? [])].map((row) => ({ ...row }));
  const insertedEvents: Array<Record<string, unknown>> = [];
  const estimateUpdatePayloads: Array<Record<string, unknown>> = [];

  function normalizeFilterValue(value: unknown) {
    return value === null ? null : String(value);
  }

  function matchesWhere(row: Record<string, unknown>, where: Array<Record<string, unknown>>) {
    return where.every((clause) => {
      const current = row[clause.column as keyof typeof row];
      if (clause.type === "eq") return normalizeFilterValue(current) === normalizeFilterValue(clause.value);
      if (clause.type === "is") return current === clause.value;
      if (clause.type === "gt") return String(current ?? "") > String(clause.value ?? "");
      if (clause.type === "lte") return String(current ?? "") <= String(clause.value ?? "");
      return false;
    });
  }

  function buildSelectChain(table: string, where: Array<Record<string, unknown>>) {
    const chain: any = {
      eq: vi.fn((column: string, value: unknown) => {
        where.push({ type: "eq", column, value });
        return chain;
      }),
      is: vi.fn((column: string, value: unknown) => {
        where.push({ type: "is", column, value });
        return chain;
      }),
      gt: vi.fn((column: string, value: unknown) => {
        where.push({ type: "gt", column, value });
        return chain;
      }),
      maybeSingle: vi.fn(async () => {
        if (table === "estimates") {
          if (options?.estimateError) {
            return { data: null, error: { message: options.estimateError } };
          }

          if (!estimateRow) return { data: null, error: null };
          const ok = matchesWhere(estimateRow as Record<string, unknown>, where);
          return { data: ok ? estimateRow : null, error: null };
        }

        if (table === "estimate_proposal_links") {
          const matched = proposalLinkRows.filter((row) => matchesWhere(row, where));
          return { data: matched[0] ?? null, error: null };
        }

        return { data: null, error: null };
      }),
    };
    return chain;
  }

  function buildUpdateChain(table: string, patch: Record<string, unknown>, where: Array<Record<string, unknown>>) {
    const chain: any = {
      eq: vi.fn((column: string, value: unknown) => {
        where.push({ type: "eq", column, value });
        return chain;
      }),
      is: vi.fn((column: string, value: unknown) => {
        where.push({ type: "is", column, value });
        return chain;
      }),
      lte: vi.fn((column: string, value: unknown) => {
        where.push({ type: "lte", column, value });
        return chain;
      }),
      then: (resolve: (value: { data: null; error: null }) => unknown) => {
        if (table === "estimate_proposal_links") {
          for (const row of proposalLinkRows) {
            if (matchesWhere(row, where)) {
              Object.assign(row, patch);
            }
          }
        }

        if (table === "estimates") {
          estimateUpdatePayloads.push(patch);
        }

        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return chain;
  }

  return {
    from: vi.fn((table: string) => {
      if (table === "estimates") {
        return {
          select: vi.fn(() => buildSelectChain(table, [])),
          update: vi.fn((patch: Record<string, unknown>) => buildUpdateChain(table, patch, [])),
        };
      }

      if (table === "estimate_proposal_links") {
        return {
          select: vi.fn(() => buildSelectChain(table, [])),
          update: vi.fn((patch: Record<string, unknown>) => buildUpdateChain(table, patch, [])),
          insert: vi.fn((payload: Record<string, unknown>) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                if (options?.insertProposalLinkError) {
                  return { data: null, error: { message: options.insertProposalLinkError } };
                }

                const inserted: Record<string, unknown> = {
                  id: `plink-${proposalLinkRows.length + 1}`,
                  ...payload,
                };
                proposalLinkRows.push(inserted);
                return {
                  data: {
                    id: inserted.id,
                    recipient_email_snapshot: inserted.recipient_email_snapshot ?? null,
                    expires_at: inserted.expires_at,
                    status: inserted.status,
                  },
                  error: null,
                };
              }),
            })),
          })),
        };
      }

      if (table === "estimate_events") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            insertedEvents.push(payload);
            return { error: null };
          }),
        };
      }

      return {
        select: vi.fn(() => buildSelectChain(table, [])),
        update: vi.fn((patch: Record<string, unknown>) => buildUpdateChain(table, patch, [])),
        insert: vi.fn(async () => ({ data: null, error: null })),
      };
    }),
    _proposalLinkRows: proposalLinkRows,
    _insertedEvents: insertedEvents,
    _estimateUpdatePayloads: estimateUpdatePayloads,
  };
}

describe("estimate proposal link foundation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    isEstimatesEnabledMock.mockReturnValue(true);
    requireInternalUserMock.mockResolvedValue(makeInternalUser());
  });

  it("issues one active link for a sent estimate and persists only token hash", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { issueEstimateProposalLink } = await import("@/lib/estimates/estimate-proposal-links");
    const result = await issueEstimateProposalLink({
      estimateId: ESTIMATE_ID,
      recipientEmailSnapshot: "Owner@Client.com",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.rawToken.length).toBeGreaterThanOrEqual(43);
    expect(supabase._proposalLinkRows).toHaveLength(1);
    expect(supabase._proposalLinkRows[0].token_hash).not.toBe(result.rawToken);
    expect(supabase._proposalLinkRows[0]).not.toHaveProperty("raw_token");
    expect(supabase._proposalLinkRows[0].recipient_email_snapshot).toBe("owner@client.com");
    expect(supabase._proposalLinkRows[0].account_owner_user_id).toBe(ACCOUNT_OWNER);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(smsProviderMock).not.toHaveBeenCalled();
  });

  it("returns a deterministic already_exists result when an active link exists", async () => {
    const supabase = makeSupabaseClient({
      proposalLinkRows: [makeProposalLinkRow()],
    });
    createClientMock.mockResolvedValue(supabase);

    const { issueEstimateProposalLink } = await import("@/lib/estimates/estimate-proposal-links");
    const result = await issueEstimateProposalLink({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(false);
    expect(result).toMatchObject({
      code: "already_exists",
      proposalLinkId: "plink-001",
    });
    expect(supabase._proposalLinkRows).toHaveLength(1);
  });

  it("regenerates by revoking the old active link and creating one new active link", async () => {
    const supabase = makeSupabaseClient({
      proposalLinkRows: [makeProposalLinkRow()],
    });
    createClientMock.mockResolvedValue(supabase);

    const { regenerateEstimateProposalLink } = await import("@/lib/estimates/estimate-proposal-links");
    const result = await regenerateEstimateProposalLink({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(supabase._proposalLinkRows).toHaveLength(2);
    expect(supabase._proposalLinkRows[0].status).toBe("revoked");
    expect(supabase._proposalLinkRows[0].revoked_at).toBeTruthy();
    expect(supabase._proposalLinkRows[1].status).toBe("active");

    const event = supabase._insertedEvents[0] as { event_type: string; meta: Record<string, unknown> };
    expect(event.event_type).toBe("estimate_proposal_link_regenerated");
    expect(event.meta.revoked_previous_link_id).toBe("plink-001");
    expect(JSON.stringify(event.meta)).not.toContain(result.rawToken);
  });

  it("revoke marks an active link revoked and writes an event", async () => {
    const supabase = makeSupabaseClient({
      proposalLinkRows: [makeProposalLinkRow()],
    });
    createClientMock.mockResolvedValue(supabase);

    const { revokeEstimateProposalLink } = await import("@/lib/estimates/estimate-proposal-links");
    const result = await revokeEstimateProposalLink({ estimateId: ESTIMATE_ID });

    expect(result).toEqual({
      success: true,
      revoked: true,
      proposalLinkId: "plink-001",
      status: "revoked",
    });
    expect(supabase._proposalLinkRows[0].status).toBe("revoked");
    expect((supabase._insertedEvents[0] as { event_type: string }).event_type).toBe(
      "estimate_proposal_link_revoked"
    );
  });

  it("revoke is safe when no active link exists", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { revokeEstimateProposalLink } = await import("@/lib/estimates/estimate-proposal-links");
    const result = await revokeEstimateProposalLink({ estimateId: ESTIMATE_ID });

    expect(result).toEqual({
      success: true,
      revoked: false,
      proposalLinkId: null,
      status: null,
    });
    expect(supabase._insertedEvents).toHaveLength(0);
  });

  it("expires stale active rows before issuing a new link", async () => {
    const supabase = makeSupabaseClient({
      proposalLinkRows: [
        makeProposalLinkRow({
          id: "plink-expired",
          expires_at: "2026-01-01T00:00:00.000Z",
        }),
      ],
    });
    createClientMock.mockResolvedValue(supabase);

    const { issueEstimateProposalLink } = await import("@/lib/estimates/estimate-proposal-links");
    const result = await issueEstimateProposalLink({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(true);
    expect(supabase._proposalLinkRows[0].status).toBe("expired");
    expect(supabase._proposalLinkRows[1].status).toBe("active");
  });

  it("does not treat revoked rows as active", async () => {
    const supabase = makeSupabaseClient({
      proposalLinkRows: [makeProposalLinkRow({ status: "revoked", revoked_at: "2026-05-23T12:01:00.000Z" })],
    });
    createClientMock.mockResolvedValue(supabase);

    const { issueEstimateProposalLink } = await import("@/lib/estimates/estimate-proposal-links");
    const result = await issueEstimateProposalLink({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(true);
    expect(supabase._proposalLinkRows).toHaveLength(2);
  });

  it("blocks wrong-account estimates", async () => {
    const supabase = makeSupabaseClient({ estimateRow: null });
    createClientMock.mockResolvedValue(supabase);

    const { issueEstimateProposalLink } = await import("@/lib/estimates/estimate-proposal-links");
    const result = await issueEstimateProposalLink({ estimateId: ESTIMATE_ID });

    expect(result).toEqual({
      success: false,
      error: "Estimate not found in this account.",
    });
  });

  it("enforces internal-user requirement", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);
    requireInternalUserMock.mockRejectedValue(new Error("NOT_INTERNAL_USER"));

    const { issueEstimateProposalLink } = await import("@/lib/estimates/estimate-proposal-links");

    await expect(issueEstimateProposalLink({ estimateId: ESTIMATE_ID })).rejects.toThrow(
      /NOT_INTERNAL_USER/
    );
  });

  it.each(["draft", "approved", "declined", "expired", "cancelled", "converted"])(
    "blocks ineligible estimate status %s",
    async (status) => {
      const supabase = makeSupabaseClient({
        estimateRow: makeEstimateRow({ status }),
      });
      createClientMock.mockResolvedValue(supabase);

      const { issueEstimateProposalLink } = await import("@/lib/estimates/estimate-proposal-links");
      const result = await issueEstimateProposalLink({ estimateId: ESTIMATE_ID });

      expect(result.success).toBe(false);
      expect((result as { error: string }).error).toMatch(/require estimate status 'sent'/i);
    }
  );

  it("does not mutate estimate status while issuing", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { issueEstimateProposalLink } = await import("@/lib/estimates/estimate-proposal-links");
    await issueEstimateProposalLink({ estimateId: ESTIMATE_ID });

    expect(supabase._estimateUpdatePayloads).toHaveLength(0);
  });

  it("surfaces token hash uniqueness insert failures without persisting a raw token", async () => {
    const supabase = makeSupabaseClient({
      insertProposalLinkError: "duplicate key value violates unique constraint estimate_proposal_links_token_hash_unique",
    });
    createClientMock.mockResolvedValue(supabase);

    const { issueEstimateProposalLink } = await import("@/lib/estimates/estimate-proposal-links");
    const result = await issueEstimateProposalLink({ estimateId: ESTIMATE_ID });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/duplicate key value/i);
    expect(supabase._proposalLinkRows).toHaveLength(0);
  });

  it("writes expected event metadata and never includes the raw token", async () => {
    const supabase = makeSupabaseClient();
    createClientMock.mockResolvedValue(supabase);

    const { issueEstimateProposalLink } = await import("@/lib/estimates/estimate-proposal-links");
    const result = await issueEstimateProposalLink({
      estimateId: ESTIMATE_ID,
      recipientEmailSnapshot: "Sales@Client.com",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const event = supabase._insertedEvents[0] as { event_type: string; meta: Record<string, unknown> };
    expect(event.event_type).toBe("estimate_proposal_link_issued");
    expect(event.meta).toMatchObject({
      proposal_link_id: result.proposalLinkId,
      recipient_email_snapshot: "sales@client.com",
      issued_by_user_id: USER_ID,
      proposal_link_status_snapshot: "active",
      source: "internal",
      link_delivery_mode: "manual_link_foundation",
    });
    expect(JSON.stringify(event.meta)).not.toContain(result.rawToken);
    expect(JSON.stringify(event.meta)).not.toContain("last_user_agent");
    expect(JSON.stringify(event.meta)).not.toContain("last_viewed_ip");
  });
});