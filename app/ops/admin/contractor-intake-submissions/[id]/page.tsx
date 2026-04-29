import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
import {
  finalizeContractorIntakeSubmissionFromForm,
  rejectContractorIntakeSubmissionFromForm,
  markContractorIntakeSubmissionAsDuplicateFromForm,
} from "@/lib/actions/contractor-intake-actions";
import { formatDateOnlyDisplay } from "@/lib/utils/schedule-la";
import GuidedFinalizationWizard from "./_components/GuidedFinalizationWizard";

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
  if (key === "duplicate") return "Proposal marked as duplicate of an existing job.";
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
      proposed_state,
      proposed_zip,
      proposed_location_nickname,
      proposed_job_type,
      proposed_project_type,
      proposed_title,
      proposed_job_notes,
      proposed_permit_number,
      proposed_jurisdiction,
      proposed_permit_date,
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

  const { data: commentRows, error: commentErr } = await admin
    .from("contractor_intake_submission_comments")
    .select("id, author_role, comment_text, created_at")
    .eq("submission_id", submission.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (commentErr) throw commentErr;

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

  // ── ECC permit match check (isolated — column may not yet exist in DB) ──────────
  let proposedPermitNum = "";
  const proposedTypeIsEcc =
    normalizeText(submission.proposed_job_type).toLowerCase() !== "service";

  let permitMatchRows: Array<{
    id: string;
    title: string;
    jobAddress: string | null;
    city: string | null;
    permitNumber: string | null;
    opsStatus: string | null;
    status: string | null;
    createdAt: string | null;
    customerName: string;
  }> = [];

  if (proposedTypeIsEcc && customerIds.length > 0) {
    try {
      const { data: permitRow } = await admin
        .from("contractor_intake_submissions")
        .select("proposed_permit_number")
        .eq("id", id)
        .maybeSingle();
      proposedPermitNum = normalizeText((permitRow as any)?.proposed_permit_number);
    } catch {
      // Column does not yet exist — migration pending. Degrade gracefully.
      proposedPermitNum = "";
    }
  }

  if (proposedPermitNum && proposedTypeIsEcc && customerIds.length > 0) {
    try {
      const { data: pmData } = await admin
        .from("jobs")
        .select(
          "id, title, job_address, city, permit_number, ops_status, status, created_at, customer_first_name, customer_last_name",
        )
        .eq("permit_number", proposedPermitNum)
        .eq("job_type", "ecc")
        .in("customer_id", customerIds)
        .order("created_at", { ascending: false })
        .limit(5);

      permitMatchRows = (pmData ?? []).map((row: any) => ({
        id: normalizeText(row.id),
        title: normalizeText(row.title) || "—",
        jobAddress: normalizeText(row.job_address) || null,
        city: normalizeText(row.city) || null,
        permitNumber: normalizeText(row.permit_number) || null,
        opsStatus: normalizeText(row.ops_status) || null,
        status: normalizeText(row.status) || null,
        createdAt: normalizeText(row.created_at) || null,
        customerName:
          [normalizeText(row.customer_first_name), normalizeText(row.customer_last_name)]
            .filter(Boolean)
            .join(" ") || "—",
      }));
    } catch {
      permitMatchRows = [];
    }
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
      addressLine1: normalizeText(row?.address_line1) || null,
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
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Proposed customer</h2>
          <dl className="mt-3 space-y-2.5">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Name</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900">{customerName || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Phone</dt>
              <dd className="mt-0.5 text-sm text-slate-700">{normalizeText(submission.proposed_customer_phone) || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Email</dt>
              <dd className="mt-0.5 text-sm text-slate-700">{normalizeText(submission.proposed_customer_email) || "—"}</dd>
            </div>
          </dl>

          <div className="my-5 border-t border-slate-100" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Proposed location</h2>
          <dl className="mt-3 space-y-2.5">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Address</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900">{normalizeText(submission.proposed_address_line1) || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">City</dt>
              <dd className="mt-0.5 text-sm text-slate-700">{normalizeText(submission.proposed_city) || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">State</dt>
              <dd className="mt-0.5 text-sm text-slate-700">{normalizeText(submission.proposed_state) || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">ZIP</dt>
              <dd className="mt-0.5 text-sm text-slate-700">{normalizeText(submission.proposed_zip) || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Nickname</dt>
              <dd className="mt-0.5 text-sm text-slate-700">{normalizeText(submission.proposed_location_nickname) || "—"}</dd>
            </div>
          </dl>

          <div className="my-5 border-t border-slate-100" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Job intent</h2>
          <dl className="mt-3 space-y-2.5">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Type</dt>
              <dd className="mt-0.5 text-sm font-medium text-slate-900">{normalizeText(submission.proposed_job_type) || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Project type</dt>
              <dd className="mt-0.5 text-sm text-slate-700">{normalizeText(submission.proposed_project_type) || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Title</dt>
              <dd className="mt-0.5 text-sm text-slate-700">{normalizeText(submission.proposed_title) || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Notes</dt>
              <dd className="mt-0.5 text-sm text-slate-700">{normalizeText(submission.proposed_job_notes) || "—"}</dd>
            </div>
            {proposedTypeIsEcc && proposedPermitNum ? (
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Permit #</dt>
                <dd className="mt-0.5 text-sm font-mono font-medium text-slate-900">{proposedPermitNum}</dd>
              </div>
            ) : null}
            {proposedTypeIsEcc && normalizeText(submission.proposed_jurisdiction) ? (
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Jurisdiction</dt>
                <dd className="mt-0.5 text-sm text-slate-700">{normalizeText(submission.proposed_jurisdiction)}</dd>
              </div>
            ) : null}
            {proposedTypeIsEcc && normalizeText(submission.proposed_permit_date) ? (
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Permit date</dt>
                <dd className="mt-0.5 text-sm text-slate-700">{formatDateOnlyDisplay(normalizeText(submission.proposed_permit_date))}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className={[
              "inline-block h-2 w-2 shrink-0 rounded-full",
              normalizeText(submission.review_status).toLowerCase() === "pending" ? "bg-amber-400" :
              normalizeText(submission.review_status).toLowerCase() === "finalized" ? "bg-emerald-500" :
              normalizeText(submission.review_status).toLowerCase() === "rejected" ? "bg-rose-500" : "bg-slate-400",
            ].join(" ")} />
            <span className="text-xs text-slate-600">
              {normalizeText(submission.review_status) || "—"}
              {submission.reviewed_at ? ` · Reviewed ${formatDateTime(submission.reviewed_at)}` : ""}
            </span>
          </div>

          <div className="my-5 border-t border-slate-100" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contractor follow-up comments</h2>
          {commentRows && commentRows.length > 0 ? (
            <div className="mt-3 space-y-2">
              {commentRows.map((row: any) => (
                <div key={normalizeText(row.id)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-[11px] text-slate-500">
                    {normalizeText(row.author_role) || "contractor"} · {formatDateTime(normalizeText(row.created_at) || null)}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {normalizeText(row.comment_text) || "—"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
              No follow-up comments added.
            </div>
          )}
        </section>

        <section className="space-y-4">
          <GuidedFinalizationWizard
            submissionId={submission.id}
            customers={customerOptions}
            locations={locationOptions}
            disabled={!isPending}
            duplicateAction={markContractorIntakeSubmissionAsDuplicateFromForm}
            permitNumber={proposedPermitNum || null}
            permitMatches={permitMatchRows}
            proposed={{
              customerFirstName: normalizeText(submission.proposed_customer_first_name),
              customerLastName: normalizeText(submission.proposed_customer_last_name),
              customerPhone: normalizeText(submission.proposed_customer_phone),
              customerEmail: normalizeText(submission.proposed_customer_email),
              addressLine1: normalizeText(submission.proposed_address_line1),
              city: normalizeText(submission.proposed_city),
              state: normalizeText(submission.proposed_state) || "CA",
              zip: normalizeText(submission.proposed_zip),
              locationNickname: normalizeText(submission.proposed_location_nickname),
            }}
            submitAction={finalizeContractorIntakeSubmissionFromForm}
          />

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-100" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-slate-50 px-3 text-xs text-slate-400">or</span>
            </div>
          </div>

          <details className="rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-medium text-rose-700">Reject proposal</summary>
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
