import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isInternalAccessErrorMock = vi.fn();
const loadScopedJobMock = vi.fn();
const resolveBillingModeMock = vi.fn();
const resolveInvoiceMock = vi.fn();
const resolvePaymentLedgerMock = vi.fn();
const resolveTenantIdentityMock = vi.fn();
const buildDocumentModelMock = vi.fn();
const buildFilenameMock = vi.fn();
const renderPdfMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClientMock() }));
vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (error: unknown) => isInternalAccessErrorMock(error),
}));
vi.mock("@/lib/actions/internal-job-detail-read-boundary", () => ({
  loadScopedInternalJobDetailReadBoundary: (...args: unknown[]) => loadScopedJobMock(...args),
}));
vi.mock("@/lib/business/internal-business-profile", () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) => resolveBillingModeMock(...args),
}));
vi.mock("@/lib/business/internal-invoice", () => ({
  resolveInternalInvoiceById: (...args: unknown[]) => resolveInvoiceMock(...args),
}));
vi.mock("@/lib/business/internal-invoice-payments", () => ({
  resolveInvoiceCollectedPaymentLedger: (...args: unknown[]) => resolvePaymentLedgerMock(...args),
}));
vi.mock("@/lib/email/operational-tenant-branding", () => ({
  resolveOperationalTenantIdentity: (...args: unknown[]) => resolveTenantIdentityMock(...args),
}));
vi.mock("@/lib/business/internal-invoice-document", () => ({
  buildInternalInvoiceDocumentModel: (...args: unknown[]) => buildDocumentModelMock(...args),
  buildInternalInvoicePdfFilename: (...args: unknown[]) => buildFilenameMock(...args),
}));
vi.mock("@/lib/pdf/internal-invoice-pdf", () => ({
  renderInternalInvoicePdf: (...args: unknown[]) => renderPdfMock(...args),
}));

const jobId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";

function request(queryInvoiceId = invoiceId) {
  return new NextRequest(`http://localhost/jobs/${jobId}/invoice/pdf?invoice_id=${queryInvoiceId}`);
}

function context(id = jobId) {
  return { params: Promise.resolve({ id }) };
}

function supabaseFixture() {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({
    data: {
      id: jobId,
      title: "Service visit",
      customer_first_name: "Taylor",
      customer_last_name: "Customer",
      billing_recipient: "customer",
      locations: { address_line1: "123 Main", city: "Sacramento", state: "CA", zip: "95814" },
    },
    error: null,
  }));
  return { from: vi.fn((table: string) => table === "jobs" ? query : (() => { throw new Error(`Unexpected table ${table}`); })()) };
}

describe("internal invoice PDF download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    createClientMock.mockResolvedValue(supabaseFixture());
    requireInternalUserMock.mockResolvedValue({
      userId: "admin-1",
      internalUser: { user_id: "admin-1", role: "admin", is_active: true, account_owner_user_id: "owner-1" },
    });
    isInternalAccessErrorMock.mockReturnValue(false);
    loadScopedJobMock.mockResolvedValue({ id: jobId });
    resolveBillingModeMock.mockResolvedValue("internal_invoicing");
    resolveInvoiceMock.mockResolvedValue({
      id: invoiceId,
      job_id: jobId,
      account_owner_user_id: "owner-1",
      invoice_number: "3001",
    });
    resolvePaymentLedgerMock.mockResolvedValue({ summary: { amountPaidCents: 0, balanceDueCents: 12500, paymentStatus: "unpaid" } });
    resolveTenantIdentityMock.mockResolvedValue({ displayName: "EveryStep HVAC", supportEmail: null, supportPhone: null, logoUrl: null });
    buildDocumentModelMock.mockReturnValue({ invoiceNumber: "3001" });
    buildFilenameMock.mockReturnValue("Invoice-3001.pdf");
    renderPdfMock.mockResolvedValue(Buffer.from("%PDF-test-document"));
  });

  it("returns a same-account PDF with attachment and no-cache headers", async () => {
    const { GET, runtime } = await import("@/app/jobs/[id]/invoice/pdf/route");
    const response = await GET(request(), context());
    expect(runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Invoice-3001.pdf"');
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(renderPdfMock).toHaveBeenCalledTimes(1);
  });

  it("denies an unauthenticated request before scope and rendering", async () => {
    requireInternalUserMock.mockRejectedValueOnce({ code: "AUTH_REQUIRED" });
    isInternalAccessErrorMock.mockReturnValueOnce(true);
    const { GET } = await import("@/app/jobs/[id]/invoice/pdf/route");
    const response = await GET(request(), context());
    expect(response.status).toBe(401);
    expect(loadScopedJobMock).not.toHaveBeenCalled();
    expect(renderPdfMock).not.toHaveBeenCalled();
  });

  it("denies contractor or inactive external actors before scope and rendering", async () => {
    requireInternalUserMock.mockRejectedValueOnce({ code: "INTERNAL_USER_REQUIRED" });
    isInternalAccessErrorMock.mockReturnValueOnce(true);
    const { GET } = await import("@/app/jobs/[id]/invoice/pdf/route");
    const response = await GET(request(), context());
    expect(response.status).toBe(403);
    expect(loadScopedJobMock).not.toHaveBeenCalled();
    expect(renderPdfMock).not.toHaveBeenCalled();
  });

  it("denies cross-account job scope before loading invoice content", async () => {
    loadScopedJobMock.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/jobs/[id]/invoice/pdf/route");
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(resolveInvoiceMock).not.toHaveBeenCalled();
    expect(buildDocumentModelMock).not.toHaveBeenCalled();
    expect(renderPdfMock).not.toHaveBeenCalled();
  });

  it("denies a mismatched invoice before document mapping and rendering", async () => {
    resolveInvoiceMock.mockResolvedValueOnce({ id: invoiceId, job_id: "other-job", account_owner_user_id: "owner-1" });
    const { GET } = await import("@/app/jobs/[id]/invoice/pdf/route");
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(buildDocumentModelMock).not.toHaveBeenCalled();
    expect(renderPdfMock).not.toHaveBeenCalled();
  });

  it("returns not found for a missing invoice without rendering", async () => {
    resolveInvoiceMock.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/jobs/[id]/invoice/pdf/route");
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(renderPdfMock).not.toHaveBeenCalled();
  });

  it("returns a safe actionable error when rendering fails", async () => {
    renderPdfMock.mockRejectedValueOnce(new Error("renderer internals"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { GET } = await import("@/app/jobs/[id]/invoice/pdf/route");
    const response = await GET(request(), context());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "The invoice PDF could not be generated. Please try again." });
    expect(consoleError).toHaveBeenCalledWith("Internal invoice PDF generation failed", expect.not.objectContaining({ pdf: expect.anything() }));
    consoleError.mockRestore();
  });
});
