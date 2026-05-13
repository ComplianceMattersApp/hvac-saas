import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import {
  listMaintenanceAgreementDrilldownForAccount,
  type MaintenanceAgreementDrilldownFilter,
} from "@/lib/maintenance-agreements/read-model";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";

export const metadata = { title: "Service Plans" };

const FILTERS: Array<{ value: MaintenanceAgreementDrilldownFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due Today" },
  { value: "due_1_7_days", label: "Due in 1-7 Days" },
  { value: "due_8_30_days", label: "Due in 8-30 Days" },
  { value: "not_scheduled", label: "Not Scheduled" },
  { value: "inactive", label: "Inactive" },
];

function isDrilldownFilter(value: unknown): value is MaintenanceAgreementDrilldownFilter {
  return (
    typeof value === "string" &&
    FILTERS.some((filter) => filter.value === value)
  );
}

function formatYmd(value: string | null) {
  if (!value) return "Not scheduled";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00Z`));
  } catch {
    return value;
  }
}

function titleCase(value: string) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return "-";
  return cleaned
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dueStateClass(value: string) {
  if (value === "overdue") return "bg-rose-100 text-rose-700";
  if (value === "due_today") return "bg-amber-100 text-amber-700";
  if (value === "upcoming") return "bg-blue-100 text-blue-700";
  if (value === "not_scheduled") return "bg-slate-100 text-slate-700";
  return "bg-slate-200 text-slate-600";
}

function statusClass(value: string) {
  if (value === "active") return "bg-emerald-100 text-emerald-700";
  if (value === "draft") return "bg-slate-100 text-slate-700";
  if (value === "paused") return "bg-amber-100 text-amber-700";
  if (value === "expired") return "bg-zinc-200 text-zinc-700";
  if (value === "cancelled") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

export default async function ServicePlansPage({
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

  if (!isMaintenanceAgreementsEnabled()) {
    redirect("/ops");
  }

  const sp = (await searchParams) ?? {};
  const rawFilter = Array.isArray(sp.filter) ? sp.filter[0] : sp.filter;
  const selectedFilter = isDrilldownFilter(rawFilter) ? rawFilter : "all";

  const result = await listMaintenanceAgreementDrilldownForAccount({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    today: null,
    filter: selectedFilter,
    limit: 250,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 text-slate-900 sm:space-y-5 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-slate-300/80 bg-white p-4 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.35)] sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <Link
              href="/ops"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <span aria-hidden="true">&larr;</span> Back to Ops
            </Link>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-slate-950">Service Plans</h1>
            <p className="mt-1 text-sm text-slate-600">
              Read-only service plan visibility for planning and follow-up.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">As Of</div>
            <div className="text-sm font-semibold text-slate-800">{result.as_of_date}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const active = filter.value === selectedFilter;
            return (
              <Link
                key={filter.value}
                href={filter.value === "all" ? "/service-plans" : `/service-plans?filter=${encodeURIComponent(filter.value)}`}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold transition-[background-color,border-color,color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
                  active
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:-translate-y-px hover:border-slate-400 hover:bg-slate-50"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {filter.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Showing {result.rows.length} plan{result.rows.length === 1 ? "" : "s"}. This page is read-only.
        </div>
      </section>

      {result.rows.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
          No service plans match this filter.
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-300/80 bg-white shadow-[0_18px_34px_-30px_rgba(15,23,42,0.35)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Primary Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Due State</th>
                  <th className="px-4 py-3">Next Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{row.agreement_name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {titleCase(row.frequency)} • {titleCase(row.agreement_type)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${row.customer_id}`}
                        className="font-semibold text-slate-800 underline-offset-4 hover:text-slate-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        {row.customer_display_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.primary_location_display ?? <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                        {titleCase(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${dueStateClass(row.due_state)}`}>
                        {titleCase(row.due_state)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{formatYmd(row.next_due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
