import Link from "next/link";
import { formatInvoiceDisplayReference } from "@/lib/utils/display-references";

export type SupplementalInvoiceFamilyItem = {
  id: string;
  invoiceDisplayNumber: string | null;
  invoiceNumber: string;
  status: "draft" | "issued" | "void";
  totalCents: number;
  balanceDueCents: number;
  supplementalReason: string | null;
  billingName?: string | null;
  billToKind?: "customer" | "contractor" | "other" | null;
  workspaceHref?: string | null;
  isSelected?: boolean;
};

type SupplementalInvoiceFamilySectionProps = {
  items: SupplementalInvoiceFamilyItem[];
  description: string;
};

function formatCurrencyFromCents(cents?: number | null) {
  const value = Number(cents ?? 0) / 100;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function formatInvoiceStatus(status: SupplementalInvoiceFamilyItem["status"]) {
  if (status === "issued") return "Issued";
  if (status === "void") return "Void";
  return "Draft";
}

function formatSupplementalReason(reason?: string | null) {
  const normalized = String(reason ?? "").trim();
  if (!normalized) return null;

  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export default function SupplementalInvoiceFamilySection(
  props: SupplementalInvoiceFamilySectionProps,
) {
  if (props.items.length === 0) {
    return null;
  }

  return (
    <section id="supplemental-invoices" className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/70 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-950">Supplemental invoices</h4>
          <p className="mt-1 text-xs leading-5 text-slate-600">{props.description}</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
          Read-only
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        {props.items.map((invoice) => {
          const reasonLabel = formatSupplementalReason(invoice.supplementalReason);

          return (
            <div key={invoice.id} className="rounded-lg border border-slate-200/80 bg-white px-3 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-950">
                    {formatInvoiceDisplayReference({
                      invoiceDisplayNumber: invoice.invoiceDisplayNumber,
                      invoiceNumber: invoice.invoiceNumber,
                      invoiceId: invoice.id,
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-slate-600">
                    {invoice.billingName ? (
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-800">
                        Billed to {invoice.billingName}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                      {formatInvoiceStatus(invoice.status)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                      Total {formatCurrencyFromCents(invoice.totalCents)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                      Balance {formatCurrencyFromCents(invoice.balanceDueCents)}
                    </span>
                    {reasonLabel ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                        Reason: {reasonLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
                {invoice.workspaceHref ? (
                  <Link
                    href={invoice.workspaceHref}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                  >
                    {invoice.isSelected ? "Viewing in workspace" : "Open invoice workspace"}
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
