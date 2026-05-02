// app/estimates/page.tsx
// Compliance Matters: Internal-only estimates list page.
// Account-owner scoped via RLS + listEstimatesByAccount helper.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requireInternalUser,
  isInternalAccessError,
} from "@/lib/auth/internal-user";
import { listEstimatesByAccount } from "@/lib/estimates/estimate-read";
import { isEstimatesEnabled } from "@/lib/estimates/estimate-exposure";

export const metadata = { title: "Estimates" };

const ESTIMATE_STATUSES = [
  "draft",
  "sent",
  "approved",
  "declined",
  "expired",
  "cancelled",
  "converted",
] as const;

type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

function isEstimateStatus(v: unknown): v is EstimateStatus {
  return typeof v === "string" && (ESTIMATE_STATUSES as readonly string[]).includes(v);
}

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

function statusBadgeClass(status: string) {
  switch (status) {
    case "draft":
      return "bg-slate-100 text-slate-700";
    case "sent":
      return "bg-blue-100 text-blue-700";
    case "approved":
      return "bg-emerald-100 text-emerald-700";
    case "declined":
      return "bg-red-100 text-red-700";
    case "expired":
      return "bg-amber-100 text-amber-700";
    case "cancelled":
      return "bg-slate-200 text-slate-600";
    case "converted":
      return "bg-violet-100 text-violet-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function statusLabel(status: string) {
  const s = String(status ?? "").trim();
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type CustomerRow = { id: string; full_name: string | null; first_name: string | null; last_name: string | null };

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  const sp = (await searchParams) ?? {};
  const statusRaw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const statusFilter = isEstimateStatus(statusRaw) ? statusRaw : null;

  const estimates = await listEstimatesByAccount({
    internalUser,
    status: statusFilter,
    supabase,
  });

  // Load customer names for display context
  const customerIds = [
    ...new Set(estimates.map((e) => e.customer_id).filter(Boolean) as string[]),
  ];
  let customerMap: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, full_name, first_name, last_name")
      .in("id", customerIds);
    for (const c of (customers ?? []) as CustomerRow[]) {
      const name =
        String(c.full_name ?? "").trim() ||
        [c.first_name, c.last_name].filter(Boolean).join(" ") ||
        "Customer";
      customerMap[c.id] = name;
    }
  }

  const filterLinkBase = "/estimates";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">Estimates</h1>
          <p className="mt-0.5 text-sm text-slate-500">Draft and manage quotes for customers.</p>
        </div>
        <Link
          href="/estimates/new"
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_22px_-18px_rgba(37,99,235,0.58)] transition-all hover:-translate-y-px hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:translate-y-0"
        >
          + New Estimate
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={filterLinkBase}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            !statusFilter
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          All
        </Link>
        {ESTIMATE_STATUSES.map((s) => (
          <Link
            key={s}
            href={`${filterLinkBase}?status=${s}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === s
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {statusLabel(s)}
          </Link>
        ))}
      </div>

      {/* List */}
      {estimates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-5 py-12 text-center">
          <div className="text-base font-semibold text-slate-700">No estimates yet</div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {statusFilter
              ? `No estimates with status "${statusLabel(statusFilter)}".`
              : "Create your first estimate to get started."}
          </p>
          {!statusFilter && (
            <div className="mt-5">
              <Link
                href="/estimates/new"
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_22px_-18px_rgba(37,99,235,0.55)] transition-all hover:-translate-y-px hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:translate-y-0"
              >
                + New Estimate
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {estimates.map((est) => {
            const customerName = est.customer_id ? customerMap[est.customer_id] ?? "Unknown Customer" : null;
            return (
              <Link
                key={est.id}
                href={`/estimates/${est.id}`}
                className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.16)] transition-[background-color,box-shadow,transform] hover:bg-slate-50/70 hover:shadow-[0_18px_30px_-24px_rgba(15,23,42,0.2)] active:translate-y-[0.5px]"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">{est.estimate_number}</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${statusBadgeClass(est.status)}`}
                      >
                        {statusLabel(est.status)}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-semibold text-slate-950">{est.title}</div>
                    {customerName && (
                      <div className="mt-0.5 text-sm text-slate-500">{customerName}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-base font-semibold text-slate-950">
                      {formatCents(est.total_cents)}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">{formatDate(est.created_at)}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
