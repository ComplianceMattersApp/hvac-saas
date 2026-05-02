// app/estimates/[id]/page.tsx
// Compliance Matters: Internal-only estimate detail page.
// Account-owner scoped via getEstimateById. Draft-only line management.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requireInternalUser,
  isInternalAccessError,
} from "@/lib/auth/internal-user";
import { getEstimateById } from "@/lib/estimates/estimate-read";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";
import { removeLineItemFromForm } from "./actions";
import AddLineItemForm from "./AddLineItemForm";

export const metadata = { title: "Estimate" };

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100
  );
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "draft": return "bg-slate-100 text-slate-700";
    case "sent": return "bg-blue-100 text-blue-700";
    case "approved": return "bg-emerald-100 text-emerald-700";
    case "declined": return "bg-red-100 text-red-700";
    case "expired": return "bg-amber-100 text-amber-700";
    case "cancelled": return "bg-slate-200 text-slate-600";
    case "converted": return "bg-violet-100 text-violet-700";
    default: return "bg-slate-100 text-slate-700";
  }
}

function statusLabel(status: string) {
  const s = String(status ?? "").trim();
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatEventType(eventType: string) {
  return String(eventType ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type CustomerRow = { id: string; full_name: string | null; first_name: string | null; last_name: string | null };
type LocationRow = { id: string; address_line1: string | null; city: string | null; state: string | null; zip: string | null; nickname: string | null };
type EventRow = { id: string; event_type: string; meta: Record<string, unknown> | null; user_id: string | null; created_at: string };
type PricebookPickerRow = {
  id: string;
  item_name: string;
  item_type: string;
  category: string | null;
  default_description: string | null;
  default_unit_price: number;
  unit_label: string | null;
};

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"];
  try {
    const result = await requireInternalUser({ supabase, userId: userData.user.id });
    internalUser = result.internalUser;
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  if (!isEstimatesEnabled()) {
    redirect("/ops?notice=estimates_unavailable");
  }

  const estimate = await getEstimateById({ estimateId: id, internalUser, supabase });
  if (!estimate) notFound();

  const isDraft = estimate.status === "draft";
  let pricebookItems: PricebookPickerRow[] = [];

  if (isDraft) {
    const { data: pricebookRaw, error: pricebookError } = await supabase
      .from("pricebook_items")
      .select("id, item_name, item_type, category, default_description, default_unit_price, unit_label")
      .eq("account_owner_user_id", internalUser.account_owner_user_id)
      .eq("is_active", true)
      .neq("item_type", "adjustment")
      .gte("default_unit_price", 0)
      .order("category", { ascending: true })
      .order("item_name", { ascending: true });
    if (pricebookError) throw pricebookError;

    pricebookItems = (pricebookRaw ?? []) as PricebookPickerRow[];
  }

  // Load customer and location names for context display
  let customerName: string | null = null;
  let locationDisplay: string | null = null;

  if (estimate.customer_id) {
    const { data: cRow } = await supabase
      .from("customers")
      .select("id, full_name, first_name, last_name")
      .eq("id", estimate.customer_id)
      .maybeSingle();
    const c = cRow as CustomerRow | null;
    if (c) {
      customerName =
        String(c.full_name ?? "").trim() ||
        [c.first_name, c.last_name].filter(Boolean).join(" ") ||
        "Customer";
    }
  }

  if (estimate.location_id) {
    const { data: lRow } = await supabase
      .from("locations")
      .select("id, address_line1, city, state, zip, nickname")
      .eq("id", estimate.location_id)
      .maybeSingle();
    const l = lRow as LocationRow | null;
    if (l) {
      locationDisplay =
        l.nickname ||
        [l.address_line1, l.city, l.state].filter(Boolean).join(", ") ||
        "Location";
    }
  }

  // Load recent estimate events (last 10)
  const { data: eventsRaw } = await supabase
    .from("estimate_events")
    .select("id, event_type, meta, user_id, created_at")
    .eq("estimate_id", id)
    .order("created_at", { ascending: false })
    .limit(10);
  const events = (eventsRaw ?? []) as EventRow[];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-500">
        <Link href="/estimates" className="hover:text-slate-900">
          Estimates
        </Link>
        <span className="mx-1.5">›</span>
        <span className="font-mono text-slate-700">{estimate.estimate_number}</span>
      </nav>

      {/* Header card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-400">{estimate.estimate_number}</span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass(estimate.status)}`}
              >
                {statusLabel(estimate.status)}
              </span>
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">
              {estimate.title}
            </h1>
            {estimate.notes && (
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{estimate.notes}</p>
            )}
          </div>

          {/* Totals */}
          <div className="shrink-0 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Total
            </div>
            <div className="mt-0.5 text-2xl font-bold tracking-[-0.02em] text-slate-950">
              {formatCents(estimate.total_cents)}
            </div>
            {estimate.subtotal_cents !== estimate.total_cents && (
              <div className="text-xs text-slate-500">
                Subtotal {formatCents(estimate.subtotal_cents)}
              </div>
            )}
          </div>
        </div>

        {/* Context */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
          {customerName && (
            <div>
              <span className="font-medium text-slate-700">Customer:</span> {customerName}
            </div>
          )}
          {locationDisplay && (
            <div>
              <span className="font-medium text-slate-700">Location:</span> {locationDisplay}
            </div>
          )}
          <div>
            <span className="font-medium text-slate-700">Created:</span>{" "}
            {formatDate(estimate.created_at)}
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-950">Line Items</h2>
          <div className="text-sm text-slate-500">
            {estimate.line_items.length}{" "}
            {estimate.line_items.length === 1 ? "item" : "items"}
          </div>
        </div>

        {estimate.line_items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-5 py-8 text-center text-sm text-slate-500">
            {isDraft
              ? "No line items yet. Add the first line item below."
              : "No line items on this estimate."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_30px_-30px_rgba(15,23,42,0.18)]">
            {/* Column headers */}
            <div className="hidden grid-cols-[minmax(0,2.5fr)_minmax(6rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)_auto] gap-4 border-b border-slate-200/80 bg-white/88 px-5 py-3 sm:grid">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Item
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Type
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Qty × Price
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Subtotal
              </div>
              {isDraft && (
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500" />
              )}
            </div>

            <div className="divide-y divide-slate-200/60">
              {estimate.line_items.map((line, idx) => (
                <div key={line.id} className="bg-white/80 px-5 py-4">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,2.5fr)_minmax(6rem,0.7fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)_auto] sm:items-center">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:hidden">
                        Line {idx + 1}
                      </div>
                      <div className="font-semibold text-slate-950">
                        {line.item_name_snapshot}
                      </div>
                      {line.description_snapshot && (
                        <div className="mt-0.5 text-xs leading-5 text-slate-500">
                          {line.description_snapshot}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:hidden">
                        Type
                      </div>
                      <div className="text-sm capitalize text-slate-700">
                        {line.item_type_snapshot}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:hidden">
                        Qty × Price
                      </div>
                      <div className="text-sm text-slate-700">
                        {line.quantity % 1 === 0 ? line.quantity : line.quantity.toFixed(2)}{" "}
                        × {formatCents(line.unit_price_cents)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:hidden">
                        Subtotal
                      </div>
                      <div className="font-semibold text-slate-950">
                        {formatCents(line.line_subtotal_cents)}
                      </div>
                    </div>

                    {isDraft && (
                      <div className="flex justify-end">
                        <form action={removeLineItemFromForm}>
                          <input type="hidden" name="estimate_id" value={estimate.id} />
                          <input type="hidden" name="line_item_id" value={line.id} />
                          <button
                            type="submit"
                            className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-[background-color,border-color,transform] hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 active:translate-y-[0.5px]"
                          >
                            Remove
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Total footer */}
            <div className="flex items-center justify-between border-t border-slate-200/80 bg-slate-50/80 px-5 py-3.5">
              <div className="text-sm font-semibold text-slate-700">Total</div>
              <div className="text-lg font-bold tracking-[-0.02em] text-slate-950">
                {formatCents(estimate.total_cents)}
              </div>
            </div>
          </div>
        )}

        {/* Add line item — draft only */}
        {isDraft && (
          <div className="pt-1">
            <AddLineItemForm estimateId={estimate.id} pricebookItems={pricebookItems} />
          </div>
        )}

        {!isDraft && (
          <p className="text-xs text-slate-400">
            Line items can only be edited on draft estimates.
          </p>
        )}
      </div>

      {/* Estimate Events */}
      {events.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-950">Activity</h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_30px_-30px_rgba(15,23,42,0.14)]">
            <div className="divide-y divide-slate-200/60">
              {events.map((event) => (
                <div key={event.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-medium text-slate-800">
                      {formatEventType(event.event_type)}
                    </div>
                    <div className="shrink-0 text-xs text-slate-400">
                      {formatDateTime(event.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Non-goal confirmation: no approval/conversion/payment/email/PDF UI */}
    </div>
  );
}
