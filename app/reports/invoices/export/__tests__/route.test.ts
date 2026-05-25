import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const isInternalAccessErrorMock = vi.fn((error: unknown) => {
  return Boolean(error && typeof error === 'object' && 'name' in (error as Record<string, unknown>));
});
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const parseInvoiceLedgerFiltersMock = vi.fn((_: URLSearchParams) => ({ status: null }));
const listInvoiceLedgerRowsMock = vi.fn();
const buildInvoiceLedgerCsvMock = vi.fn((_: unknown[]) => 'invoice_number,total_due\nINV-1,100.00\n');

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock('@/lib/auth/internal-user', () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (error: unknown) => isInternalAccessErrorMock(error),
}));

vi.mock('@/lib/business/internal-business-profile', () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) =>
    resolveBillingModeByAccountOwnerIdMock(...args),
}));

vi.mock('@/lib/reports/invoice-ledger', () => ({
  INVOICE_LEDGER_EXPORT_LIMIT: 500,
  parseInvoiceLedgerFilters: (searchParams: URLSearchParams) => parseInvoiceLedgerFiltersMock(searchParams),
  listInvoiceLedgerRows: (...args: unknown[]) => listInvoiceLedgerRowsMock(...args),
  buildInvoiceLedgerCsv: (rows: unknown[]) => buildInvoiceLedgerCsvMock(rows),
}));

function makeSupabaseFixture(userId: string | null) {
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
      if (table !== 'contractor_users') {
        throw new Error(`Unexpected table ${table}`);
      }

      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      };
      return query;
    }),
  };
}

function buildRequest() {
  return new NextRequest('http://localhost:3000/reports/invoices/export?status=issued');
}

describe('invoice export route financial access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue('internal_invoicing');
    listInvoiceLedgerRowsMock.mockResolvedValue({
      rows: [{ invoice_number: 'INV-1' }],
      totalCount: 1,
      truncated: false,
    });
  });

  it('allows admin to export invoice ledger CSV', async () => {
    createClientMock.mockResolvedValue(makeSupabaseFixture('admin-1'));
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: 'admin-1',
        role: 'admin',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { GET } = await import('@/app/reports/invoices/export/route');
    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(listInvoiceLedgerRowsMock).toHaveBeenCalledTimes(1);
  });

  it('allows structural owner to export invoice ledger CSV', async () => {
    createClientMock.mockResolvedValue(makeSupabaseFixture('owner-1'));
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: 'owner-1',
        role: 'office',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { GET } = await import('@/app/reports/invoices/export/route');
    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(listInvoiceLedgerRowsMock).toHaveBeenCalledTimes(1);
  });

  it('allows billing role to export invoice ledger CSV', async () => {
    createClientMock.mockResolvedValue(makeSupabaseFixture('billing-1'));
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: 'billing-1',
        role: 'billing',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { GET } = await import('@/app/reports/invoices/export/route');
    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(listInvoiceLedgerRowsMock).toHaveBeenCalledTimes(1);
  });

  it('denies office/dispatcher from exporting financial CSV', async () => {
    createClientMock.mockResolvedValue(makeSupabaseFixture('office-1'));
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: 'office-1',
        role: 'office',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { GET } = await import('@/app/reports/invoices/export/route');
    const response = await GET(buildRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/reports/invoices?banner=not_authorized');
    expect(listInvoiceLedgerRowsMock).not.toHaveBeenCalled();
  });

  it('denies technician from exporting financial CSV', async () => {
    createClientMock.mockResolvedValue(makeSupabaseFixture('tech-1'));
    requireInternalUserMock.mockResolvedValue({
      internalUser: {
        user_id: 'tech-1',
        role: 'tech',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });

    const { GET } = await import('@/app/reports/invoices/export/route');
    const response = await GET(buildRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/reports/invoices?banner=not_authorized');
    expect(listInvoiceLedgerRowsMock).not.toHaveBeenCalled();
  });
});