import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const sendEmailMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const insertJobEventMock = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
  })),
}));

vi.mock('@/lib/auth/internal-user', () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
}));

vi.mock('@/lib/auth/internal-job-scope', () => ({
  loadScopedInternalJobForMutation: (...args: unknown[]) =>
    loadScopedInternalJobForMutationMock(...args),
}));

vi.mock('@/lib/business/internal-business-profile', () => ({
  resolveBillingModeByAccountOwnerId: (...args: unknown[]) =>
    resolveBillingModeByAccountOwnerIdMock(...args),
  resolveInternalBusinessIdentityByAccountOwnerId: vi.fn(async () => ({
    display_name: 'Compliance Matters',
    support_email: null,
    support_phone: null,
  })),
}));

vi.mock('@/lib/business/internal-invoice', () => ({
  normalizeInternalInvoiceItemType: vi.fn(() => 'service'),
  resolveInternalInvoiceByJobId: vi.fn(async () => null),
}));

vi.mock('@/lib/actions/job-evaluator', () => ({
  evaluateJobOpsStatus: vi.fn(async () => undefined),
  healStalePaperworkOpsStatus: vi.fn(async () => undefined),
}));

vi.mock('@/lib/actions/job-actions', () => ({
  insertJobEvent: (...args: unknown[]) => insertJobEventMock(...args),
}));

vi.mock('@/lib/notifications/account-owner', () => ({
  resolveNotificationAccountOwnerUserId: vi.fn(async () => 'owner-1'),
}));

vi.mock('@/lib/email/sendEmail', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

function makeDenySupabaseFixture() {
  const writeCalls: Array<{ table: string; method: 'update' | 'insert' | 'delete' }> = [];

  const chainWithEq = {
    eq: vi.fn(() => chainWithEq),
    neq: vi.fn(() => chainWithEq),
    is: vi.fn(() => chainWithEq),
    order: vi.fn(() => chainWithEq),
    limit: vi.fn(() => chainWithEq),
    single: vi.fn(async () => ({ data: null, error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };

  const supabase = {
    from(table: string) {
      return {
        select: vi.fn(() => chainWithEq),
        update: vi.fn(() => {
          writeCalls.push({ table, method: 'update' });
          return chainWithEq;
        }),
        insert: vi.fn(() => {
          writeCalls.push({ table, method: 'insert' });
          return chainWithEq;
        }),
        delete: vi.fn(() => {
          writeCalls.push({ table, method: 'delete' });
          return chainWithEq;
        }),
      };
    },
  };

  return { supabase, writeCalls };
}

function makeAllowSupabaseFixture() {
  return {
    supabase: {
      from(_table: string) {
        throw new Error('ALLOW_PATH_REACHED');
      },
    },
  };
}

function buildInvoiceFormData() {
  const formData = new FormData();
  formData.set('job_id', 'job-1');
  formData.set('tab', 'info');
  formData.set('line_item_id', 'line-item-1');
  return formData;
}

type InvoiceMutationEntrypoint =
  | 'createInternalInvoiceDraftFromForm'
  | 'saveInternalInvoiceDraftFromForm'
  | 'issueInternalInvoiceFromForm'
  | 'voidInternalInvoiceFromForm'
  | 'addInternalInvoiceLineItemFromForm'
  | 'addInternalInvoiceLineItemFromPricebookForm'
  | 'updateInternalInvoiceLineItemFromForm'
  | 'removeInternalInvoiceLineItemFromForm'
  | 'sendInternalInvoiceEmailFromForm';

const targetedEntrypoints: InvoiceMutationEntrypoint[] = [
  'createInternalInvoiceDraftFromForm',
  'saveInternalInvoiceDraftFromForm',
  'issueInternalInvoiceFromForm',
  'voidInternalInvoiceFromForm',
  'addInternalInvoiceLineItemFromForm',
  'addInternalInvoiceLineItemFromPricebookForm',
  'updateInternalInvoiceLineItemFromForm',
  'removeInternalInvoiceLineItemFromForm',
  'sendInternalInvoiceEmailFromForm',
];

async function invokeEntrypoint(name: InvoiceMutationEntrypoint, formData: FormData) {
  const invoiceActions = await import('@/lib/actions/internal-invoice-actions');
  return (invoiceActions as Record<string, (fd: FormData) => Promise<unknown>>)[name](formData);
}

function assertNoDeniedWrites(writeCalls: Array<{ table: string; method: string }>) {
  const protectedTables = [
    'internal_invoices',
    'internal_invoice_line_items',
    'jobs',
    'job_events',
    'notifications',
  ];

  expect(writeCalls.filter((call) => protectedTables.includes(call.table))).toHaveLength(0);
}

describe('internal invoice mutation same-account hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    resolveBillingModeByAccountOwnerIdMock.mockResolvedValue('internal_invoicing');
    sendEmailMock.mockResolvedValue(undefined);
    requireInternalUserMock.mockResolvedValue({
      userId: 'internal-user-1',
      internalUser: {
        user_id: 'internal-user-1',
        role: 'office',
        is_active: true,
        account_owner_user_id: 'owner-1',
      },
    });
  });

  for (const entrypointName of targetedEntrypoints) {
    it(`denies cross-account internal ${entrypointName} before invoice/jobs/events/notification writes and email side effects`, async () => {
      const { supabase, writeCalls } = makeDenySupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      loadScopedInternalJobForMutationMock.mockResolvedValue(null);

      await expect(invokeEntrypoint(entrypointName, buildInvoiceFormData())).rejects.toThrow(
        'banner=not_authorized',
      );

      expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: 'owner-1', jobId: 'job-1' }),
      );
      assertNoDeniedWrites(writeCalls);
      expect(insertJobEventMock).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it(`allows same-account internal ${entrypointName} past scoped-job preflight`, async () => {
      const { supabase } = makeAllowSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });

      await expect(invokeEntrypoint(entrypointName, buildInvoiceFormData())).rejects.toThrow(
        'ALLOW_PATH_REACHED',
      );

      expect(loadScopedInternalJobForMutationMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: 'owner-1', jobId: 'job-1' }),
      );
    });

    it(`denies non-internal ${entrypointName} before invoice/jobs/events/notification writes and email side effects`, async () => {
      const { supabase, writeCalls } = makeDenySupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      requireInternalUserMock.mockRejectedValueOnce(new Error('Active internal user required.'));

      await expect(invokeEntrypoint(entrypointName, buildInvoiceFormData())).rejects.toThrow(
        'Active internal user required.',
      );

      expect(loadScopedInternalJobForMutationMock).not.toHaveBeenCalled();
      assertNoDeniedWrites(writeCalls);
      expect(insertJobEventMock).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    });
  }
});
