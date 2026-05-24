import { accountScopeInList, resolveReportAccountContractorIds } from "@/lib/reports/report-account-scope";
import { createAdminClient } from "@/lib/supabase/server";

type UsageRecencySnapshotModel = {
  customersLast30Days: number;
  jobsLast30Days: number;
  invoicesLast30Days: number;
  issuedInvoicesLast30Days: number;
};

function sinceIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function normalizeCount(value: unknown) {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.trunc(count));
}

async function loadUsageRecencySnapshot(params: {
  admin: any;
  accountOwnerUserId: string;
}): Promise<UsageRecencySnapshotModel> {
  const since = sinceIso(30);
  const contractorIds = await resolveReportAccountContractorIds({
    supabase: params.admin,
    accountOwnerUserId: params.accountOwnerUserId,
  });
  const scopedContractorIds = accountScopeInList(contractorIds);

  const [
    customersResult,
    jobsResult,
    invoicesResult,
    issuedInvoicesResult,
  ] = await Promise.all([
    params.admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", params.accountOwnerUserId)
      .is("deleted_at", null)
      .gte("created_at", since),
    params.admin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in("contractor_id", scopedContractorIds)
      .gte("created_at", since),
    params.admin
      .from("internal_invoices")
      .select("id", { count: "exact", head: true })
      .eq("account_owner_user_id", params.accountOwnerUserId)
      .gte("created_at", since),
    params.admin
      .from("internal_invoices")
      .select("id", { count: "exact", head: true })
      .eq("account_owner_user_id", params.accountOwnerUserId)
      .eq("status", "issued")
      .gte("issued_at", since),
  ]);

  if (customersResult.error) throw customersResult.error;
  if (jobsResult.error) throw jobsResult.error;
  if (invoicesResult.error) throw invoicesResult.error;
  if (issuedInvoicesResult.error) throw issuedInvoicesResult.error;

  return {
    customersLast30Days: normalizeCount(customersResult.count),
    jobsLast30Days: normalizeCount(jobsResult.count),
    invoicesLast30Days: normalizeCount(invoicesResult.count),
    issuedInvoicesLast30Days: normalizeCount(issuedInvoicesResult.count),
  };
}

function RecencyCard(props: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{props.label}</p>
      <p className="mt-2 text-base font-semibold text-slate-950">{props.value}</p>
      <p className="mt-1 text-xs text-slate-500">{props.helper}</p>
    </div>
  );
}

export default async function UsageRecencySnapshot({
  accountOwnerUserId,
}: {
  accountOwnerUserId: string;
}) {
  const admin = createAdminClient();
  const snapshot = await loadUsageRecencySnapshot({ admin, accountOwnerUserId });
  const totalRecentActivity =
    snapshot.customersLast30Days +
    snapshot.jobsLast30Days +
    snapshot.invoicesLast30Days +
    snapshot.issuedInvoicesLast30Days;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 pb-6 text-slate-900 sm:px-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Usage Recency</p>
            <h2 className="mt-1 text-base font-semibold text-slate-900">Last 30 days</h2>
            <p className="mt-1 text-sm text-slate-500">
              Aggregate activity signals only. This helps confirm whether the account is actively being used without opening tenant records.
            </p>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
            totalRecentActivity > 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
          }`}>
            {totalRecentActivity > 0 ? "Recent activity" : "Quiet account"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <RecencyCard
            label="New Customers"
            value={snapshot.customersLast30Days}
            helper="Customer records created in the last 30 days."
          />
          <RecencyCard
            label="New Jobs"
            value={snapshot.jobsLast30Days}
            helper="Job records created in the last 30 days."
          />
          <RecencyCard
            label="New Invoices"
            value={snapshot.invoicesLast30Days}
            helper="Invoice records created in the last 30 days."
          />
          <RecencyCard
            label="Issued Invoices"
            value={snapshot.issuedInvoicesLast30Days}
            helper="Invoices issued in the last 30 days."
          />
        </div>
      </section>
    </div>
  );
}
