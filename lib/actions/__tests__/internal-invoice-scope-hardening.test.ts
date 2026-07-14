import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const createClientMock = vi.fn();
const requireInternalUserMock = vi.fn();
const loadScopedInternalJobForMutationMock = vi.fn();
const sendEmailMock = vi.fn();
const resolveBillingModeByAccountOwnerIdMock = vi.fn();
const insertJobEventMock = vi.fn();
const resolveOperationalMutationEntitlementAccessMock = vi.fn();

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
  resolveInternalInvoiceById: vi.fn(async () => null),
  resolveInternalInvoiceByJobId: vi.fn(async () => null),
}));

vi.mock('@/lib/business/platform-entitlement', () => ({
  resolveOperationalMutationEntitlementAccess: (...args: unknown[]) =>
    resolveOperationalMutationEntitlementAccessMock(...args),
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

function buildInvoiceFormDataNoRedirect() {
  const formData = buildInvoiceFormData();
  formData.set('no_redirect', '1');
  return formData;
}

type InvoiceMutationEntrypoint =
  | 'createInternalInvoiceDraftFromForm'
  | 'saveInternalInvoiceDraftFromForm'
  | 'issueInternalInvoiceFromForm'
  | 'markInternalInvoiceNoChargeFromForm'
  | 'markInternalInvoiceExternallyBilledFromForm'
  | 'voidInternalInvoiceFromForm'
  | 'addInternalInvoiceLineItemFromForm'
  | 'addInternalInvoiceLineItemFromPricebookForm'
  | 'addInternalInvoiceLineItemsFromVisitScopeForm'
  | 'updateInternalInvoiceLineItemFromForm'
  | 'removeInternalInvoiceLineItemFromForm'
  | 'sendInternalInvoiceEmailFromForm';

type InvoiceLifecycleEntrypoint =
  | 'createInternalInvoiceDraftFromForm'
  | 'saveInternalInvoiceDraftFromForm'
  | 'issueInternalInvoiceFromForm'
  | 'markInternalInvoiceNoChargeFromForm'
  | 'markInternalInvoiceExternallyBilledFromForm'
  | 'voidInternalInvoiceFromForm'
  | 'sendInternalInvoiceEmailFromForm';

const targetedEntrypoints: InvoiceMutationEntrypoint[] = [
  'createInternalInvoiceDraftFromForm',
  'saveInternalInvoiceDraftFromForm',
  'issueInternalInvoiceFromForm',
  'markInternalInvoiceNoChargeFromForm',
  'markInternalInvoiceExternallyBilledFromForm',
  'voidInternalInvoiceFromForm',
  'addInternalInvoiceLineItemFromForm',
  'addInternalInvoiceLineItemFromPricebookForm',
  'addInternalInvoiceLineItemsFromVisitScopeForm',
  'updateInternalInvoiceLineItemFromForm',
  'removeInternalInvoiceLineItemFromForm',
  'sendInternalInvoiceEmailFromForm',
];

const lifecycleEntrypoints: InvoiceLifecycleEntrypoint[] = [
  'createInternalInvoiceDraftFromForm',
  'saveInternalInvoiceDraftFromForm',
  'issueInternalInvoiceFromForm',
  'markInternalInvoiceNoChargeFromForm',
  'markInternalInvoiceExternallyBilledFromForm',
  'voidInternalInvoiceFromForm',
  'sendInternalInvoiceEmailFromForm',
];

const internalInvoiceActionsSource = readFileSync(
  resolve(__dirname, '../internal-invoice-actions.ts'),
  'utf8',
);

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
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValue({
      authorized: true,
      reason: 'allowed_active',
    });
    requireInternalUserMock.mockResolvedValue({
      userId: 'internal-user-1',
      internalUser: {
        user_id: 'internal-user-1',
        role: 'admin',
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
      expect(resolveOperationalMutationEntitlementAccessMock).not.toHaveBeenCalled();
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
      expect(resolveOperationalMutationEntitlementAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountOwnerUserId: 'owner-1' }),
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
      expect(resolveOperationalMutationEntitlementAccessMock).not.toHaveBeenCalled();
      assertNoDeniedWrites(writeCalls);
      expect(insertJobEventMock).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    });
  }

  it('keeps authorization redirect behavior unchanged when no_redirect is requested', async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue(null);

    await expect(
      invokeEntrypoint('addInternalInvoiceLineItemFromForm', buildInvoiceFormDataNoRedirect()),
    ).rejects.toThrow('banner=not_authorized');

    assertNoDeniedWrites(writeCalls);
    expect(insertJobEventMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('allows valid trial internal saveInternalInvoiceDraftFromForm past entitlement preflight', async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: 'allowed_trial',
    });

    await expect(
      invokeEntrypoint('saveInternalInvoiceDraftFromForm', buildInvoiceFormData()),
    ).rejects.toThrow('ALLOW_PATH_REACHED');
  });

  it('blocks expired trial internal saveInternalInvoiceDraftFromForm before invoice/jobs/events/notification writes and email side effects', async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: 'blocked_trial_expired',
    });

    await expect(
      invokeEntrypoint('saveInternalInvoiceDraftFromForm', buildInvoiceFormData()),
    ).rejects.toThrow(
      'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_expired',
    );

    assertNoDeniedWrites(writeCalls);
    expect(resolveBillingModeByAccountOwnerIdMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('blocks null-ended trial internal saveInternalInvoiceDraftFromForm before invoice/jobs/events/notification writes and email side effects', async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: 'blocked_trial_missing_end',
    });

    await expect(
      invokeEntrypoint('saveInternalInvoiceDraftFromForm', buildInvoiceFormData()),
    ).rejects.toThrow(
      'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_trial_missing_end',
    );

    assertNoDeniedWrites(writeCalls);
    expect(resolveBillingModeByAccountOwnerIdMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('allows internal comped saveInternalInvoiceDraftFromForm past entitlement preflight', async () => {
    const { supabase } = makeAllowSupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: true,
      reason: 'allowed_internal_comped',
    });

    await expect(
      invokeEntrypoint('saveInternalInvoiceDraftFromForm', buildInvoiceFormData()),
    ).rejects.toThrow('ALLOW_PATH_REACHED');
  });

  it('blocks missing entitlement internal saveInternalInvoiceDraftFromForm before invoice/jobs/events/notification writes and email side effects', async () => {
    const { supabase, writeCalls } = makeDenySupabaseFixture();
    createClientMock.mockResolvedValue(supabase);
    loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
    resolveOperationalMutationEntitlementAccessMock.mockResolvedValueOnce({
      authorized: false,
      reason: 'blocked_missing_entitlement',
    });

    await expect(
      invokeEntrypoint('saveInternalInvoiceDraftFromForm', buildInvoiceFormData()),
    ).rejects.toThrow(
      'REDIRECT:/ops/admin/company-profile?err=entitlement_blocked&reason=blocked_missing_entitlement',
    );

    assertNoDeniedWrites(writeCalls);
    expect(resolveBillingModeByAccountOwnerIdMock).not.toHaveBeenCalled();
    expect(insertJobEventMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  for (const entrypointName of lifecycleEntrypoints) {
    it(`allows structural owner internal ${entrypointName} past financial lifecycle authority preflight`, async () => {
      const { supabase } = makeAllowSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
      requireInternalUserMock.mockResolvedValueOnce({
        userId: 'owner-1',
        internalUser: {
          user_id: 'owner-1',
          role: 'office',
          is_active: true,
          account_owner_user_id: 'owner-1',
        },
      });

      await expect(invokeEntrypoint(entrypointName, buildInvoiceFormData())).rejects.toThrow(
        'ALLOW_PATH_REACHED',
      );
    });

    it(`allows billing internal ${entrypointName} past financial lifecycle authority preflight`, async () => {
      const { supabase } = makeAllowSupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
      requireInternalUserMock.mockResolvedValueOnce({
        userId: 'billing-1',
        internalUser: {
          user_id: 'billing-1',
          role: 'billing',
          is_active: true,
          account_owner_user_id: 'owner-1',
        },
      });

      await expect(invokeEntrypoint(entrypointName, buildInvoiceFormData())).rejects.toThrow(
        'ALLOW_PATH_REACHED',
      );
    });

    it(`denies office internal ${entrypointName} before invoice/jobs/events/notification writes and email side effects`, async () => {
      const { supabase, writeCalls } = makeDenySupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
      requireInternalUserMock.mockResolvedValueOnce({
        userId: 'office-1',
        internalUser: {
          user_id: 'office-1',
          role: 'office',
          is_active: true,
          account_owner_user_id: 'owner-1',
        },
      });

      await expect(invokeEntrypoint(entrypointName, buildInvoiceFormData())).rejects.toThrow(
        'banner=not_authorized',
      );

      assertNoDeniedWrites(writeCalls);
      expect(insertJobEventMock).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it(`denies tech internal ${entrypointName} before invoice/jobs/events/notification writes and email side effects`, async () => {
      const { supabase, writeCalls } = makeDenySupabaseFixture();
      createClientMock.mockResolvedValue(supabase);
      loadScopedInternalJobForMutationMock.mockResolvedValue({ id: 'job-1' });
      requireInternalUserMock.mockResolvedValueOnce({
        userId: 'tech-1',
        internalUser: {
          user_id: 'tech-1',
          role: 'tech',
          is_active: true,
          account_owner_user_id: 'owner-1',
        },
      });

      await expect(invokeEntrypoint(entrypointName, buildInvoiceFormData())).rejects.toThrow(
        'banner=not_authorized',
      );

      assertNoDeniedWrites(writeCalls);
      expect(insertJobEventMock).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    });
  }

  it('keeps draft creation open to derived field billing draft authority without broad lifecycle access', () => {
    const draftCreateIndex = internalInvoiceActionsSource.indexOf('export async function createInternalInvoiceDraftFromForm');
    const draftCreateSlice = internalInvoiceActionsSource.slice(draftCreateIndex, draftCreateIndex + 600);
    const supplementalCreateIndex = internalInvoiceActionsSource.indexOf('export async function createSupplementalInternalInvoiceFromForm');
    const supplementalCreateSlice = internalInvoiceActionsSource.slice(supplementalCreateIndex, supplementalCreateIndex + 3000);

    expect(internalInvoiceActionsSource).toContain('function hasDraftInvoiceCreateAccess');
    expect(internalInvoiceActionsSource).toContain('return resolveFieldChargeCapabilities(context).can_create_direct_invoice_draft;');
    expect(draftCreateSlice).toContain('if (!hasDraftInvoiceCreateAccess(context))');
    expect(draftCreateSlice).not.toContain('requireInvoiceLifecycleAccessOrRedirect');
    expect(supplementalCreateSlice).toContain('requireInvoiceLifecycleAccessOrRedirect');
  });

  it('keeps invoice draft billing address explicit-only and avoids service-location fallback', () => {
    // The snapshot builder now lives in lib/business/invoice-billing-snapshot.ts
    // (a pure, testable module shared by draft creation and the Bill To re-pull).
    // The address comes from the resolved bill-to source (recipient's own
    // address), never from the service location or the job override.
    const snapshotSrc = readFileSync(
      resolve(__dirname, '../../business/invoice-billing-snapshot.ts'),
      'utf-8',
    );
    expect(snapshotSrc).toContain('billing_address_line1: firstNonEmpty(billing.billing_address_line1)');
    expect(snapshotSrc).not.toContain('locationBilling?.address_line1');
    expect(snapshotSrc).not.toContain('jobBilling.billing_address_line1');
  });
});
