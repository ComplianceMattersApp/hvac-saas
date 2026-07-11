import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isPlatformOwnerActor } from "@/lib/business/platform-owner-access";
import { loadPlatformOwnerDashboardModel } from "@/lib/business/platform-owner-dashboard";
import { loadPlatformOwnerCustomerLiteSnapshot } from "@/lib/business/platform-owner-customer-lite";
import { createAdminClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";

type PageParams = Promise<{
  accountOwnerUserId?: string;
  customerId?: string;
}>;

async function requirePlatformOwnerOrFailClosed() {
  const user = await getRequestUser();
  if (!user) redirect("/login");

  const allowlisted = isPlatformOwnerActor({
    userId: user.id,
    email: user.email,
    env: process.env,
  });

  if (!allowlisted) notFound();
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

function formatLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "-";
  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function DetailCard(props: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{props.label}</p>
      <p className="mt-2 break-words text-base font-semibold text-slate-950">{props.value}</p>
      {props.helper ? <p className="mt-1 text-xs text-slate-500">{props.helper}</p> : null}
    </div>
  );
}

export default async function OwnerSupportCustomerSnapshotLitePage({
  params,
}: {
  params: PageParams;
}) {
  await requirePlatformOwnerOrFailClosed();

  const rawParams = (await params) ?? {};
  const accountOwnerUserId = decodeURIComponent(String(rawParams.accountOwnerUserId ?? "").trim());
  const customerId = decodeURIComponent(String(rawParams.customerId ?? "").trim());

  if (!accountOwnerUserId || !customerId) notFound();

  const admin = createAdminClient();
  const [dashboardModel, snapshot] = await Promise.all([
    loadPlatformOwnerDashboardModel({ admin }),
    loadPlatformOwnerCustomerLiteSnapshot({ supabase: admin, accountOwnerUserId, customerId }),
  ]);
  const accountRow = dashboardModel.rows.find(
    (candidate) => candidate.accountOwnerUserId === accountOwnerUserId,
  );

  if (!accountRow || !snapshot) notFound();

  const { customer, locations, recentJobs } = snapshot;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-4 text-slate-900 sm:p-6">
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Platform Owner</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Customer Snapshot Lite</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Read-only customer context for owner-led support calls. This page shows basic context only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/ops/owner-console/${encodeURIComponent(accountOwnerUserId)}/customers`}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Back to Customers
            </Link>
            <Link
              href={`/ops/owner-console/${encodeURIComponent(accountOwnerUserId)}`}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Back to Snapshot
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Customer Account</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">{accountRow.company}</h2>
        <p className="mt-1 text-sm text-slate-500">Owner: {accountRow.ownerName ?? "-"} · {accountRow.ownerEmail ?? "-"}</p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Selected Customer</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{customer.displayName}</h2>
            <p className="mt-1 break-all font-mono text-xs text-slate-400">{customer.id}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailCard label="Phone" value={customer.phone ?? "No phone visible"} />
          <DetailCard label="Email" value={customer.email ?? "No email visible"} />
          <DetailCard label="Billing Address" value={customer.billingAddress} />
          <DetailCard label="Created" value={formatDate(customer.createdAt)} />
          <DetailCard label="Locations" value={String(customer.locationCount)} helper="Visible location count." />
          <DetailCard label="Jobs" value={String(customer.jobCount)} helper="Visible job count." />
          <DetailCard label="Latest Job" value={formatDate(customer.latestJobAt)} />
          <DetailCard label="Updated" value={formatDate(customer.updatedAt)} />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Service Locations</p>
        <div className="mt-3 space-y-3">
          {locations.map((location) => (
            <div key={location.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-950">{location.label}</p>
              <p className="mt-1 text-sm text-slate-600">{location.address}</p>
              <p className="mt-1 font-mono text-[11px] text-slate-400">{location.id}</p>
            </div>
          ))}
          {locations.length === 0 ? <p className="text-sm text-slate-500">No service locations visible.</p> : null}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Recent Jobs</p>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Job</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Scheduled</th>
                <th className="px-4 py-3 font-semibold">Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {recentJobs.map((job) => (
                <tr key={job.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">{job.title}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">{job.id}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <p>{formatLabel(job.status)}</p>
                    <p className="text-xs text-slate-500">{formatLabel(job.opsStatus)}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(job.scheduledDate)}</td>
                  <td className="px-4 py-3 text-slate-700">{job.address}</td>
                </tr>
              ))}
              {recentJobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    No recent jobs visible for this customer.
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
          This is a read-only customer support snapshot. It does not include edit forms, notes, attachments, payment actions, or tenant operations.
        </p>
      </section>
    </div>
  );
}
