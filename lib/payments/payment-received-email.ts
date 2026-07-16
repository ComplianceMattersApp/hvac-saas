import { sendEmail } from "@/lib/email/sendEmail";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveInvoiceCollectedPaymentSummary } from "@/lib/business/internal-invoice-payments";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";

function clean(value: unknown) { return String(value ?? "").trim(); }
function escapeHtml(value: unknown) { return clean(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!); }
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }

export type PaymentReceivedEmailModel = {
  businessName: string;
  amountCents: number;
  balanceDueCents: number;
  invoiceNumber: string;
  billingName: string;
  paymentMethod: string;
  reference: string | null;
  paidAt: string;
  invoiceHref: string;
};

export function buildPaymentReceivedEmail(model: PaymentReceivedEmailModel) {
  const method = model.paymentMethod.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const subject = `Payment received: ${money(model.amountCents)} for invoice #${model.invoiceNumber}`;
  const text = [`Payment received`, `Amount: ${money(model.amountCents)}`, `Invoice: #${model.invoiceNumber}`, `Billed to: ${model.billingName}`, `Method: ${method}`, model.reference ? `Reference: ${model.reference}` : null, `Remaining balance: ${money(model.balanceDueCents)}`, `Open invoice: ${model.invoiceHref}`].filter(Boolean).join("\n");
  const html = `<div style="background:#f8fafc;padding:28px 16px;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><div style="padding:24px;border-bottom:1px solid #e2e8f0"><div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#2563eb">Payment received</div><h1 style="margin:8px 0 0;font-size:26px">${escapeHtml(model.businessName)}</h1></div><div style="padding:24px"><div style="font-size:32px;font-weight:700">${money(model.amountCents)}</div><p style="color:#475569">Recorded for invoice <strong>#${escapeHtml(model.invoiceNumber)}</strong>, billed to ${escapeHtml(model.billingName)}.</p><table style="width:100%;border-collapse:collapse;margin:20px 0"><tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b">Method</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${escapeHtml(method)}</td></tr>${model.reference ? `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b">Reference</td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${escapeHtml(model.reference)}</td></tr>` : ""}<tr><td style="padding:10px 0;color:#64748b">Remaining balance</td><td style="padding:10px 0;text-align:right;font-weight:700">${money(model.balanceDueCents)}</td></tr></table><a href="${escapeHtml(model.invoiceHref)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Open invoice</a><p style="margin:20px 0 0;font-size:12px;color:#64748b">This confirms Compliance Matters payment truth only. QuickBooks synchronization is tracked separately.</p></div></div></div>`;
  return { subject, text, html };
}

async function resolveRecipient(admin: any, accountOwnerUserId: string) {
  const business = await resolveInternalBusinessIdentityByAccountOwnerId({ accountOwnerUserId, supabase: admin });
  if (clean(business.support_email).includes("@")) return { email: clean(business.support_email).toLowerCase(), business };
  const { data } = await admin.from("profiles").select("email").eq("id", accountOwnerUserId).maybeSingle();
  const email = clean(data?.email).toLowerCase();
  return { email: email.includes("@") ? email : null, business };
}

export async function deliverInternalPaymentReceivedEmail(params: { paymentId: string; admin?: any }) {
  const admin = params.admin ?? createAdminClient();
  const paymentId = clean(params.paymentId);
  if (!paymentId) return { sent: false, reason: "missing_payment_id" };
  const { data: payment, error } = await admin.from("internal_invoice_payments").select("id, account_owner_user_id, invoice_id, job_id, payment_status, payment_method, amount_cents, paid_at, received_reference").eq("id", paymentId).maybeSingle();
  if (error || !payment?.id || payment.payment_status !== "recorded") return { sent: false, reason: "payment_not_recorded" };
  const { email, business } = await resolveRecipient(admin, payment.account_owner_user_id);
  if (!email) return { sent: false, reason: "recipient_missing" };

  const { data: claim, error: claimError } = await admin.from("internal_payment_email_deliveries").insert({ account_owner_user_id: payment.account_owner_user_id, internal_invoice_payment_id: payment.id, recipient_email: email }).select("id").single();
  if (claimError) return { sent: false, reason: String(claimError.code) === "23505" ? "already_claimed" : "claim_failed" };

  try {
    const { data: invoice } = await admin.from("internal_invoices").select("invoice_display_number, invoice_number, billing_name").eq("id", payment.invoice_id).maybeSingle();
    const summary = await resolveInvoiceCollectedPaymentSummary(payment.account_owner_user_id, payment.invoice_id, admin);
    const appUrl = clean(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL).replace(/\/$/, "");
    const model: PaymentReceivedEmailModel = { businessName: business.display_name, amountCents: Number(payment.amount_cents), balanceDueCents: summary.balanceDueCents, invoiceNumber: clean(invoice?.invoice_display_number || invoice?.invoice_number) || payment.invoice_id, billingName: clean(invoice?.billing_name) || "Billing recipient", paymentMethod: clean(payment.payment_method), reference: clean(payment.received_reference) || null, paidAt: clean(payment.paid_at), invoiceHref: `${appUrl}/jobs/${payment.job_id}/invoice?invoice_id=${payment.invoice_id}` };
    const message = buildPaymentReceivedEmail(model);
    const result = await sendEmail({ to: email, ...message });
    const providerMessageId = clean((result as any)?.data?.id) || null;
    await admin.from("internal_payment_email_deliveries").update({ delivery_status: "sent", provider_message_id: providerMessageId, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", claim.id);
    return { sent: true, recipient: email };
  } catch (deliveryError) {
    await admin.from("internal_payment_email_deliveries").update({ delivery_status: "failed", error_detail: deliveryError instanceof Error ? deliveryError.message : "unknown_error", updated_at: new Date().toISOString() }).eq("id", claim.id);
    return { sent: false, reason: "delivery_failed" };
  }
}
