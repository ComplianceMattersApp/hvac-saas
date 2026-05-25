import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

type FinancialInternalUserLike = {
  user_id?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  account_owner_user_id?: string | null;
} | null | undefined;

type FinancialAccessParams = {
  actorUserId?: string | null;
  internalUser?: FinancialInternalUserLike;
  resourceAccountOwnerUserId?: string | null;
};

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function hasAccountScopeAccess(params: FinancialAccessParams) {
  const internalOwnerUserId = normalize(params.internalUser?.account_owner_user_id);
  const resourceOwnerUserId = normalize(params.resourceAccountOwnerUserId);
  if (!resourceOwnerUserId) return true;
  return Boolean(internalOwnerUserId) && internalOwnerUserId === resourceOwnerUserId;
}

function hasActiveInternalUser(params: FinancialAccessParams) {
  const internalUser = params.internalUser;
  return Boolean(
    internalUser
      && internalUser.is_active
      && normalize(internalUser.user_id)
      && normalize(internalUser.account_owner_user_id),
  );
}

function resolveActorUserId(params: FinancialAccessParams) {
  const explicit = normalize(params.actorUserId);
  if (explicit) return explicit;
  return normalize(params.internalUser?.user_id);
}

export function isStructuralAccountOwner(params: FinancialAccessParams) {
  if (!hasActiveInternalUser(params)) return false;
  if (!hasAccountScopeAccess(params)) return false;
  const actorUserId = resolveActorUserId(params);
  const accountOwnerUserId = normalize(params.internalUser?.account_owner_user_id);
  return Boolean(actorUserId) && Boolean(accountOwnerUserId) && actorUserId === accountOwnerUserId;
}

function hasAdminFinancialRole(params: FinancialAccessParams) {
  if (!hasActiveInternalUser(params)) return false;
  if (!hasAccountScopeAccess(params)) return false;
  const role = normalize(params.internalUser?.role).toLowerCase();
  return role === 'admin' || role === 'billing';
}

function hasFinancialAuthority(params: FinancialAccessParams) {
  return isStructuralAccountOwner(params) || hasAdminFinancialRole(params);
}

export function canViewFinancialRegister(params: FinancialAccessParams) {
  return hasFinancialAuthority(params);
}

export function canRecordInvoicePayment(params: FinancialAccessParams) {
  return hasFinancialAuthority(params);
}

export function canCreateTenantInvoicePaymentLink(params: FinancialAccessParams) {
  return hasFinancialAuthority(params);
}

export function canExportFinancialData(params: FinancialAccessParams) {
  return hasFinancialAuthority(params);
}

export function requireInvoicePaymentRecordAccessOrRedirect(params: FinancialAccessParams & {
  redirectTo: string;
}) {
  if (canRecordInvoicePayment(params)) {
    return;
  }

  redirect(params.redirectTo);
}

export function requireTenantInvoicePaymentLinkAccessOrRedirect(params: FinancialAccessParams & {
  redirectTo: string;
}) {
  if (canCreateTenantInvoicePaymentLink(params)) {
    return;
  }

  redirect(params.redirectTo);
}

export function requireFinancialExportAccessOrRedirect(params: FinancialAccessParams & {
  redirectTo: string;
}) {
  if (canExportFinancialData(params)) {
    return;
  }

  redirect(params.redirectTo);
}

export function requireFinancialExportAccessOrResponse(
  params: FinancialAccessParams & {
    requestUrl: string;
    unauthorizedRedirectPath?: string;
    loginRedirectPath?: string;
  },
) {
  if (canExportFinancialData(params)) {
    return null;
  }

  const actorUserId = resolveActorUserId(params);
  const targetPath = actorUserId
    ? (params.unauthorizedRedirectPath ?? '/reports/invoices?banner=not_authorized')
    : (params.loginRedirectPath ?? '/login');

  return NextResponse.redirect(new URL(targetPath, params.requestUrl));
}