export const INTERNAL_INVOICE_EMAIL_NOTIFICATION_TYPE = "internal_invoice_email";

export type InternalInvoiceEmailAttemptKind = "sent" | "resent";
export type InternalInvoiceEmailDeliveryStatus = "queued" | "sent" | "failed";

export type InternalInvoiceEmailDeliveryRecord = {
  id: string;
  jobId: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  recipientEmail: string | null;
  attemptKind: InternalInvoiceEmailAttemptKind;
  attemptNumber: number;
  status: InternalInvoiceEmailDeliveryStatus;
  subject: string | null;
  note: string | null;
  sentAt: string | null;
  createdAt: string | null;
  errorDetail: string | null;
};

function normalizeAttemptKind(value: unknown): InternalInvoiceEmailAttemptKind {
  return String(value ?? "").trim().toLowerCase() === "resent" ? "resent" : "sent";
}

function normalizeStatus(value: unknown): InternalInvoiceEmailDeliveryStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "sent") return "sent";
  if (normalized === "failed") return "failed";
  return "queued";
}

function normalizeAttemptNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.trunc(parsed);
  }

  return fallback;
}

function normalizeInternalInvoiceEmailDeliveryRow(row: any, fallbackAttemptNumber: number): InternalInvoiceEmailDeliveryRecord | null {
  const id = String(row?.id ?? "").trim();
  const jobId = String(row?.job_id ?? "").trim();

  if (!id || !jobId) return null;

  const payload = row?.payload ?? {};

  const note = String(row?.body ?? "").trim() || null;
  const payloadErrorDetail = String(payload?.error_detail ?? "").trim() || null;
  const noteErrorDetail = note && note.startsWith("Invoice email delivery failed:")
    ? note.slice("Invoice email delivery failed:".length).trim() || null
    : null;

  return {
    id,
    jobId,
    invoiceId: String(payload?.invoice_id ?? "").trim() || null,
    invoiceNumber: String(payload?.invoice_number ?? "").trim() || null,
    recipientEmail: String(payload?.recipient_email ?? "").trim().toLowerCase() || null,
    attemptKind: normalizeAttemptKind(payload?.attempt_kind),
    attemptNumber: normalizeAttemptNumber(payload?.attempt_number, fallbackAttemptNumber),
    status: normalizeStatus(row?.status),
    subject: String(row?.subject ?? "").trim() || null,
    note,
    sentAt: String(row?.sent_at ?? "").trim() || null,
    createdAt: String(row?.created_at ?? "").trim() || null,
    errorDetail: payloadErrorDetail ?? noteErrorDetail,
  };
}

export async function resolveInternalInvoiceEmailDeliveries(params: {
  supabase: any;
  jobId: string;
  invoiceId?: string | null;
}) {
  const jobId = String(params.jobId ?? "").trim();
  const invoiceId = String(params.invoiceId ?? "").trim();

  if (!jobId) return [] as InternalInvoiceEmailDeliveryRecord[];

  const { data, error } = await params.supabase
    .from("notifications")
    .select("id, job_id, subject, body, payload, status, sent_at, created_at")
    .eq("job_id", jobId)
    .eq("channel", "email")
    .eq("notification_type", INTERNAL_INVOICE_EMAIL_NOTIFICATION_TYPE)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .map((row: any, index: number) => normalizeInternalInvoiceEmailDeliveryRow(row, (data?.length ?? 0) - index))
    .filter((row: InternalInvoiceEmailDeliveryRecord | null): row is InternalInvoiceEmailDeliveryRecord => {
      if (!row) return false;
      if (!invoiceId) return true;
      return row.invoiceId === invoiceId;
    });
}