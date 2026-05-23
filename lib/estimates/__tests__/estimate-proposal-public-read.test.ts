import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.fn();
const getEstimateByIdMock = vi.fn();
const resolveOperationalTenantIdentityMock = vi.fn();
const isEstimateProposalLinksEnabledMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
  createClient: () => ({}),
}));

vi.mock("@/lib/estimates/estimate-read", () => ({
  getEstimateById: (...args: unknown[]) => getEstimateByIdMock(...args),
}));

vi.mock("@/lib/email/operational-tenant-branding", () => ({
  resolveOperationalTenantIdentity: (...args: unknown[]) =>
    resolveOperationalTenantIdentityMock(...args),
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

const ACCOUNT_OWNER = "owner-aaa";
const ESTIMATE_ID = "est-001";

function buildEstimate(overrides: Record<string, unknown> = {}) {
  return {
    id: ESTIMATE_ID,
    account_owner_user_id: ACCOUNT_OWNER,
    estimate_number: "EST-20260523-ABC12345",
    customer_id: "cust-1",
    location_id: "loc-1",
    service_case_id: "sc-1",
    origin_job_id: null,
    status: "sent",
    title: "High-efficiency rooftop replacement",
    notes: "Internal scope note",
    subtotal_cents: 1200000,
    total_cents: 1295000,
    sent_at: "2026-05-23T16:00:00.000Z",
    approved_at: null,
    declined_at: null,
    expired_at: null,
    cancelled_at: null,
    converted_at: null,
    converted_job_id: null,
    converted_by_user_id: null,
    converted_invoice_id: null,
    selected_option_id: null,
    selected_option_label_snapshot: null,
    selected_option_total_cents: null,
    response_note: "Internal only",
    created_by_user_id: "user-1",
    updated_by_user_id: "user-1",
    created_at: "2026-05-22T16:00:00.000Z",
    updated_at: "2026-05-23T16:00:00.000Z",
    proposalMode: "single_option_flat",
    approvalResponseSchemaReady: true,
    conversionSchemaReady: true,
    invoiceConversionSchemaReady: true,
    line_items: [
      {
        id: "line-1",
        estimate_id: ESTIMATE_ID,
        source_pricebook_item_id: "pb-1",
        item_name_snapshot: "Packaged rooftop unit",
        description_snapshot: "Replace existing 10-ton unit with curb adapter.",
        item_type_snapshot: "material",
        category_snapshot: "equipment",
        unit_label_snapshot: "ea",
        quantity: 1,
        unit_price_cents: 1200000,
        line_subtotal_cents: 1200000,
        sort_order: 1,
        created_at: "2026-05-22T16:00:00.000Z",
        updated_at: "2026-05-23T16:00:00.000Z",
      },
    ],
    options: [],
    ...overrides,
  };
}

function buildAdminClient(options?: {
  proposalLink?: Record<string, unknown> | null;
  proposalLinkError?: { code?: string; message?: string } | null;
  locationRow?: Record<string, unknown> | null;
}) {
  const proposalLink = options?.proposalLink ?? null;
  const proposalLinkError = options?.proposalLinkError ?? null;
  const locationRow = options?.locationRow ?? {
    id: "loc-1",
    address_line1: "100 Main St",
    address_line2: null,
    city: "Fresno",
    state: "CA",
    zip: "93720",
    nickname: null,
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "estimate_proposal_links") {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({ data: proposalLink, error: proposalLinkError })),
        };
        return chain;
      }

      if (table === "locations") {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({ data: locationRow, error: null })),
        };
        return chain;
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    }),
  };
}

