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
import { ClipboardList, Filter, Layers3, ListChecks, PackageOpen, Plus, Sparkles } from "lucide-react";

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
  if (!s) return "-";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type CustomerRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

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
  const draftCount = estimates.filter((e) => e.status === "draft").length;
  const sentCount = estimates.filter((e) => e.status === "sent").length;
  const multiOptionCount = estimates.filter((e) => e.proposalMode === "multi_option_packages").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-slate-950 sm:p-6">
      <div className="rounded-2xl border border-slate-200/85 bg-white p-5 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.42)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
              Estimate workspace
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl">Estimates</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Draft, review, and print customer proposals without mixing quote totals into job, invoice, or payment truth.
            </p>
          </div>
          <Link
            href="/estimates/new"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_24px_-18px_rgba(15,23,42,0.56)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_16px_28px_-18px_rgba(15,23,42,0.58)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Estimate
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
              <ListChecks className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{estimates.length}</div>
            <div className="mt-0.5 text-xs font-semibold text-slate-500">Showing now</div>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/90 px-4 py-3 text-blue-900">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-700">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="mt-2 text-2xl font-semibold">{draftCount + sentCount}</div>
            <div className="mt-0.5 text-xs font-semibold">Draft or sent</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-emerald-900">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700">
              <Layers3 className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="mt-2 text-2xl font-semibold">{multiOptionCount}</div>
            <div className="mt-0.5 text-xs font-semibold">Multi-option</div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200/85 bg-slate-50/85 px-4 py-3 text-sm text-slate-700">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Revenue Workflow Rail</p>
          <p className="mt-1">
            <span className="font-semibold text-slate-900">Stage:</span> Proposal workspace.
            <span className="ml-2 font-semibold text-slate-900">Next:</span> Open a draft estimate to finalize customer delivery, or open a sent estimate to record the customer decision.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              Status filter
            </div>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-950">
              {statusFilter ? statusLabel(statusFilter) : "All estimates"}
            </h2>
          </div>
          <div className="text-sm text-slate-600">
            {statusFilter ? "Filtered list" : "Every estimate in your account scope"}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200/85 bg-white p-2 shadow-[0_10px_28px_-28px_rgba(15,23,42,0.2)]">
          <Link
            href={filterLinkBase}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              !statusFilter
                ? "bg-slate-900 text-white"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            All
          </Link>
          {ESTIMATE_STATUSES.map((s) => (
            <Link
              key={s}
              href={`${filterLinkBase}?status=${s}`}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? "bg-slate-900 text-white"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {statusLabel(s)}
            </Link>
          ))}
        </div>
      </section>

      {estimates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
          <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600">
            <PackageOpen className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="text-base font-semibold text-slate-800">
            {statusFilter ? "No estimates match this status" : "No estimates yet"}
          </div>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
            {statusFilter
              ? `No estimates with status "${statusLabel(statusFilter)}". Try another status or clear the filter.`
              : "Create the first estimate when you are ready to prepare a customer proposal."}
          </p>
          {!statusFilter && (
            <div className="mt-5">
              <Link
                href="/estimates/new"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_24px_-18px_rgba(15,23,42,0.56)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px]"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New Estimate
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_34px_-30px_rgba(15,23,42,0.24)]">
          <div className="divide-y divide-slate-200">
            {estimates.map((est) => {
              const customerName = est.customer_id ? customerMap[est.customer_id] ?? "Unknown Customer" : null;
              const isMultiOptionProposal = est.proposalMode === "multi_option_packages";
              return (
                <Link
                  key={est.id}
                  href={`/estimates/${est.id}`}
                  className="block px-4 py-4 transition-colors hover:bg-slate-50 sm:px-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-500">{est.estimate_number}</span>
                        <span
                          className={`inline-flex min-h-7 items-center rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ${statusBadgeClass(est.status)}`}
                        >
                          {statusLabel(est.status)}
                        </span>
                        {isMultiOptionProposal && (
                          <span className="inline-flex min-h-7 items-center rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                            Multi-option
                          </span>
                        )}
                      </div>
                      <div className="mt-2 truncate text-base font-semibold text-slate-950">{est.title}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                        {customerName ? <span>{customerName}</span> : <span>No customer attached</span>}
                        <span>Created {formatDate(est.created_at)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      {isMultiOptionProposal ? (
                        <>
                          <div className="text-sm font-semibold text-slate-950">Option totals</div>
                          <div className="mt-1 text-xs text-slate-500">Open estimate to review packages</div>
                        </>
                      ) : (
                        <>
                          <div className="text-lg font-semibold text-slate-950">
                            {formatCents(est.total_cents)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">Proposal total</div>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
