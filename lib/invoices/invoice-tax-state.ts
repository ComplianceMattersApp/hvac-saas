/**
 * Read-side helper for invoice sales tax.
 *
 * Deliberately NOT folded into INTERNAL_INVOICE_SELECT: that select feeds every
 * invoice read in the app, so adding columns to it would turn a lagging
 * migration into an app-wide 42703 outage. This is an additive, separately
 * tolerated read — with the migration unapplied, callers get `null` and every
 * surface behaves exactly as it did before tax existed.
 *
 * Same pattern as lib/qbo/qbo-void-state.ts.
 */

import { normalizeTaxRatePercent } from "./invoice-tax";

export type InvoiceTaxState = {
  ratePercent: number | null;
  taxCents: number;
  label: string | null;
};

export type AccountTaxDefaults = {
  ratePercent: number | null;
  label: string | null;
};

const INVOICE_TAX_SELECT = "id, tax_rate_percent, tax_cents, tax_label";
const LINE_ITEM_TAX_SELECT = "id, is_taxable";

/** True when the failure is "these columns aren't deployed yet", not a real error. */
export function isMissingInvoiceTaxColumnError(error: unknown): boolean {
  const code = String((error as any)?.code ?? "").trim();
  const message = String((error as any)?.message ?? "").toLowerCase();
  const namesTaxColumn =
    message.includes("tax_rate_percent")
    || message.includes("tax_cents")
    || message.includes("tax_label")
    || message.includes("is_taxable")
    || message.includes("tax_exempt");
  if (code === "42703") return namesTaxColumn;
  return message.includes("column") && namesTaxColumn && message.includes("does not exist");
}

function toState(row: any): InvoiceTaxState {
  return {
    ratePercent: normalizeTaxRatePercent(row?.tax_rate_percent),
    taxCents: Number(row?.tax_cents ?? 0) || 0,
    label: String(row?.tax_label ?? "").trim() || null,
  };
}

/**
 * Tax state for one invoice.
 *
 * Returns null ONLY when the state could not be read at all — columns not
 * deployed, or the row is unreadable. Callers treat null as "this deployment
 * has no tax", which is exactly the pre-slice behavior.
 */
export async function readInvoiceTaxState(params: {
  supabase: any;
  invoiceId: string;
  accountOwnerUserId?: string | null;
}): Promise<InvoiceTaxState | null> {
  const invoiceId = String(params.invoiceId ?? "").trim();
  if (!invoiceId) return null;

  try {
    let query = params.supabase.from("internal_invoices").select(INVOICE_TAX_SELECT).eq("id", invoiceId);
    const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
    if (accountOwnerUserId) query = query.eq("account_owner_user_id", accountOwnerUserId);
    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return toState(data);
  } catch {
    return null;
  }
}

/** Per-line taxability for one invoice, keyed by line item id. Empty when undeployed. */
export async function readInvoiceLineTaxability(params: {
  supabase: any;
  invoiceId: string;
}): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const invoiceId = String(params.invoiceId ?? "").trim();
  if (!invoiceId) return result;

  try {
    const { data, error } = await params.supabase
      .from("internal_invoice_line_items")
      .select(LINE_ITEM_TAX_SELECT)
      .eq("invoice_id", invoiceId);
    if (error || !data) return result;
    for (const row of data) result.set(String(row.id), Boolean(row.is_taxable));
    return result;
  } catch {
    return result;
  }
}

/**
 * Whether the account-default tax columns exist on this deployment.
 *
 * Distinct from "no default configured": the admin UI renders the rate fields
 * only when they can actually be saved, so an unapplied migration shows no tax
 * settings at all rather than a control that silently does nothing.
 */
export async function accountTaxColumnsDeployed(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<boolean> {
  try {
    const { error } = await params.supabase
      .from("internal_business_profiles")
      .select("default_tax_rate_percent")
      .eq("account_owner_user_id", String(params.accountOwnerUserId ?? "").trim())
      .maybeSingle();
    return !error;
  } catch {
    return false;
  }
}

/** The account's default rate/label, or nulls when unset or undeployed. */
export async function readAccountTaxDefaults(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<AccountTaxDefaults> {
  const empty: AccountTaxDefaults = { ratePercent: null, label: null };
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!accountOwnerUserId) return empty;

  try {
    const { data, error } = await params.supabase
      .from("internal_business_profiles")
      .select("default_tax_rate_percent, default_tax_label")
      .eq("account_owner_user_id", accountOwnerUserId)
      .maybeSingle();
    if (error || !data) return empty;
    return {
      ratePercent: normalizeTaxRatePercent(data.default_tax_rate_percent),
      label: String(data.default_tax_label ?? "").trim() || null,
    };
  } catch {
    return empty;
  }
}

/**
 * Whether a pricebook item is taxable. False when unset or undeployed — read
 * separately from the item's own SELECT so a lagging migration cannot break
 * adding a line.
 */
export async function readPricebookItemTaxable(params: {
  supabase: any;
  pricebookItemId: unknown;
}): Promise<boolean> {
  const pricebookItemId = String(params.pricebookItemId ?? "").trim();
  if (!pricebookItemId) return false;
  try {
    const { data, error } = await params.supabase
      .from("pricebook_items")
      .select("id, is_taxable")
      .eq("id", pricebookItemId)
      .maybeSingle();
    if (error || !data) return false;
    return Boolean(data.is_taxable);
  } catch {
    return false;
  }
}

/**
 * Taxability for a specific set of pricebook items, keyed by id.
 *
 * Batched so a conversion importing many lines makes one query, not one per
 * line. Missing ids and an undeployed column both read as non-taxable.
 */
export async function readPricebookTaxabilityByIds(params: {
  supabase: any;
  pricebookItemIds: unknown[];
}): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const ids = [...new Set((params.pricebookItemIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return result;
  try {
    const { data, error } = await params.supabase
      .from("pricebook_items")
      .select("id, is_taxable")
      .in("id", ids);
    if (error || !data) return result;
    for (const row of data) result.set(String(row.id), Boolean(row.is_taxable));
    return result;
  } catch {
    return result;
  }
}

/**
 * Taxability for an account's whole catalog, keyed by pricebook item id.
 *
 * Returns null when the column is not deployed — meaningfully different from an
 * empty map, because the admin UI uses it to decide whether to render the
 * Taxable control at all.
 */
export async function readPricebookTaxability(params: {
  supabase: any;
  accountOwnerUserId: string;
}): Promise<Map<string, boolean> | null> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!accountOwnerUserId) return null;
  try {
    const { data, error } = await params.supabase
      .from("pricebook_items")
      .select("id, is_taxable")
      .eq("account_owner_user_id", accountOwnerUserId);
    if (error || !data) return null;
    return new Map(data.map((row: any) => [String(row.id), Boolean(row.is_taxable)]));
  } catch {
    return null;
  }
}

/** Whether the bill-to customer holds an exemption. False when unset or undeployed. */
export async function readCustomerTaxExempt(params: {
  supabase: any;
  customerId: unknown;
}): Promise<boolean> {
  const customerId = String(params.customerId ?? "").trim();
  if (!customerId) return false;

  try {
    const { data, error } = await params.supabase
      .from("customers")
      .select("id, tax_exempt")
      .eq("id", customerId)
      .maybeSingle();
    if (error || !data) return false;
    return Boolean(data.tax_exempt);
  } catch {
    return false;
  }
}
