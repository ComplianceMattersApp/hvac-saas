import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";

async function requireReviewerOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  try {
    const authz = await requireInternalRole(["admin", "office"], {
      supabase,
      userId: user.id,
    });

    return { userId: user.id, internalUser: authz.internalUser };
  } catch (error) {
    if (isInternalAccessError(error)) {
      const { data: cu, error: cuErr } = await supabase
        .from("contractor_users")
        .select("contractor_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cuErr) throw cuErr;
      if (cu?.contractor_id) redirect("/portal");
      redirect("/ops");
    }

    throw error;
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(dt);
}

export default async function ContractorIntakeSubmissionsPage() {
  const { internalUser } = await requireReviewerOrRedirect();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("contractor_intake_submissions")
    .select(`
      id,
      contractor_id,
      created_at,
      proposed_customer_first_name,
      proposed_customer_last_name,
      proposed_city,
      proposed_zip,
      proposed_job_type,
      proposed_title,
      review_status,
      contractors:contractor_id ( name )
    `)
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .eq("review_status", "pending")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const rows = data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin Center</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Contractor Intake Proposals</h1>
            <p className="mt-1 text-sm text-slate-600">
              Review pending contractor-submitted customer/location proposals and finalize into canonical job creation.
            </p>
          </div>
          <Link
            href="/ops/admin"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Admin Center
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-900">
          Pending proposals ({rows.length})
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            No pending contractor intake proposals.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">Contractor</th>
                  <th className="px-3 py-2">Proposed Customer</th>
                  <th className="px-3 py-2">City / ZIP</th>
                  <th className="px-3 py-2">Job</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) => {
                  const customer = [
                    String(row?.proposed_customer_first_name ?? "").trim(),
                    String(row?.proposed_customer_last_name ?? "").trim(),
                  ]
                    .filter(Boolean)
                    .join(" ");

                  const contractorName = String((row as any)?.contractors?.name ?? "").trim() || "Contractor";
                  const city = String(row?.proposed_city ?? "").trim() || "-";
                  const zip = String(row?.proposed_zip ?? "").trim() || "-";
                  const jobType = String(row?.proposed_job_type ?? "").trim().toUpperCase() || "-";
                  const title = String(row?.proposed_title ?? "").trim() || "Untitled intake";

                  return (
                    <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2 text-slate-700">{formatDateTime(String(row?.created_at ?? ""))}</td>
                      <td className="px-3 py-2 text-slate-900">{contractorName}</td>
                      <td className="px-3 py-2 text-slate-900">{customer || "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{city} / {zip}</td>
                      <td className="px-3 py-2 text-slate-700">{jobType} - {title}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/ops/admin/contractor-intake-submissions/${row.id}`}
                          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-900 hover:bg-slate-50"
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