describe("readPublicEstimateProposalByToken", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    isEstimateProposalLinksEnabledMock.mockReturnValue(true);
    resolveOperationalTenantIdentityMock.mockResolvedValue({
      displayName: "Compliance Matters Heating & Air",
      supportEmail: "hello@example.com",
      supportPhone: "(555) 111-2222",
      logoUrl: "https://example.com/logo.png",
    });
  });

  it("resolves a valid token for a sent flat proposal", async () => {
    createAdminClientMock.mockReturnValue(
      buildAdminClient({
        proposalLink: {
          id: "plink-1",
          estimate_id: ESTIMATE_ID,
          account_owner_user_id: ACCOUNT_OWNER,
          status: "active",
          expires_at: "2099-06-06T00:00:00.000Z",
          revoked_at: null,
        },
      })
    );
    getEstimateByIdMock.mockResolvedValue(buildEstimate());

    const { readPublicEstimateProposalByToken } = await import(
      "@/lib/estimates/estimate-proposal-public-read"
    );
    const result = await readPublicEstimateProposalByToken("abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789");

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.proposal.identity.estimateNumber).toBe("EST-20260523-ABC12345");
    expect(result.proposal.context.locationDisplay).toContain("100 Main St");
    expect(result.proposal.lines).toHaveLength(1);
    expect(result.proposal.lines[0].itemName).toBe("Packaged rooftop unit");
  });

  it("returns unavailable when the feature flag is disabled", async () => {
    isEstimateProposalLinksEnabledMock.mockReturnValue(false);

    const { readPublicEstimateProposalByToken } = await import(
      "@/lib/estimates/estimate-proposal-public-read"
    );
    const result = await readPublicEstimateProposalByToken("abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789");

    expect(result).toEqual({ available: false });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns unavailable for malformed tokens", async () => {
    const { readPublicEstimateProposalByToken } = await import(
      "@/lib/estimates/estimate-proposal-public-read"
    );
    const result = await readPublicEstimateProposalByToken("bad token");

    expect(result).toEqual({ available: false });
  });

  it("returns unavailable when the link is missing", async () => {
    createAdminClientMock.mockReturnValue(buildAdminClient({ proposalLink: null }));

    const { readPublicEstimateProposalByToken } = await import(
      "@/lib/estimates/estimate-proposal-public-read"
    );
    const result = await readPublicEstimateProposalByToken("abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789");

    expect(result).toEqual({ available: false });
  });

  it("returns unavailable for revoked links", async () => {
    createAdminClientMock.mockReturnValue(
      buildAdminClient({
        proposalLink: {
          id: "plink-1",
          estimate_id: ESTIMATE_ID,
          account_owner_user_id: ACCOUNT_OWNER,
          status: "active",
          expires_at: "2099-06-06T00:00:00.000Z",
          revoked_at: "2026-05-23T00:00:00.000Z",
        },
      })
    );

    const { readPublicEstimateProposalByToken } = await import(
      "@/lib/estimates/estimate-proposal-public-read"
    );
    const result = await readPublicEstimateProposalByToken("abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789");

    expect(result).toEqual({ available: false });
  });

  it("returns unavailable for expired links", async () => {
    createAdminClientMock.mockReturnValue(
      buildAdminClient({
        proposalLink: {
          id: "plink-1",
          estimate_id: ESTIMATE_ID,
          account_owner_user_id: ACCOUNT_OWNER,
          status: "active",
          expires_at: "2000-01-01T00:00:00.000Z",
          revoked_at: null,
        },
      })
    );

    const { readPublicEstimateProposalByToken } = await import(
      "@/lib/estimates/estimate-proposal-public-read"
    );
    const result = await readPublicEstimateProposalByToken("abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789");

    expect(result).toEqual({ available: false });
  });

  it.each(["draft", "approved", "converted"])(
    "returns unavailable for ineligible estimate status %s",
    async (status) => {
      createAdminClientMock.mockReturnValue(
        buildAdminClient({
          proposalLink: {
            id: "plink-1",
            estimate_id: ESTIMATE_ID,
            account_owner_user_id: ACCOUNT_OWNER,
            status: "active",
            expires_at: "2099-06-06T00:00:00.000Z",
            revoked_at: null,
          },
        })
      );
      getEstimateByIdMock.mockResolvedValue(buildEstimate({ status }));

      const { readPublicEstimateProposalByToken } = await import(
        "@/lib/estimates/estimate-proposal-public-read"
      );
      const result = await readPublicEstimateProposalByToken("abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789");

      expect(result).toEqual({ available: false });
    }
  );

  it("returns unavailable when the estimate account does not match the link account", async () => {
    createAdminClientMock.mockReturnValue(
      buildAdminClient({
        proposalLink: {
          id: "plink-1",
          estimate_id: ESTIMATE_ID,
          account_owner_user_id: ACCOUNT_OWNER,
          status: "active",
          expires_at: "2099-06-06T00:00:00.000Z",
          revoked_at: null,
        },
      })
    );
    getEstimateByIdMock.mockResolvedValue(buildEstimate({ account_owner_user_id: "owner-other" }));

    const { readPublicEstimateProposalByToken } = await import(
      "@/lib/estimates/estimate-proposal-public-read"
    );
    const result = await readPublicEstimateProposalByToken("abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789");

    expect(result).toEqual({ available: false });
  });

  it("does not include the raw token or internal ids in the public read model", async () => {
    createAdminClientMock.mockReturnValue(
      buildAdminClient({
        proposalLink: {
          id: "plink-1",
          estimate_id: ESTIMATE_ID,
          account_owner_user_id: ACCOUNT_OWNER,
          status: "active",
          expires_at: "2099-06-06T00:00:00.000Z",
          revoked_at: null,
        },
      })
    );
    getEstimateByIdMock.mockResolvedValue(buildEstimate());

    const { readPublicEstimateProposalByToken } = await import(
      "@/lib/estimates/estimate-proposal-public-read"
    );
    const rawToken = "abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789";
    const result = await readPublicEstimateProposalByToken(rawToken);

    expect(result.available).toBe(true);
    if (!result.available) return;
    const serialized = JSON.stringify(result.proposal);
    expect(serialized).not.toContain(rawToken);
    expect(serialized).not.toContain("estimateId");
    expect(serialized).not.toContain("converted_job_id");
    expect(serialized).not.toContain("response_note");
    expect(serialized).not.toContain("source_pricebook_item_id");
  });

  it("maps a multi-option proposal into safe public options", async () => {
    createAdminClientMock.mockReturnValue(
      buildAdminClient({
        proposalLink: {
          id: "plink-1",
          estimate_id: ESTIMATE_ID,
          account_owner_user_id: ACCOUNT_OWNER,
          status: "active",
          expires_at: "2099-06-06T00:00:00.000Z",
          revoked_at: null,
        },
      })
    );
    getEstimateByIdMock.mockResolvedValue(
      buildEstimate({
        proposalMode: "multi_option_packages",
        line_items: [],
        options: [
          {
            id: "opt-1",
            estimate_id: ESTIMATE_ID,
            slot_index: 1,
            label: "Good",
            default_label_key: "good",
            sort_order: 1,
            summary: "Replace condenser and coil.",
            notes: "Internal option note",
            subtotal_cents: 900000,
            total_cents: 970000,
            created_at: "2026-05-22T16:00:00.000Z",
            updated_at: "2026-05-23T16:00:00.000Z",
            line_items: [
              {
                id: "opt-line-1",
                estimate_id: ESTIMATE_ID,
                estimate_option_id: "opt-1",
                source_pricebook_item_id: "pb-2",
                item_name_snapshot: "Condenser replacement",
                description_snapshot: "Install matched outdoor unit.",
                item_type_snapshot: "material",
                category_snapshot: "equipment",
                unit_label_snapshot: "ea",
                quantity: 1,
                unit_price_cents: 900000,
                line_subtotal_cents: 900000,
                sort_order: 1,
                created_at: "2026-05-22T16:00:00.000Z",
                updated_at: "2026-05-23T16:00:00.000Z",
              },
            ],
          },
        ],
      })
    );

    const { readPublicEstimateProposalByToken } = await import(
      "@/lib/estimates/estimate-proposal-public-read"
    );
    const result = await readPublicEstimateProposalByToken("abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789");

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.proposal.proposalMode).toBe("multi_option_packages");
    expect(result.proposal.options).toHaveLength(1);
    expect(result.proposal.options[0].label).toBe("Good");
    expect(result.proposal.options[0].totalCents).toBe(970000);
    expect(JSON.stringify(result.proposal)).not.toContain("opt-1");
  });

  it("fails closed when the proposal link table is unavailable", async () => {
    createAdminClientMock.mockReturnValue(
      buildAdminClient({
        proposalLinkError: { code: "42P01", message: "relation estimate_proposal_links does not exist" },
      })
    );

    const { readPublicEstimateProposalByToken } = await import(
      "@/lib/estimates/estimate-proposal-public-read"
    );
    const result = await readPublicEstimateProposalByToken("abcdefghijklmnopqrstuvwxyzABCDEFG_0123456789");

    expect(result).toEqual({ available: false });
  });
});