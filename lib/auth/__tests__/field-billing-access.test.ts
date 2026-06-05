import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import {
  requireFieldInvoiceIssueAccessOrRedirect,
  requireFieldInvoiceSendAccessOrRedirect,
  requireFieldChargeEditAccessOrRedirect,
  requireFieldChargeRemoveAccessOrRedirect,
  requireManualFieldChargeAccessOrRedirect,
  requirePricebookFieldChargeAccessOrRedirect,
  requireVisitScopeFieldChargeAccessOrRedirect,
  resolveFieldBillingCapabilities,
} from '@/lib/auth/field-billing-access';
import {
  canExportFinancialData,
  canManageInvoiceLifecycle,
  canRecordInvoicePayment,
} from '@/lib/auth/financial-access';

function internalUser(role: string, overrides: Record<string, unknown> = {}) {
  return {
    user_id: `${role}-1`,
    role,
    is_active: true,
    account_owner_user_id: 'owner-1',
    ...overrides,
  };
}

const expectedFinancialCapabilities = {
  field_billing_enabled: true,
  can_view_field_billing_summary: true,
  can_select_pricebook_lines: true,
  can_convert_visit_scope_to_invoice_line: true,
  can_add_manual_charge: true,
  can_edit_charge_description: true,
  can_edit_charge_quantity: true,
  can_edit_charge_price: true,
  can_remove_field_charge: true,
  can_submit_field_charges_for_review: true,
  can_approve_field_charges: true,
  can_create_direct_invoice_draft: true,
  can_select_pricebook_invoice_lines: true,
  can_convert_visit_scope_to_invoice_lines: true,
  can_add_manual_invoice_line: true,
  can_edit_invoice_line_description: true,
  can_edit_invoice_line_quantity: true,
  can_edit_invoice_line_price: true,
  can_remove_invoice_line: true,
  can_issue_invoice: true,
  can_send_invoice: true,
  can_collect_field_payment: true,
  can_collect_card_payment: true,
  can_report_non_card_collection: true,
  can_verify_non_card_collection: true,
};

const expectedReadOnlyCapabilities = {
  ...expectedFinancialCapabilities,
  field_billing_enabled: false,
  can_select_pricebook_lines: false,
  can_convert_visit_scope_to_invoice_line: false,
  can_add_manual_charge: false,
  can_edit_charge_description: false,
  can_edit_charge_quantity: false,
  can_edit_charge_price: false,
  can_remove_field_charge: false,
  can_submit_field_charges_for_review: false,
  can_approve_field_charges: false,
  can_create_direct_invoice_draft: false,
  can_select_pricebook_invoice_lines: false,
  can_convert_visit_scope_to_invoice_lines: false,
  can_add_manual_invoice_line: false,
  can_edit_invoice_line_description: false,
  can_edit_invoice_line_quantity: false,
  can_edit_invoice_line_price: false,
  can_remove_invoice_line: false,
  can_issue_invoice: false,
  can_send_invoice: false,
  can_collect_field_payment: false,
  can_collect_card_payment: false,
  can_report_non_card_collection: false,
  can_verify_non_card_collection: false,
};

