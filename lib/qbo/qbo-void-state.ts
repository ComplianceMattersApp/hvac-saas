/**
 * Read-side helper for the QBO invoice-void lane.
 *
 * Deliberately NOT folded into INTERNAL_INVOICE_SELECT: that select feeds every
 * invoice read in the app, so adding columns to it would turn a lagging
 * migration into an app-wide 42703 outage. This is an additive, separately
 * tolerated read — if the columns are not deployed yet, callers get null and
 * simply render nothing extra.
 */

export type QboInvoiceVoidStatus = "pending" | "voided" | "blocked" | "error";

export type QboInvoiceVoidState = {
  status: QboInvoiceVoidStatus | null;
  voidedAt: string | null;
  error: string | null;
};

const VOID_STATE_SELECT = "id, qbo_void_status, qbo_voided_at, qbo_void_error";

/** True when the failure is "these columns aren't deployed yet", not a real error. */
export function isMissingQboVoidColumnError(error: unknown): boolean {
  const code = String((error as any)?.code ?? "").trim();
  const message = String((error as any)?.message ?? "").toLowerCase();
  if (code === "42703") return message.includes("qbo_void");
  return message.includes("column") && message.includes("qbo_void") && message.includes("does not exist");
}

function toState(row: any): QboInvoiceVoidState {
  const status = String(row?.qbo_void_status ?? "").trim();
  return {
    status: (["pending", "voided", "blocked", "error"] as const).includes(status as QboInvoiceVoidStatus)
      ? (status as QboInvoiceVoidStatus)
      : null,
    voidedAt: String(row?.qbo_voided_at ?? "").trim() || null,
    error: String(row?.qbo_void_error ?? "").trim() || null,
  };
}

/**
 * Void state for one invoice.
 *
 * Returns null ONLY when the state could not be read at all — columns not
 * deployed, or the row is unreadable. A successful read with nothing recorded
 * returns `status: null`, which is meaningfully different: it means the void was
 * never confirmed against QuickBooks (typically an invoice voided before this
 * lane existed), and the operator should be able to act on it.
 */
export async function readInvoiceQboVoidState(params: {
  supabase: any;
  accountOwnerUserId: string;
  invoiceId: string;
}): Promise<QboInvoiceVoidState | null> {
  const invoiceId = String(params.invoiceId ?? "").trim();
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!invoiceId || !accountOwnerUserId) return null;

  try {
    const { data, error } = await params.supabase
      .from("internal_invoices")
      .select(VOID_STATE_SELECT)
      .eq("id", invoiceId)
      .eq("account_owner_user_id", accountOwnerUserId)
      .maybeSingle();
    if (error || !data) return null;
    return toState(data);
  } catch {
    return null;
  }
}
