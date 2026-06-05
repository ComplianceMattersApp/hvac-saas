import { redirect } from 'next/navigation';
import { canManageInvoiceLifecycle } from '@/lib/auth/financial-access';

type FieldBillingInternalUserLike = {
  user_id?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  account_owner_user_id?: string | null;
} | null | undefined;

export type FieldBillingAccessParams = {
  actorUserId?: string | null;
  internalUser?: FieldBillingInternalUserLike;
  resourceAccountOwnerUserId?: string | null;
  explicitCapabilities?: Partial<FieldBillingCapabilities> | null;
};

export type FieldBillingCapabilities = {
  field_billing_enabled: boolean;
  can_view_field_billing_summary: boolean;

  // Proposal / office-review mode capabilities.
  can_select_pricebook_lines: boolean;
  can_convert_visit_scope_to_invoice_line: boolean;
  can_add_manual_charge: boolean;
  can_edit_charge_description: boolean;
  can_edit_charge_quantity: boolean;
  can_edit_charge_price: boolean;
  can_remove_field_charge: boolean;
  can_submit_field_charges_for_review: boolean;
  can_approve_field_charges: boolean;

  // Authorized direct-invoice mode capabilities.
  can_create_direct_invoice_draft: boolean;
  can_select_pricebook_invoice_lines: boolean;
  can_convert_visit_scope_to_invoice_lines: boolean;
  can_add_manual_invoice_line: boolean;
  can_edit_invoice_line_description: boolean;
  can_edit_invoice_line_quantity: boolean;
  can_edit_invoice_line_price: boolean;
  can_remove_invoice_line: boolean;

  // Lifecycle capabilities (future-split friendly; currently true for financial authority).
  can_issue_invoice: boolean;
  can_send_invoice: boolean;

  // Payment/reporting capabilities remain separate from direct invoice authority.
  can_collect_card_payment: boolean;
  can_report_non_card_collection: boolean;
  can_verify_non_card_collection: boolean;
};

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function hasAccountScopeAccess(params: FieldBillingAccessParams) {
  const internalOwnerUserId = normalize(params.internalUser?.account_owner_user_id);
  const resourceOwnerUserId = normalize(params.resourceAccountOwnerUserId);
  if (!resourceOwnerUserId) return true;
  return Boolean(internalOwnerUserId) && internalOwnerUserId === resourceOwnerUserId;
}

function hasActiveScopedInternalUser(params: FieldBillingAccessParams) {
  const internalUser = params.internalUser;
  return Boolean(
    internalUser
      && internalUser.is_active
      && normalize(internalUser.user_id)
      && normalize(internalUser.account_owner_user_id)
      && hasAccountScopeAccess(params),
  );
}

function allFalse(): FieldBillingCapabilities {
  return {
    field_billing_enabled: false,
    can_view_field_billing_summary: false,
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
    can_collect_card_payment: false,
    can_report_non_card_collection: false,
    can_verify_non_card_collection: false,
  };
}

function financialAuthorityDefaults(): FieldBillingCapabilities {
  return {
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

    can_collect_card_payment: true,
    can_report_non_card_collection: true,
    can_verify_non_card_collection: true,
  };
}

function readOnlyInternal(): FieldBillingCapabilities {
  return {
    ...allFalse(),
    can_view_field_billing_summary: true,
  };
}

