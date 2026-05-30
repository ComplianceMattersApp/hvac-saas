// app/customers/[id]/_components/PaymentHistoryCard.tsx
import Link from "next/link";
import { CustomerPaymentHistoryRow } from "@/lib/reports/payments-register";

interface PaymentHistoryCardProps {
  payments: CustomerPaymentHistoryRow[];
  customerId: string;
  customerName: string;
}

export default function PaymentHistoryCard({
  payments,
  customerId,
  customerName,
}: PaymentHistoryCardProps) {
  void customerId;

  const recordedPayments = payments.filter((p) => p.status === "recorded");
  const failedPayments = payments.filter((p) => p.status === "failed");
  const otherPayments = payments.filter((p) => p.status !== "recorded" && p.status !== "failed");

  const hasAnyPayments = payments.length > 0;

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white/80 p-3 shadow-sm">
      <div className="mb-3 space-y-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Invoices & Payment History
        </h2>
        <p className="text-xs text-slate-600">
          Recent customer payments and invoice destinations. Payment history is read-only here.
        </p>
      </div>

      {!hasAnyPayments ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-4 text-center">
          <p className="text-xs text-slate-600">
            No payment history is available for this customer yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recordedPayments.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <div className="h-px flex-1 bg-emerald-200" />
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                  Collected ({recordedPayments.length})
                </div>
                <div className="h-px flex-1 bg-emerald-200" />
              </div>
              <div className="space-y-2">
                {recordedPayments.map((payment) => (
                  <PaymentRow key={payment.paymentId} payment={payment} />
                ))}
              </div>
            </div>
          )}

          {failedPayments.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <div className="h-px flex-1 bg-red-200" />
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-red-700">
                  Payment Attention ({failedPayments.length})
                </div>
                <div className="h-px flex-1 bg-red-200" />
              </div>
              <div className="space-y-2">
                {failedPayments.map((payment) => (
                  <PaymentRow key={payment.paymentId} payment={payment} />
                ))}
              </div>
            </div>
          )}

          {otherPayments.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <div className="h-px flex-1 bg-slate-200" />
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                  Other ({otherPayments.length})
                </div>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="space-y-2">
                {otherPayments.map((payment) => (
                  <PaymentRow key={payment.paymentId} payment={payment} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {hasAnyPayments && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <Link
            href={`/reports/payments?q=${encodeURIComponent(customerName)}`}
            className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
          >
            Open Payments Register →
          </Link>
        </div>
      )}
    </section>
  );
}

function PaymentRow({
  payment,
}: {
  payment: CustomerPaymentHistoryRow;
}) {
  const invoiceLabel = formatInvoiceLabel(payment.invoiceNumber);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-slate-900">
              {payment.amountDisplay}
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-medium text-slate-700">
                {payment.statusLabel}
              </span>
              <span className="inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-medium text-slate-700">
                {payment.methodLabel}
              </span>
            </div>
          </div>
          <div className="space-y-1 text-[11px] text-slate-600">
            <div className="font-medium text-slate-700">{payment.paidAtDisplay}</div>
            <div>
              <span className="font-medium text-slate-700">{invoiceLabel}</span>
              {payment.invoiceHref ? (
                <>
                  {" "}•{" "}
                  <Link
                    href={payment.invoiceHref}
                    className="text-blue-600 hover:underline"
                  >
                    Open invoice workspace
                  </Link>
                </>
              ) : null}
            </div>
            <div>
              Job:{" "}
              {payment.jobHref ? (
                <Link
                  href={payment.jobHref}
                  className="text-blue-600 hover:underline"
                >
                  {payment.jobTitle}
                </Link>
              ) : (
                payment.jobTitle
              )}
            </div>
            {payment.status === "failed" ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-700">
                Payment failed - not collected. Review invoice before retrying.
              </div>
            ) : null}
            {payment.reference && payment.reference !== "-" && (
              <div className="text-slate-500">Reference: {payment.reference}</div>
            )}
            {payment.notes && payment.notes !== "-" && (
              <div className="text-slate-500">{payment.notes}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatInvoiceLabel(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "-") return "Invoice -";
  if (/^invoice\b/i.test(normalized)) return normalized;
  if (/^\d+$/.test(normalized)) return `Invoice #${normalized}`;
  return `Invoice ${normalized}`;
}
