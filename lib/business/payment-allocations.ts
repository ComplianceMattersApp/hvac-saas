import type { InternalInvoicePaymentRow } from "@/lib/business/internal-invoice-payments";

export type PaymentAllocationTargetType =
  | "invoice"
  | "future_service_plan_billing_period"
  | "future_customer_credit";

export type PaymentAllocationStatus = "active" | "inactive";

export type InvoicePaymentAllocationStatus =
  | "active"
  | "inactive"
  | "reversed"
  | "voided";

export type InvoicePaymentAllocationRow = {
  id: string;
  account_owner_user_id: string;
  source_internal_invoice_payment_id: string;
  target_invoice_id: string;
  allocated_amount_cents: number;
  allocation_status: InvoicePaymentAllocationStatus;
};

type MinimalInvoicePaymentSourceRow = Pick<
  InternalInvoicePaymentRow,
  "id" | "account_owner_user_id" | "invoice_id" | "amount_cents" | "payment_status"
>;

type PersistedInvoicePaymentAllocationRow = InvoicePaymentAllocationRow & {
  allocation_source_kind?: string | null;
};

export type UpsertInvoicePaymentAllocationResult = {
  ok: boolean;
  status: "created" | "updated" | "deduped" | "blocked" | "failed";
  allocationId: string | null;
  allocationStatus: InvoicePaymentAllocationStatus | null;
  reason: string | null;
};

function mapPaymentStatusToAllocationStatus(
  paymentStatus: string,
): InvoicePaymentAllocationStatus | null {
  if (paymentStatus === "recorded") return "active";
  if (paymentStatus === "pending") return "inactive";
  if (paymentStatus === "failed") return "inactive";
  if (paymentStatus === "reversed") return "reversed";
  return null;
}

function normalizeMinimalPaymentSourceRow(
  row: Partial<MinimalInvoicePaymentSourceRow> | null | undefined,
): MinimalInvoicePaymentSourceRow | null {
  if (!row) return null;

  return {
    id: String(row.id ?? "").trim(),
    account_owner_user_id: String(row.account_owner_user_id ?? "").trim(),
    invoice_id: String(row.invoice_id ?? "").trim(),
    amount_cents: Number(row.amount_cents ?? 0) || 0,
    payment_status: String(row.payment_status ?? "").trim().toLowerCase() as InternalInvoicePaymentRow["payment_status"],
  };
}

function isSameAllocationPayload(
  existing: PersistedInvoicePaymentAllocationRow,
  payload: {
    account_owner_user_id: string;
    source_internal_invoice_payment_id: string;
    target_invoice_id: string;
    allocated_amount_cents: number;
    allocation_status: InvoicePaymentAllocationStatus;
    allocation_source_kind: "invoice_payment_record";
  },
) {
  return (
    String(existing.account_owner_user_id ?? "").trim() === payload.account_owner_user_id &&
    String(existing.source_internal_invoice_payment_id ?? "").trim() === payload.source_internal_invoice_payment_id &&
    String(existing.target_invoice_id ?? "").trim() === payload.target_invoice_id &&
    (Number(existing.allocated_amount_cents ?? 0) || 0) === payload.allocated_amount_cents &&
    existing.allocation_status === payload.allocation_status &&
    String(existing.allocation_source_kind ?? "").trim() === payload.allocation_source_kind
  );
}