export function resolveFieldBillingCapabilities(params: FieldBillingAccessParams): FieldBillingCapabilities {
  if (!hasActiveScopedInternalUser(params)) {
    return allFalse();
  }

  if (canManageInvoiceLifecycle(params)) {
    return financialAuthorityDefaults();
  }

  const explicit = params.explicitCapabilities ?? {};
  const enabled = explicit.field_billing_enabled === true;

  if (!enabled) {
    return readOnlyInternal();
  }

  const canSelectPricebookProposals = explicit.can_select_pricebook_lines === true;
  const canConvertVisitScopeProposals = explicit.can_convert_visit_scope_to_invoice_line === true;
  const canAddManualProposals = explicit.can_add_manual_charge === true;
  const canEditProposalDescription = explicit.can_edit_charge_description === true;
  const canEditProposalQuantity = explicit.can_edit_charge_quantity === true;
  const canEditProposalPrice = explicit.can_edit_charge_price === true;
  const canRemoveProposalCharge = explicit.can_remove_field_charge === true;

  const canCreateDirectInvoiceDraft = explicit.can_create_direct_invoice_draft === true;
  const canSelectPricebookInvoiceLines = explicit.can_select_pricebook_invoice_lines === true;
  const canConvertVisitScopeInvoiceLines = explicit.can_convert_visit_scope_to_invoice_lines === true;
  const canAddManualInvoiceLine = explicit.can_add_manual_invoice_line === true;
  const canEditInvoiceLineDescription = explicit.can_edit_invoice_line_description === true;
  const canEditInvoiceLineQuantity = explicit.can_edit_invoice_line_quantity === true;
  const canEditInvoiceLinePrice = explicit.can_edit_invoice_line_price === true;
  const canRemoveInvoiceLine = explicit.can_remove_invoice_line === true;

  return {
    field_billing_enabled: true,
    can_view_field_billing_summary: explicit.can_view_field_billing_summary !== false,
    can_select_pricebook_lines: canSelectPricebookProposals,
    can_convert_visit_scope_to_invoice_line: canConvertVisitScopeProposals,
    can_add_manual_charge: canAddManualProposals,
    can_edit_charge_description: canEditProposalDescription,
    can_edit_charge_quantity: canEditProposalQuantity,
    can_edit_charge_price: canEditProposalPrice,
    can_remove_field_charge: canRemoveProposalCharge,
    can_submit_field_charges_for_review: explicit.can_submit_field_charges_for_review === true,
    can_approve_field_charges: explicit.can_approve_field_charges === true,

    can_create_direct_invoice_draft: canCreateDirectInvoiceDraft,
    can_select_pricebook_invoice_lines: canSelectPricebookInvoiceLines,
    can_convert_visit_scope_to_invoice_lines: canConvertVisitScopeInvoiceLines,
    can_add_manual_invoice_line: canAddManualInvoiceLine,
    can_edit_invoice_line_description: canEditInvoiceLineDescription,
    can_edit_invoice_line_quantity: canEditInvoiceLineQuantity,
    can_edit_invoice_line_price: canEditInvoiceLinePrice,
    can_remove_invoice_line: canRemoveInvoiceLine,

    can_issue_invoice: explicit.can_issue_invoice === true,
    can_send_invoice: explicit.can_send_invoice === true,

    can_collect_card_payment: explicit.can_collect_card_payment === true,
    can_report_non_card_collection: explicit.can_report_non_card_collection === true,
    can_verify_non_card_collection: explicit.can_verify_non_card_collection === true,
  };
}

export function hasDirectInvoiceDraftMutationAccess(capabilities: FieldBillingCapabilities) {
  return Boolean(
    capabilities.can_create_direct_invoice_draft
      || capabilities.can_select_pricebook_invoice_lines
      || capabilities.can_convert_visit_scope_to_invoice_lines
      || capabilities.can_add_manual_invoice_line
      || capabilities.can_edit_invoice_line_description
      || capabilities.can_edit_invoice_line_quantity
      || capabilities.can_edit_invoice_line_price
      || capabilities.can_remove_invoice_line,
  );
}

type FieldBillingRedirectParams = FieldBillingAccessParams & {
  redirectTo: string;
};

export function requireManualFieldChargeAccessOrRedirect(params: FieldBillingRedirectParams) {
  const capabilities = resolveFieldBillingCapabilities(params);
  if (
    capabilities.can_add_manual_invoice_line
    && capabilities.can_edit_invoice_line_description
    && capabilities.can_edit_invoice_line_quantity
    && capabilities.can_edit_invoice_line_price
  ) {
    return;
  }

  redirect(params.redirectTo);
}

export function requirePricebookFieldChargeAccessOrRedirect(params: FieldBillingRedirectParams) {
  if (resolveFieldBillingCapabilities(params).can_select_pricebook_invoice_lines) {
    return;
  }

  redirect(params.redirectTo);
}

export function requireVisitScopeFieldChargeAccessOrRedirect(params: FieldBillingRedirectParams) {
  if (resolveFieldBillingCapabilities(params).can_convert_visit_scope_to_invoice_lines) {
    return;
  }

  redirect(params.redirectTo);
}

export function requireFieldChargeEditAccessOrRedirect(params: FieldBillingRedirectParams) {
  const capabilities = resolveFieldBillingCapabilities(params);
  if (
    capabilities.can_edit_invoice_line_description
    && capabilities.can_edit_invoice_line_quantity
    && capabilities.can_edit_invoice_line_price
  ) {
    return;
  }

  redirect(params.redirectTo);
}

export function requireFieldChargeRemoveAccessOrRedirect(params: FieldBillingRedirectParams) {
  if (resolveFieldBillingCapabilities(params).can_remove_invoice_line) {
    return;
  }

  redirect(params.redirectTo);
}
