import { createHash } from "crypto";
import { sendEmail } from "@/lib/email/sendEmail";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { buildAttentionCenterReadModel } from "@/lib/reports/attention-center-read-model";

function clean(value: unknown) { return String(value ?? "").trim(); }
function escapeHtml(value: unknown) { return clean(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]!); }

async function recipient(admin: any, ownerId: string) {
  const business = await resolveInternalBusinessIdentityByAccountOwnerId({ supabase: admin, accountOwnerUserId: ownerId });
  if (clean(business.support_email).includes("@")) return { email: clean(business.support_email).toLowerCase(), businessName: business.display_name };
  const { data } = await admin.from("profiles").select("email").eq("id", ownerId).maybeSingle();
  const email = clean(data?.email).toLowerCase();
  return { email: email.includes("@") ? email : null, businessName: business.display_name };
}

export async function deliverAttentionSnapshotEmail(params: { admin: any; accountOwnerUserId: string; appUrl: string }) {
  const ownerId = clean(params.accountOwnerUserId); if (!ownerId) return { sent: false, reason: "missing_owner" };
  const model = await buildAttentionCenterReadModel({ admin: params.admin, accountOwnerUserId: ownerId });
  if (model.summaries.total <= 0) return { sent: false, reason: "no_attention" };
  const fingerprintSource = JSON.stringify({ ids: model.items.map(item => item.id).sort(), failed: model.summaries.failedPaymentAttempts, confirm: model.summaries.fieldPaymentsAwaitingConfirmation, qbo: model.summaries.qboConnectionError });
  const fingerprint = createHash("sha256").update(fingerprintSource).digest("hex");
  const target = await recipient(params.admin, ownerId); if (!target.email) return { sent: false, reason: "recipient_missing" };
  const { data: claim, error } = await params.admin.from("attention_email_deliveries").insert({ account_owner_user_id: ownerId, snapshot_fingerprint: fingerprint, recipient_email: target.email, item_count: model.summaries.total }).select("id").single();
  if (error) return { sent: false, reason: String(error.code) === "23505" ? "already_sent" : "claim_failed" };
  const href = `${clean(params.appUrl).replace(/\/$/, "")}/reports/attention`;
  const subject = `${model.summaries.total} item${model.summaries.total === 1 ? "" : "s"} need attention in EveryStep`;
  const lines = model.items.slice(0, 10).map(item => `<li style="margin:8px 0"><strong>${escapeHtml(item.title)}</strong><br><span style="color:#475569">${escapeHtml(item.truth)}</span></li>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;color:#0f172a;padding:24px"><h1>${escapeHtml(target.businessName)} needs attention</h1><p>${model.summaries.total} financial workflow item${model.summaries.total === 1 ? "" : "s"} require review.</p><ul>${lines}</ul><a href="${escapeHtml(href)}" style="display:inline-block;background:#0f172a;color:white;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Open Needs Attention</a><p style="font-size:12px;color:#64748b">This alert is deduplicated. The same unresolved set will not send repeatedly.</p></div>`;
  try {
    const sent = await sendEmail({ to: target.email, subject, html, text: `${subject}\n${href}` });
    await params.admin.from("attention_email_deliveries").update({ delivery_status: "sent", provider_message_id: clean((sent as any)?.data?.id) || null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", claim.id);
    return { sent: true };
  } catch (deliveryError) {
    await params.admin.from("attention_email_deliveries").update({ delivery_status: "failed", error_detail: deliveryError instanceof Error ? deliveryError.message : "unknown_error", updated_at: new Date().toISOString() }).eq("id", claim.id);
    return { sent: false, reason: "delivery_failed" };
  }
}
