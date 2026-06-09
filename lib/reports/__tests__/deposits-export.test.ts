import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isInternalAccessErrorMock = vi.fn((error: unknown) => {
  return Boolean(error && typeof error === "object" && "name" in (error as Record<string, unknown>));
});
const getDepositsLedgerSummaryMock = vi.fn();
const getDepositDetailExportRowsMock = vi.fn();
const buildDepositsSummaryCsvMock = vi.fn((_rows: unknown[]) => "summary_header\r\nsummary_row");
const buildDepositsDetailCsvMock = vi.fn((_rows: unknown[]) => "detail_header\r\ndetail_row");

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (error: unknown) => isInternalAccessErrorMock(error),
}));

vi.mock("@/lib/reports/deposits-ledger", () => ({
  getDepositsLedgerSummary: (...args: unknown[]) => getDepositsLedgerSummaryMock(...args),
  getDepositDetailExportRows: (...args: unknown[]) => getDepositDetailExportRowsMock(...args),
  buildDepositsSummaryCsv: (rows: unknown[]) => buildDepositsSummaryCsvMock(rows),
  buildDepositsDetailCsv: (rows: unknown[]) => buildDepositsDetailCsvMock(rows),
}));

function makeSupabaseFixture(userId: string | null, contractorId: string | null = null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: userId ? { id: userId } : null,
        },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== "contractor_users") {
        throw new Error(`Unexpected table ${table}`);
      }

      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: contractorId ? { contractor_id: contractorId } : null,
          error: null,
        })),
      };
      return query;
    }),
  };
}

function buildSummaryRequest() {
  return new NextRequest(
    "http://localhost:3000/reports/deposits/export/summary?from=2026-06-01&to=2026-06-30&payout_status=paid&sync_status=synced",
  );
}

function buildDetailRequest() {
  return new NextRequest(
    "http://localhost:3000/reports/deposits/export/detail?from=2026-06-01&to=2026-06-30&payout_status=paid&sync_status=synced&payout_group_id=po_123",
  );
}

describe("deposits export routes financial access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    getDepositsLedgerSummaryMock.mockResolvedValue({
      rows: [{ payoutId: "po_123" }],
    });
    getDepositDetailExportRowsMock.mockResolvedValue([{ settlementId: "set_1" }]);
  });

  it("allows structural owner to export summary CSV with filters and no-store headers", async () => {
    createClientMock.mockResolvedValue(makeSupabaseFixture("owner-1"));
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: "owner-1",
        role: "office",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const { GET } = await import("@/app/reports/deposits/export/summary/route");
    const response = (await GET(buildSummaryRequest())) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="deposits-summary-\d{4}-\d{2}-\d{2}\.csv"$/);
    await expect(response.text()).resolves.toBe("summary_header\r\nsummary_row");
    expect(getDepositsLedgerSummaryMock).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      accountOwnerUserId: "owner-1",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      payoutStatus: "paid",
      syncStatus: "synced",
    });
    expect(buildDepositsSummaryCsvMock).toHaveBeenCalledWith([{ payoutId: "po_123" }]);
  });

  it("allows admin to export detail CSV with optional payout group filter", async () => {
    createClientMock.mockResolvedValue(makeSupabaseFixture("admin-1"));
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: "admin-1",
        role: "admin",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const { GET } = await import("@/app/reports/deposits/export/detail/route");
    const response = (await GET(buildDetailRequest())) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="deposits-detail-\d{4}-\d{2}-\d{2}\.csv"$/);
    await expect(response.text()).resolves.toBe("detail_header\r\ndetail_row");
    expect(getDepositDetailExportRowsMock).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      accountOwnerUserId: "owner-1",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      payoutStatus: "paid",
      syncStatus: "synced",
      payoutGroupId: "po_123",
    });
    expect(buildDepositsDetailCsvMock).toHaveBeenCalledWith([{ settlementId: "set_1" }]);
  });

  it("allows billing role to export summary CSV", async () => {
    createClientMock.mockResolvedValue(makeSupabaseFixture("billing-1"));
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: "billing-1",
        role: "billing",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const { GET } = await import("@/app/reports/deposits/export/summary/route");
    const response = (await GET(buildSummaryRequest())) as Response;

    expect(response.status).toBe(200);
    expect(getDepositsLedgerSummaryMock).toHaveBeenCalledTimes(1);
  });

  it("blocks dispatcher from exporting financial CSV", async () => {
    createClientMock.mockResolvedValue(makeSupabaseFixture("dispatcher-1"));
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: "dispatcher-1",
        role: "dispatcher",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const { GET } = await import("@/app/reports/deposits/export/summary/route");
    const response = (await GET(buildSummaryRequest())) as Response;

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/reports/invoices?banner=not_authorized");
    expect(getDepositsLedgerSummaryMock).not.toHaveBeenCalled();
  });

  it("blocks technician from exporting financial CSV", async () => {
    createClientMock.mockResolvedValue(makeSupabaseFixture("tech-1"));
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: "tech-1",
        role: "tech",
        is_active: true,
        account_owner_user_id: "owner-1",
      },
    });

    const { GET } = await import("@/app/reports/deposits/export/detail/route");
    const response = (await GET(buildDetailRequest())) as Response;

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/reports/invoices?banner=not_authorized");
    expect(getDepositDetailExportRowsMock).not.toHaveBeenCalled();
  });

  it("blocks contractor users to the portal without reading export rows", async () => {
    createClientMock.mockResolvedValue(makeSupabaseFixture("contractor-1", "contractor-account-1"));
    requireInternalUserMock.mockRejectedValue({ name: "InternalAccessError" });

    const { GET } = await import("@/app/reports/deposits/export/detail/route");
    const response = (await GET(buildDetailRequest())) as Response;

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/portal");
    expect(getDepositDetailExportRowsMock).not.toHaveBeenCalled();
  });

  it("blocks unauthenticated users to login without reading export rows", async () => {
    createClientMock.mockResolvedValue(makeSupabaseFixture(null));

    const { GET } = await import("@/app/reports/deposits/export/summary/route");
    const response = (await GET(buildSummaryRequest())) as Response;

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(getDepositsLedgerSummaryMock).not.toHaveBeenCalled();
  });
});