describe('field billing access helper', () => {
  it('resolves full field billing capabilities for structural owner', () => {
    expect(
      resolveFieldBillingCapabilities({
        actorUserId: 'owner-1',
        internalUser: internalUser('office', { user_id: 'owner-1' }),
        resourceAccountOwnerUserId: 'owner-1',
      }),
    ).toEqual(expectedFinancialCapabilities);
  });

  it('resolves full field billing capabilities for admin and billing', () => {
    expect(
      resolveFieldBillingCapabilities({
        actorUserId: 'admin-1',
        internalUser: internalUser('admin', { user_id: 'admin-1' }),
        resourceAccountOwnerUserId: 'owner-1',
      }),
    ).toEqual(expectedFinancialCapabilities);

    expect(
      resolveFieldBillingCapabilities({
        actorUserId: 'billing-1',
        internalUser: internalUser('billing', { user_id: 'billing-1' }),
        resourceAccountOwnerUserId: 'owner-1',
      }),
    ).toEqual(expectedFinancialCapabilities);
  });

  it('resolves read-only billing summary visibility for technician and office/dispatcher users by default', () => {
    for (const role of ['tech', 'technician', 'office', 'dispatcher']) {
      expect(
        resolveFieldBillingCapabilities({
          actorUserId: `${role}-1`,
          internalUser: internalUser(role),
          resourceAccountOwnerUserId: 'owner-1',
        }),
      ).toEqual(expectedReadOnlyCapabilities);
    }
  });

  it('keeps office allowed only when they are structural owner', () => {
    expect(
      resolveFieldBillingCapabilities({
        actorUserId: 'owner-1',
        internalUser: internalUser('office', { user_id: 'owner-1' }),
        resourceAccountOwnerUserId: 'owner-1',
      }).can_add_manual_invoice_line,
    ).toBe(true);

    expect(
      resolveFieldBillingCapabilities({
        actorUserId: 'office-1',
        internalUser: internalUser('office', { user_id: 'office-1' }),
        resourceAccountOwnerUserId: 'owner-1',
      }),
    ).toEqual(expectedReadOnlyCapabilities);
  });

  it('resolves false for inactive, contractor/portal, and unauthenticated contexts', () => {
    expect(
      resolveFieldBillingCapabilities({
        actorUserId: 'admin-1',
        internalUser: internalUser('admin', { user_id: 'admin-1', is_active: false }),
        resourceAccountOwnerUserId: 'owner-1',
      }).field_billing_enabled,
    ).toBe(false);

    expect(
      resolveFieldBillingCapabilities({
        actorUserId: 'contractor-1',
        internalUser: null,
        resourceAccountOwnerUserId: 'owner-1',
      }).field_billing_enabled,
    ).toBe(false);

    expect(
      resolveFieldBillingCapabilities({
        actorUserId: null,
        internalUser: null,
        resourceAccountOwnerUserId: 'owner-1',
      }).field_billing_enabled,
    ).toBe(false);
  });

  it('requires account scope before honoring financial authority or explicit future capabilities', () => {
    expect(
      resolveFieldBillingCapabilities({
        actorUserId: 'admin-1',
        internalUser: internalUser('admin', { user_id: 'admin-1' }),
        resourceAccountOwnerUserId: 'other-owner',
      }).field_billing_enabled,
    ).toBe(false);

    expect(
      resolveFieldBillingCapabilities({
        actorUserId: 'tech-1',
        internalUser: internalUser('tech'),
        resourceAccountOwnerUserId: 'other-owner',
        explicitCapabilities: {
          field_billing_enabled: true,
          can_add_manual_charge: true,
          can_edit_charge_price: true,
        },
      }).can_add_manual_charge,
    ).toBe(false);
  });

  it('can model explicit future field billing permissions without granting financial authority', () => {
    const capabilities = resolveFieldBillingCapabilities({
      actorUserId: 'tech-1',
      internalUser: internalUser('tech'),
      resourceAccountOwnerUserId: 'owner-1',
      explicitCapabilities: {
        field_billing_enabled: true,
        can_view_field_billing_summary: true,
        can_select_pricebook_lines: true,
        can_select_pricebook_invoice_lines: true,
        can_edit_charge_quantity: true,
        can_edit_invoice_line_quantity: true,
      },
    });

    expect(capabilities.field_billing_enabled).toBe(true);
    expect(capabilities.can_view_field_billing_summary).toBe(true);
    expect(capabilities.can_select_pricebook_lines).toBe(true);
    expect(capabilities.can_select_pricebook_invoice_lines).toBe(true);
    expect(capabilities.can_edit_charge_quantity).toBe(true);
    expect(capabilities.can_edit_invoice_line_quantity).toBe(true);
    expect(capabilities.can_add_manual_charge).toBe(false);
    expect(capabilities.can_add_manual_invoice_line).toBe(false);
    expect(capabilities.can_edit_charge_price).toBe(false);
    expect(capabilities.can_edit_invoice_line_price).toBe(false);
    expect(capabilities.can_collect_card_payment).toBe(false);
    expect(capabilities.can_verify_non_card_collection).toBe(false);
  });

  it('does not imply payment collection or verification from direct invoice capability alone', () => {
    const capabilities = resolveFieldBillingCapabilities({
      actorUserId: 'tech-1',
      internalUser: internalUser('tech'),
      resourceAccountOwnerUserId: 'owner-1',
      explicitCapabilities: {
        field_billing_enabled: true,
        can_view_field_billing_summary: true,
        can_create_direct_invoice_draft: true,
        can_select_pricebook_invoice_lines: true,
        can_edit_invoice_line_quantity: true,
      },
    });

    expect(capabilities.can_create_direct_invoice_draft).toBe(true);
    expect(capabilities.can_select_pricebook_invoice_lines).toBe(true);
    expect(capabilities.can_edit_invoice_line_quantity).toBe(true);
    expect(capabilities.can_collect_card_payment).toBe(false);
    expect(capabilities.can_verify_non_card_collection).toBe(false);
    expect(capabilities.can_issue_invoice).toBe(false);
    expect(capabilities.can_send_invoice).toBe(false);
  });

  it('can grant issue/send explicitly without granting payment collection authority', () => {
    const capabilities = resolveFieldBillingCapabilities({
      actorUserId: 'tech-1',
      internalUser: internalUser('tech'),
      resourceAccountOwnerUserId: 'owner-1',
      explicitCapabilities: {
        field_billing_enabled: true,
        can_view_field_billing_summary: true,
        can_issue_invoice: true,
        can_send_invoice: true,
      },
    });

    expect(capabilities.can_issue_invoice).toBe(true);
    expect(capabilities.can_send_invoice).toBe(true);
    expect(capabilities.can_collect_card_payment).toBe(false);
    expect(capabilities.can_verify_non_card_collection).toBe(false);
  });

  it('can grant collect-card capability without granting issue/send authority', () => {
    const capabilities = resolveFieldBillingCapabilities({
      actorUserId: 'tech-1',
      internalUser: internalUser('tech'),
      resourceAccountOwnerUserId: 'owner-1',
      explicitCapabilities: {
        field_billing_enabled: true,
        can_view_field_billing_summary: true,
        can_collect_card_payment: true,
      },
    });

    expect(capabilities.can_collect_card_payment).toBe(true);
    expect(capabilities.can_collect_field_payment).toBe(true);
    expect(capabilities.can_issue_invoice).toBe(false);
    expect(capabilities.can_send_invoice).toBe(false);
    expect(capabilities.can_verify_non_card_collection).toBe(false);
  });

  it('can grant report-non-card capability without granting verification or financial authority', () => {
    const params = {
      actorUserId: 'tech-1',
      internalUser: internalUser('tech'),
      resourceAccountOwnerUserId: 'owner-1',
      explicitCapabilities: {
        field_billing_enabled: true,
        can_view_field_billing_summary: true,
        can_report_non_card_collection: true,
      },
    };

    const capabilities = resolveFieldBillingCapabilities(params);

    expect(capabilities.can_collect_field_payment).toBe(true);
    expect(capabilities.can_collect_card_payment).toBe(false);
    expect(capabilities.can_report_non_card_collection).toBe(true);
    expect(capabilities.can_verify_non_card_collection).toBe(false);

    expect(canManageInvoiceLifecycle(params)).toBe(false);
    expect(canRecordInvoicePayment(params)).toBe(false);
    expect(canExportFinancialData(params)).toBe(false);
  });

  it('does not infer field collection family from verification-only capability', () => {
    const capabilities = resolveFieldBillingCapabilities({
      actorUserId: 'tech-1',
      internalUser: internalUser('tech'),
      resourceAccountOwnerUserId: 'owner-1',
      explicitCapabilities: {
        field_billing_enabled: true,
        can_view_field_billing_summary: true,
        can_verify_non_card_collection: true,
      },
    });

    expect(capabilities.can_collect_field_payment).toBe(false);
    expect(capabilities.can_collect_card_payment).toBe(false);
    expect(capabilities.can_report_non_card_collection).toBe(false);
    expect(capabilities.can_verify_non_card_collection).toBe(true);
  });

  it('redirect helpers deny missing charge-authoring capabilities', () => {
    const params = {
      actorUserId: 'tech-1',
      internalUser: internalUser('tech'),
      resourceAccountOwnerUserId: 'owner-1',
      redirectTo: '/jobs/job-1?banner=not_authorized',
    };

    expect(() => requireManualFieldChargeAccessOrRedirect(params)).toThrow(
      'REDIRECT:/jobs/job-1?banner=not_authorized',
    );
    expect(() => requirePricebookFieldChargeAccessOrRedirect(params)).toThrow(
      'REDIRECT:/jobs/job-1?banner=not_authorized',
    );
    expect(() => requireVisitScopeFieldChargeAccessOrRedirect(params)).toThrow(
      'REDIRECT:/jobs/job-1?banner=not_authorized',
    );
    expect(() => requireFieldChargeEditAccessOrRedirect(params)).toThrow(
      'REDIRECT:/jobs/job-1?banner=not_authorized',
    );
    expect(() => requireFieldChargeRemoveAccessOrRedirect(params)).toThrow(
      'REDIRECT:/jobs/job-1?banner=not_authorized',
    );
    expect(() => requireFieldInvoiceIssueAccessOrRedirect(params)).toThrow(
      'REDIRECT:/jobs/job-1?banner=not_authorized',
    );
    expect(() => requireFieldInvoiceSendAccessOrRedirect(params)).toThrow(
      'REDIRECT:/jobs/job-1?banner=not_authorized',
    );
  });

  it('allows edit helper when any direct invoice line edit capability is granted', () => {
    const params = {
      actorUserId: 'tech-1',
      internalUser: internalUser('tech'),
      resourceAccountOwnerUserId: 'owner-1',
      redirectTo: '/jobs/job-1?banner=not_authorized',
      explicitCapabilities: {
        field_billing_enabled: true,
        can_view_field_billing_summary: true,
        can_edit_invoice_line_quantity: true,
      },
    };

    expect(() => requireFieldChargeEditAccessOrRedirect(params)).not.toThrow();
  });

  it('allows manual helper with manual-add permission even when other edit bits are off', () => {
    const params = {
      actorUserId: 'tech-1',
      internalUser: internalUser('tech'),
      resourceAccountOwnerUserId: 'owner-1',
      redirectTo: '/jobs/job-1?banner=not_authorized',
      explicitCapabilities: {
        field_billing_enabled: true,
        can_view_field_billing_summary: true,
        can_add_manual_invoice_line: true,
      },
    };

    expect(() => requireManualFieldChargeAccessOrRedirect(params)).not.toThrow();
  });

  it('allows issue and send helpers when explicit lifecycle authority is granted', () => {
    const params = {
      actorUserId: 'tech-1',
      internalUser: internalUser('tech'),
      resourceAccountOwnerUserId: 'owner-1',
      redirectTo: '/jobs/job-1?banner=not_authorized',
      explicitCapabilities: {
        field_billing_enabled: true,
        can_view_field_billing_summary: true,
        can_issue_invoice: true,
        can_send_invoice: true,
      },
    };

    expect(() => requireFieldInvoiceIssueAccessOrRedirect(params)).not.toThrow();
    expect(() => requireFieldInvoiceSendAccessOrRedirect(params)).not.toThrow();
  });
});