export async function upsertInvoicePaymentAllocationForPaymentRow(params: {
  supabase: any;
  paymentId?: string;
  paymentRow?: Partial<MinimalInvoicePaymentSourceRow> | null;
}): Promise<UpsertInvoicePaymentAllocationResult> {
  const paymentId = String(params.paymentId ?? "").trim();
  const providedRow = normalizeMinimalPaymentSourceRow(params.paymentRow);

  let sourcePaymentRow = providedRow;

  if (!sourcePaymentRow && paymentId) {
    const { data, error } = await params.supabase
      .from("internal_invoice_payments")
      .select("id, account_owner_user_id, invoice_id, amount_cents, payment_status")
      .eq("id", paymentId)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        status: "failed",
        allocationId: null,
        allocationStatus: null,
        reason: `Failed to load source payment row: ${error.message ?? "unknown error"}`,
      };
    }

    sourcePaymentRow = normalizeMinimalPaymentSourceRow(data);
  }

  if (!sourcePaymentRow?.id) {
    return {
      ok: false,
      status: "blocked",
      allocationId: null,
      allocationStatus: null,
      reason: "Source payment row not found",
    };
  }

  if (!sourcePaymentRow.account_owner_user_id || !sourcePaymentRow.invoice_id) {
    return {
      ok: false,
      status: "blocked",
      allocationId: null,
      allocationStatus: null,
      reason: "Source payment row missing required account or invoice scope",
    };
  }

  const mappedStatus = mapPaymentStatusToAllocationStatus(
    sourcePaymentRow.payment_status,
  );

  if (!mappedStatus) {
    return {
      ok: false,
      status: "blocked",
      allocationId: null,
      allocationStatus: null,
      reason: "Source payment row has unsupported payment_status",
    };
  }

  const payload = {
    account_owner_user_id: sourcePaymentRow.account_owner_user_id,
    source_internal_invoice_payment_id: sourcePaymentRow.id,
    target_invoice_id: sourcePaymentRow.invoice_id,
    allocated_amount_cents: sourcePaymentRow.amount_cents,
    allocation_status: mappedStatus,
    allocation_source_kind: "invoice_payment_record" as const,
  };

  const { data: existing, error: existingErr } = await params.supabase
    .from("internal_invoice_payment_allocations")
    .select(
      "id, account_owner_user_id, source_internal_invoice_payment_id, target_invoice_id, allocated_amount_cents, allocation_status, allocation_source_kind",
    )
    .eq("source_internal_invoice_payment_id", sourcePaymentRow.id)
    .maybeSingle();

  if (existingErr) {
    return {
      ok: false,
      status: "failed",
      allocationId: null,
      allocationStatus: null,
      reason: `Failed to resolve existing allocation row: ${existingErr.message ?? "unknown error"}`,
    };
  }

  if (existing && isSameAllocationPayload(existing, payload)) {
    return {
      ok: true,
      status: "deduped",
      allocationId: String(existing.id ?? "").trim() || null,
      allocationStatus: mappedStatus,
      reason: null,
    };
  }

  const { data: persisted, error: persistErr } = await params.supabase
    .from("internal_invoice_payment_allocations")
    .upsert(payload, {
      onConflict: "source_internal_invoice_payment_id",
    })
    .select("id, allocation_status")
    .single();

  if (persistErr) {
    return {
      ok: false,
      status: "failed",
      allocationId: null,
      allocationStatus: null,
      reason: `Failed to upsert allocation row: ${persistErr.message ?? "unknown error"}`,
    };
  }

  return {
    ok: true,
    status: existing ? "updated" : "created",
    allocationId: String(persisted?.id ?? "").trim() || null,
    allocationStatus: mappedStatus,
    reason: null,
  };
}

export type PaymentAllocationCompatibilityRecord = {
  paymentRegisterEntryId: string;
  allocationTargetType: PaymentAllocationTargetType;
  allocationTargetId: string;
  allocatedAmountCents: number;
  allocationStatus: PaymentAllocationStatus;
  source: "compat_invoice_bound_row";
};

export function deriveCompatibilityInvoiceAllocations(
  paymentRows: InternalInvoicePaymentRow[],
): PaymentAllocationCompatibilityRecord[] {
  const allocations: Array<PaymentAllocationCompatibilityRecord | null> = (paymentRows ?? [])
    .map((row) => {
      const paymentId = String(row?.id ?? "").trim();
      const invoiceId = String(row?.invoice_id ?? "").trim();
      const amountCents = Number(row?.amount_cents ?? 0) || 0;

      if (!paymentId || !invoiceId) {
        return null;
      }

      return {
        paymentRegisterEntryId: paymentId,
        allocationTargetType: "invoice",
        allocationTargetId: invoiceId,
        allocatedAmountCents: amountCents,
        allocationStatus:
          row.payment_status === "recorded" ? "active" : "inactive",
        source: "compat_invoice_bound_row",
      };
    });

  return allocations.filter(
    (allocation): allocation is PaymentAllocationCompatibilityRecord => allocation !== null,
  );
}

export function sumActiveInvoiceAllocationCents(
  allocations: PaymentAllocationCompatibilityRecord[],
  invoiceId: string,
): number {
  const normalizedInvoiceId = String(invoiceId ?? "").trim();
  if (!normalizedInvoiceId) return 0;

  return (allocations ?? []).reduce((sum, allocation) => {
    if (allocation.allocationTargetType !== "invoice") return sum;
    if (allocation.allocationTargetId !== normalizedInvoiceId) return sum;
    if (allocation.allocationStatus !== "active") return sum;
    return sum + (Number(allocation.allocatedAmountCents ?? 0) || 0);
  }, 0);
}

export function sumActivePersistedInvoiceAllocationCents(
  allocations: InvoicePaymentAllocationRow[],
  invoiceId: string,
): number {
  const normalizedInvoiceId = String(invoiceId ?? "").trim();
  if (!normalizedInvoiceId) return 0;

  return (allocations ?? []).reduce((sum, allocation) => {
    if (String(allocation?.target_invoice_id ?? "").trim() !== normalizedInvoiceId) {
      return sum;
    }

    if (allocation?.allocation_status !== "active") {
      return sum;
    }

    return sum + (Number(allocation?.allocated_amount_cents ?? 0) || 0);
  }, 0);
}
