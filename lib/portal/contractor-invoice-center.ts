import { createAdminClient } from "@/lib/supabase/server";
import { requireCurrentContractorPortalContext, type CurrentContractorPortalContext } from "@/lib/portal/intake-proposal-read-model";
import { resolveInvoiceCollectedPaymentSummary } from "@/lib/business/internal-invoice-payments";

function clean(value: unknown) { return String(value ?? "").trim(); }

async function context(input?: { context?: CurrentContractorPortalContext; supabase?: any }) {
  return input?.context ?? requireCurrentContractorPortalContext({ supabase: input?.supabase });
}

export async function listContractorBilledInvoices(input: { context?: CurrentContractorPortalContext; supabase?: any; admin?: any } = {}) {
  const portal = await context(input);
  const admin = input.admin ?? createAdminClient();
  const { data, error } = await admin.from("internal_invoices")
    .select("id, invoice_display_number, invoice_number, invoice_date, issued_at, total_cents, billing_name")
    .eq("account_owner_user_id", portal.accountOwnerUserId)
    .eq("bill_to_kind", "contractor")
    .eq("bill_to_contractor_id", portal.contractorId)
    .eq("status", "issued")
    .order("issued_at", { ascending: false })
    .limit(250);
  if (error) throw error;

  return Promise.all((data ?? []).map(async (invoice: any) => {
    const summary = await resolveInvoiceCollectedPaymentSummary(portal.accountOwnerUserId, invoice.id, admin);
    return { ...invoice, reference: clean(invoice.invoice_display_number || invoice.invoice_number) || invoice.id, ...summary };
  }));
}

export async function loadContractorBilledInvoice(input: { invoiceId: string; context?: CurrentContractorPortalContext; supabase?: any; admin?: any }) {
  const portal = await context(input);
  const admin = input.admin ?? createAdminClient();
  const { data: invoice, error } = await admin.from("internal_invoices")
    .select("id, account_owner_user_id, job_id, invoice_display_number, invoice_number, invoice_date, issued_at, subtotal_cents, total_cents, billing_name, billing_email, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip")
    .eq("id", clean(input.invoiceId))
    .eq("account_owner_user_id", portal.accountOwnerUserId)
    .eq("bill_to_kind", "contractor")
    .eq("bill_to_contractor_id", portal.contractorId)
    .eq("status", "issued")
    .maybeSingle();
  if (error) throw error;
  if (!invoice?.id) return null;

  const [{ data: lineItems, error: lineError }, summary] = await Promise.all([
    admin.from("internal_invoice_line_items").select("id, sort_order, item_name_snapshot, description_snapshot, quantity, unit_label_snapshot, unit_price, line_subtotal").eq("invoice_id", invoice.id).order("sort_order", { ascending: true }),
    resolveInvoiceCollectedPaymentSummary(portal.accountOwnerUserId, invoice.id, admin),
  ]);
  if (lineError) throw lineError;
  return { invoice, lineItems: lineItems ?? [], summary, portal };
}
