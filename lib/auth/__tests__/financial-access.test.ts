import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import {
  canCreateTenantInvoicePaymentLink,
  canExportFinancialData,
  canRecordInvoicePayment,
  canViewFinancialRegister,
  isStructuralAccountOwner,
  requireFinancialExportAccessOrResponse,
} from '@/lib/auth/financial-access';

describe('financial access helper', () => {
  it('structural owner passes', () => {
    expect(
      isStructuralAccountOwner({
        actorUserId: 'owner-1',
        internalUser: {
          user_id: 'owner-1',
          role: 'office',
          is_active: true,
          account_owner_user_id: 'owner-1',
        },
      }),
    ).toBe(true);

    expect(
      canViewFinancialRegister({
        actorUserId: 'owner-1',
        internalUser: {
          user_id: 'owner-1',
          role: 'office',
          is_active: true,
          account_owner_user_id: 'owner-1',
        },
      }),
    ).toBe(true);
  });

  it('admin passes', () => {
    expect(
      canRecordInvoicePayment({
        actorUserId: 'user-2',
        internalUser: {
          user_id: 'user-2',
          role: 'admin',
          is_active: true,
          account_owner_user_id: 'owner-1',
        },
      }),
    ).toBe(true);

    expect(
      canCreateTenantInvoicePaymentLink({
        actorUserId: 'user-2',
        internalUser: {
          user_id: 'user-2',
          role: 'admin',
          is_active: true,
          account_owner_user_id: 'owner-1',
        },
      }),
    ).toBe(true);
  });

  it('billing passes', () => {
    expect(
      canViewFinancialRegister({
        actorUserId: 'billing-1',
        internalUser: {
          user_id: 'billing-1',
          role: 'billing',
          is_active: true,
          account_owner_user_id: 'owner-1',
        },
      }),
    ).toBe(true);

    expect(
      canExportFinancialData({
        actorUserId: 'billing-1',
        internalUser: {
          user_id: 'billing-1',
          role: 'billing',
          is_active: true,
          account_owner_user_id: 'owner-1',
        },
      }),
    ).toBe(true);
  });

  it('office/dispatcher and tech fail when not structural owner', () => {
    expect(
      canRecordInvoicePayment({
        actorUserId: 'user-3',
        internalUser: {
          user_id: 'user-3',
          role: 'office',
          is_active: true,
          account_owner_user_id: 'owner-1',
        },
      }),
    ).toBe(false);

    expect(
      canCreateTenantInvoicePaymentLink({
        actorUserId: 'user-4',
        internalUser: {
          user_id: 'user-4',
          role: 'tech',
          is_active: true,
          account_owner_user_id: 'owner-1',
        },
      }),
    ).toBe(false);
  });

  it('inactive internal user fails', () => {
    expect(
      canExportFinancialData({
        actorUserId: 'owner-1',
        internalUser: {
          user_id: 'owner-1',
          role: 'admin',
          is_active: false,
          account_owner_user_id: 'owner-1',
        },
      }),
    ).toBe(false);
  });

  it('contractor/non-internal fails route-friendly response check', () => {
    const contractorResponse = requireFinancialExportAccessOrResponse({
      actorUserId: 'contractor-user-1',
      internalUser: null,
      requestUrl: 'http://localhost:3000/reports/invoices/export',
      unauthorizedRedirectPath: '/reports/invoices?banner=not_authorized',
    });

    expect(contractorResponse?.status).toBe(307);
    expect(contractorResponse?.headers.get('location')).toContain('/reports/invoices?banner=not_authorized');

    const unauthenticatedResponse = requireFinancialExportAccessOrResponse({
      actorUserId: null,
      internalUser: null,
      requestUrl: 'http://localhost:3000/reports/invoices/export',
      loginRedirectPath: '/login',
    });

    expect(unauthenticatedResponse?.status).toBe(307);
    expect(unauthenticatedResponse?.headers.get('location')).toContain('/login');
  });
});