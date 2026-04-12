import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
import {
  finalizeContractorIntakeSubmissionFromForm,
  rejectContractorIntakeSubmissionFromForm,
} from "@/lib/actions/contractor-intake-actions";
import CustomerLocationFinalizationFields from "./_components/CustomerLocationFinalizationFields";

type SearchParams = Promise<{ notice?: string }>;

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

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
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

function noticeText(notice: string) {
  const key = normalizeText(notice).toLowerCase();
  if (key === "rejected") return "Proposal rejected.";
  return "";
}

function customerDisplayName(row: any) {
  const fullName = normalizeText(row?.full_name);
  if (fullName) return fullName;
  const first = normalizeText(row?.first_name);
  const last = normalizeText(row?.last_name);
  return [first, last].filter(Boolean).join(" ") || "Unnamed Customer";
}

function locationDisplayName(row: any) {
  const nickname = normalizeText(row?.nickname);
  const address = normalizeText(row?.address_line1);
  const city = normalizeText(row?.city);
  const zip = normalizeText(row?.zip || row?.postal_code);
  const base = nickname || address || "Location";
  const suffix = [city, zip].filter(Boolean).join(" ");
  return suffix ? `${base} - ${suffix}` : base;
}

export default async function ContractorIntakeSubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: SearchParams;
}) {
  const { id } = await params;
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const notice = noticeText(String(sp.notice ?? ""));

  const { internalUser } = await requireReviewerOrRedirect();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("contractor_intake_submissions")
    .select(`
      id,
      account_owner_user_id,
      submitted_by_user_id,
      contractor_id,
      created_at,
      proposed_customer_first_name,
      proposed_customer_last_name,
      proposed_customer_phone,
      proposed_customer_email,
      proposed_address_line1,
      proposed_city,
      proposed_zip,
      proposed_location_nickname,
      proposed_job_type,
      proposed_project_type,
      proposed_title,
      proposed_job_notes,
      review_status,
      review_note,
      reviewed_by_user_id,
      reviewed_at,
      finalized_job_id,
      finalized_customer_id,
      finalized_location_id,
      contractors:contractor_id ( name )
    `)
    .eq("id", id)
    .eq("account_owner_user_id", internalUser.account_owner_user_id)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return notFound();

  const submission = data as any;
  const isPending = normalizeText(submission.review_status).toLowerCase() === "pending";

  const { data: customerRows, error: customerErr } = await admin
    .from("customers")
    .select("id, full_name, first_name, last_name, phone, email")
    .eq("owner_user_id", internalUser.account_owner_user_id)
    .order("full_name", { ascending: true })
    .limit(500);

  if (customerErr) throw customerErr;

  const customerIds = (customerRows ?? [])
    .map((row: any) => normalizeText(row?.id))
    .filter(Boolean);

  let locationRows: any[] = [];
  if (customerIds.length > 0) {
    const { data: locationsData, error: locationsErr } = await admin
      .from("locations")
      .select("id, customer_id, nickname, address_line1, city, zip, postal_code")
      .in("customer_id", customerIds)
      .order("address_line1", { ascending: true })
      .limit(1200);

    if (locationsErr) throw locationsErr;
    locationRows = locationsData ?? [];
  }

  const customerOptions = (customerRows ?? []).map((row: any) => ({
    id: normalizeText(row?.id),
    displayName: customerDisplayName(row),
    phone: normalizeText(row?.phone) || null,
    email: normalizeText(row?.email) || null,
  }));

  const locationOptions = locationRows
    .map((row: any) => ({
      id: normalizeText(row?.id),
      customerId: normalizeText(row?.customer_id),
      displayName: locationDisplayName(row),
      city: normalizeText(row?.city) || null,
      zip: normalizeText(row?.zip || row?.postal_code) || null,
    }))
    .filter((row) => row.id && row.customerId);

  const contractorName = normalizeText(submission?.contractors?.name) || "Contractor";
  const customerName = [
    normalizeText(submission.proposed_customer_first_name),
    normalizeText(submission.proposed_customer_last_name),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contractor Intake Proposal</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Review submission</h1>
            <p className="mt-1 text-sm text-slate-600">Submitted {formatDateTime(submission.created_at)} by {contractorName}.</p>
          </div>
          <Link
            href="/ops/admin/contractor-intake-submissions"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Back to pending list
          </Link>
        </div>
      </div>

      {notice ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Proposed customer</h2>
          <div className="mt-3 space-y-1 text-sm text-slate-800">
            <div><span className="font-medium">Name:</span> {customerName || "-"}</div>
            <div><span className="font-medium">Phone:</span> {normalizeText(submission.proposed_customer_phone) || "-"}</div>
            <div><span className="font-medium">Email:</span> {normalizeText(submission.proposed_customer_email) || "-"}</div>
          </div>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Proposed location</h2>
          <div className="mt-3 space-y-1 text-sm text-slate-800">
            <div><span className="font-medium">Address:</span> {normalizeText(submission.proposed_address_line1) || "-"}</div>
            <div><span className="font-medium">City:</span> {normalizeText(submission.proposed_city) || "-"}</div>
            <div><span className="font-medium">ZIP:</span> {normalizeText(submission.proposed_zip) || "-"}</div>
            <div><span className="font-medium">Nickname:</span> {normalizeText(submission.proposed_location_nickname) || "-"}</div>
          </div>

          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Job intent</h2>
          <div className="mt-3 space-y-1 text-sm text-slate-800">
            <div><span className="font-medium">Type:</span> {normalizeText(submission.proposed_job_type) || "-"}</div>
            <div><span className="font-medium">Project type:</span> {normalizeText(submission.proposed_project_type) || "-"}</div>
            <div><span className="font-medium">Title:</span> {normalizeText(submission.proposed_title) || "-"}</div>
            <div><span className="font-medium">Notes:</span> {normalizeText(submission.proposed_job_notes) || "-"}</div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Status: {normalizeText(submission.review_status) || "-"}
            {submission.reviewed_at ? ` • Reviewed ${formatDateTime(submission.reviewed_at)}` : ""}
          </div>
        </section>

        <section className="space-y-4">
          <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" open={isPending}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">Finalize as existing customer + existing location</summary>
            <form action={finalizeContractorIntakeSubmissionFromForm} className="mt-3 space-y-3">
              <input type="hidden" name="submission_id" value={submission.id} />
              <input type="hidden" name="finalization_mode" value="existing_existing" />

              <CustomerLocationFinalizationFields
                mode="existing_existing"
                customers={customerOptions}
                locations={locationOptions}
                disabled={!isPending}
              />
              <textarea name="review_note" placeholder="Optional review note" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} disabled={!isPending} />

              <button type="submit" disabled={!isPending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Finalize
              </button>
            </form>
          </details>

          <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">Finalize as existing customer + new location</summary>
            <form action={finalizeContractorIntakeSubmissionFromForm} className="mt-3 space-y-3">
              <input type="hidden" name="submission_id" value={submission.id} />
              <input type="hidden" name="finalization_mode" value="existing_new" />

              <CustomerLocationFinalizationFields
                mode="existing_new"
                customers={customerOptions}
                locations={locationOptions}
                disabled={!isPending}
              />

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="new_location_nickname">Location nickname (optional)</label>
                <input id="new_location_nickname" name="new_location_nickname" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={normalizeText(submission.proposed_location_nickname)} disabled={!isPending} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="new_address_line1_existing_new">Address line 1</label>
                <input id="new_address_line1_existing_new" name="new_address_line1" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={normalizeText(submission.proposed_address_line1)} required disabled={!isPending} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="new_city_existing_new">City</label>
                  <input id="new_city_existing_new" name="new_city" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={normalizeText(submission.proposed_city)} required disabled={!isPending} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="new_zip_existing_new">ZIP</label>
                  <input id="new_zip_existing_new" name="new_zip" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={normalizeText(submission.proposed_zip)} required disabled={!isPending} />
                </div>
              </div>
              <textarea name="review_note" placeholder="Optional review note" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} disabled={!isPending} />

              <button type="submit" disabled={!isPending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Finalize
              </button>
            </form>
          </details>

          <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">Finalize as new customer + new location</summary>
            <form action={finalizeContractorIntakeSubmissionFromForm} className="mt-3 space-y-3">
              <input type="hidden" name="submission_id" value={submission.id} />
              <input type="hidden" name="finalization_mode" value="new_new" />

              <p className="text-xs text-slate-600">Create a new canonical customer and location from this proposal.</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="new_customer_first_name">Customer first name</label>
                  <input id="new_customer_first_name" name="new_customer_first_name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={normalizeText(submission.proposed_customer_first_name)} disabled={!isPending} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="new_customer_last_name">Customer last name</label>
                  <input id="new_customer_last_name" name="new_customer_last_name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={normalizeText(submission.proposed_customer_last_name)} disabled={!isPending} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="new_customer_phone">Customer phone</label>
                  <input id="new_customer_phone" name="new_customer_phone" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={normalizeText(submission.proposed_customer_phone)} disabled={!isPending} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="new_customer_email">Customer email</label>
                  <input id="new_customer_email" name="new_customer_email" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={normalizeText(submission.proposed_customer_email)} disabled={!isPending} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="new_location_nickname_new_new">Location nickname (optional)</label>
                <input id="new_location_nickname_new_new" name="new_location_nickname" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={normalizeText(submission.proposed_location_nickname)} disabled={!isPending} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="new_address_line1_new_new">Address line 1</label>
                <input id="new_address_line1_new_new" name="new_address_line1" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={normalizeText(submission.proposed_address_line1)} required disabled={!isPending} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="new_city_new_new">City</label>
                  <input id="new_city_new_new" name="new_city" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={normalizeText(submission.proposed_city)} required disabled={!isPending} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="new_zip_new_new">ZIP</label>
                  <input id="new_zip_new_new" name="new_zip" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" defaultValue={normalizeText(submission.proposed_zip)} required disabled={!isPending} />
                </div>
              </div>
              <textarea name="review_note" placeholder="Optional review note" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} disabled={!isPending} />

              <button type="submit" disabled={!isPending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Finalize
              </button>
            </form>
          </details>

          <details className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-rose-800">Reject proposal</summary>
            <form action={rejectContractorIntakeSubmissionFromForm} className="mt-3 space-y-3">
              <input type="hidden" name="submission_id" value={submission.id} />
              <textarea name="review_note" placeholder="Optional reject note" className="w-full rounded-lg border border-rose-300 px-3 py-2 text-sm" rows={3} disabled={!isPending} />

              <button type="submit" disabled={!isPending} className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">
                Reject
              </button>
            </form>
          </details>
        </section>
      </div>
    </div>
  );
}
