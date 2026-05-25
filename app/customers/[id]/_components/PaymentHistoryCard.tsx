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
  const recordedPayments = payments.filter((p) => p.status === "recorded");
  const failedAttempts = payments.filter((p) => p.status === "failed");
  const otherPayments = payments.filter((p) => p.status !== "recorded" && p.status !== "failed");

  const hasAnyPayments = payments.length > 0;

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white/80 p-3 shadow-sm">
      <div className="mb-3 space-y-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Payment History
        </h2>
        <p className="text-xs text-slate-600">
          Recorded payments and failed attempts for this customer.
        </p>
      </div>

      {!hasAnyPayments ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-4 text-center">
          <p className="text-xs text-slate-600">
            No recorded payments or failed attempts for this customer yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Recorded Payments */}
          {recordedPayments.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <div className="h-px flex-1 bg-emerald-200" />
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                  Recorded ({recordedPayments.length})
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

          {/* Failed Attempts */}
          {failedAttempts.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <div className="h-px flex-1 bg-red-200" />
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-red-700">
                  Failed Attempts ({failedAttempts.length})
                </div>
                <div className="h-px flex-1 bg-red-200" />
              </div>
              <div className="space-y-2">
                {failedAttempts.map((payment) => (
                  <PaymentRow key={payment.paymentId} payment={payment} />
                ))}
              </div>
            </div>
          )}

          {/* Other Statuses */}
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

      {/* Footer: Link to full register */}
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
          <div className="text-[9px] text-slate-600">
            <div className="font-medium text-slate-700">
              {payment.paidAtDisplay} • {payment.invoiceNumber}
              {payment.jobHref && (
                <>
                  {" "} •{" "}
                  <Link
                    href={payment.jobHref}
                    className="text-blue-600 hover:underline"
                  >
                    {payment.jobTitle}
                  </Link>
                </>
              )}
            </div>
            {payment.reference && payment.reference !== "-" && (
              <div className="text-slate-500">Ref: {payment.reference}</div>
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
