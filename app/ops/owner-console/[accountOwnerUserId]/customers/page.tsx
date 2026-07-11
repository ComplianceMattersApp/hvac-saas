import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";
import { loadPlatformOwnerDashboardModel } from "@/lib/business/platform-owner-dashboard";
import { loadPlatformOwnerCustomerLiteRows } from "@/lib/business/platform-owner-customer-lite";
import { createAdminClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";

type PageParams = Promise<{
  accountOwnerUserId?: string;
}>;

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

const DEFAULT_CUSTOMER_LIMIT = 50;
const SEARCH_CUSTOMER_LIMIT = 250;

async function requirePlatformOwnerOrFailClosed() {
  const user = await getRequestUser();
  if (!user) redirect("/login");

  const allowlisted = isPlatformOwnerActor({
    userId: user.id,
    email: user.email,
    env: process.env,
  });

  if (!allowlisted) {
    notFound();
  }
}

function firstSearchParamValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function formatDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00Z`)
    : new Date(raw);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function SummaryCard(props: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{props.label}</p>
      <p className="mt-2 text-base font-semibold text-slate-950">{props.value}</p>
      <p className="mt-1 text-xs text-slate-500">{props.helper}</p>
    </div>
  );
}

export default async function OwnerSupportCustomerLitePage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams?: PageSearchParams;
}) {
  await requirePlatformOwnerOrFailClosed();

  const rawParams = (await params) ?? {};
  const accountOwnerUserId = decodeURIComponent(
    String(rawParams.accountOwnerUserId ?? "").trim(),
  );

  if (!accountOwnerUserId) {
    notFound();
  }

  const resolvedSearchParams = (searchParams ? await searchParams : {}) ?? {};
  const query = firstSearchParamValue(resolvedSearchParams, "q");
  const hasSearch = Boolean(query);
  const resultLimit = hasSearch ? SEARCH_CUSTOMER_LIMIT : DEFAULT_CUSTOMER_LIMIT;
  const admin = createAdminClient();
  const [dashboardModel, customers] = await Promise.all([
    loadPlatformOwnerDashboardModel({ admin }),
    loadPlatformOwnerCustomerLiteRows({
      supabase: admin,
      accountOwnerUserId,
      query,
      limit: resultLimit,
    }),
  ]);
  const accountRow = dashboardModel.rows.find(
    (candidate) => candidate.accountOwnerUserId === accountOwnerUserId,
  );

  if (!accountRow) {
    notFound();
  }

  const customersWithJobs = customers.filter((customer) => customer.jobCount > 0).length;
  const totalJobs = customers.reduce((sum, customer) => sum + customer.jobCount, 0);
  const totalLocations = customers.reduce((sum, customer) => sum + customer.locationCount, 0);
  const listHelper = hasSearch
    ? `Showing matching customers from the most recent ${SEARCH_CUSTOMER_LIMIT} customer records. Refine the search if needed.`
    : `Showing the ${DEFAULT_CUSTOMER_LIMIT} most recent customers. Use search to find older records.`;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-4 text-slate-900 sm:p-6">
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Platform Owner</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Customer Lookup Lite</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Search-first customer lookup for owner-led support calls. This is not a full customer database view and does not open account-side edit pages.
            </p>
          </div>
          <Link
            href={`/ops/owner-console/${encodeURIComponent(accountOwnerUserId)}`}
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Back to Snapshot
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Customer Account</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{accountRow.company}</h2>
            <p className="mt-1 text-sm text-slate-500">Owner: {accountRow.ownerName ?? "-"} · {accountRow.ownerEmail ?? "-"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Account owner user id</p>
            <p className="mt-1 break-all font-mono text-slate-800">{accountOwnerUserId}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Customers Shown" value={String(customers.length)} helper={hasSearch ? "Search result count." : `Most recent ${DEFAULT_CUSTOMER_LIMIT} records max.`} />
        <SummaryCard label="With Jobs" value={String(customersWithJobs)} helper="Customers shown with at least one visible job." />
        <SummaryCard label="Shown Jobs" value={String(totalJobs)} helper="Aggregate jobs for currently shown customers." />
        <SummaryCard label="Shown Locations" value={String(totalLocations)} helper="Aggregate locations for currently shown customers." />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <form action={`/ops/owner-console/${encodeURIComponent(accountOwnerUserId)}/customers`} method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Find customer</span>
            <input
              name="q"
              defaultValue={query}
              placeholder="Search by name, email, phone, billing address, or customer id..."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-500"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Search
            </button>
            {query ? (
              <Link
                href={`/ops/owner-console/${encodeURIComponent(accountOwnerUserId)}/customers`}
                className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>
        <p className="mt-3 text-xs text-slate-500">{listHelper}</p>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Customers</p>
          <p className="mt-1 text-sm text-slate-500">
            {listHelper} Use Open Snapshot for read-only customer context.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-white text-xs uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="w-[22%] px-4 py-3 font-semibold">Customer</th>
                <th className="w-[16%] px-4 py-3 font-semibold">Contact</th>
                <th className="w-[26%] px-4 py-3 font-semibold">Billing Address</th>
                <th className="w-[8%] px-4 py-3 font-semibold">Locations</th>
                <th className="w-[8%] px-4 py-3 font-semibold">Jobs</th>
                <th className="w-[10%] px-4 py-3 font-semibold">Latest Job</th>
                <th className="w-[10%] px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {customers.map((customer) => (
                <tr key={customer.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">{customer.displayName}</p>
                    <p className="mt-0.5 break-all font-mono text-[11px] text-slate-400">{customer.id}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <p>{customer.phone ?? "No phone visible"}</p>
                    <p className="mt-0.5 break-all text-xs text-slate-500">{customer.email ?? "No email visible"}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{customer.billingAddress}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{customer.locationCount}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{customer.jobCount}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(customer.latestJobAt)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/ops/owner-console/${encodeURIComponent(accountOwnerUserId)}/customers/${encodeURIComponent(customer.id)}`}
                      className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Open Snapshot
                    </Link>
                  </td>
                </tr>
              ))}
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    {query ? "No customers match this search." : "No customers are visible for this account."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
        <h2 className="font-semibold">Support boundary</h2>
        <p className="mt-1">
          This is a read-only support lookup. It does not open tenant customer profiles, expose notes or attachments, create support sessions, impersonate users, or allow customer/job/invoice edits.
        </p>
      </section>
    </div>
  );
}
