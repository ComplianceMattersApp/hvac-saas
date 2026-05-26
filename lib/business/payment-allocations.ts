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
