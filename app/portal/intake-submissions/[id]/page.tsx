import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";

function formatDateTimeLA(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

  return `${date} ${time}`;
}

export default async function PortalIntakeSubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const submissionId = String(id ?? "").trim();
  if (!submissionId) notFound();
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const bannerRaw = sp.banner;
  const banner = Array.isArray(bannerRaw) ? bannerRaw[0] : bannerRaw;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (cuErr) throw cuErr;
  if (!cu?.contractor_id) redirect("/ops");

  const admin = createAdminClient();
  const { data: submission, error: submissionErr } = await admin
    .from("contractor_intake_submissions")
    .select(
      "id, created_at, review_status, proposed_customer_first_name, proposed_customer_last_name, proposed_customer_phone, proposed_customer_email, proposed_address_line1, proposed_city, proposed_zip, proposed_job_type, proposed_project_type, proposed_title, proposed_job_notes, proposed_permit_number, proposed_jurisdiction, proposed_permit_date"
    )
    .eq("id", submissionId)
    .eq("contractor_id", cu.contractor_id)
    .maybeSingle();

  if (submissionErr) throw submissionErr;
  if (!submission?.id) notFound();

  const reviewStatus = String((submission as any)?.review_status ?? "").trim().toLowerCase();
  if (reviewStatus !== "pending") {
    redirect("/portal");
  }

  const customerName = [
    String((submission as any)?.proposed_customer_first_name ?? "").trim(),
    String((submission as any)?.proposed_customer_last_name ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" ");

  const submittedAt = formatDateTimeLA(String((submission as any)?.created_at ?? ""));
  const proposedTitle = String((submission as any)?.proposed_title ?? "").trim();
  const proposedAddress = String((submission as any)?.proposed_address_line1 ?? "").trim();
  const proposedCity = String((submission as any)?.proposed_city ?? "").trim();
  const proposedZip = String((submission as any)?.proposed_zip ?? "").trim();
  const proposedPhone = String((submission as any)?.proposed_customer_phone ?? "").trim();
  const proposedEmail = String((submission as any)?.proposed_customer_email ?? "").trim();
  const proposedJobType = String((submission as any)?.proposed_job_type ?? "").trim();
  const proposedProjectType = String((submission as any)?.proposed_project_type ?? "").trim();
  const proposedPermit = String((submission as any)?.proposed_permit_number ?? "").trim();
  const proposedJurisdiction = String((submission as any)?.proposed_jurisdiction ?? "").trim();
  const proposedPermitDate = String((submission as any)?.proposed_permit_date ?? "").trim();
  const proposedNotes = String((submission as any)?.proposed_job_notes ?? "").trim();

  const { count: proposalAttachmentCount, error: attachmentCountErr } = await admin
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "contractor_intake_submission")
    .eq("entity_id", submissionId);

  if (attachmentCountErr) throw attachmentCountErr;
  const submittedFileCount = proposalAttachmentCount ?? 0;

  const { data: addendumRows, error: addendumErr } = await admin
    .from("contractor_intake_submission_comments")
    .select("id, comment_text, created_at")
    .eq("submission_id", submissionId)
    .eq("author_role", "contractor")
    .order("created_at", { ascending: false })
    .limit(200);

  if (addendumErr) throw addendumErr;

  async function addProposalComment(formData: FormData) {
    "use server";

    const actionSubmissionId = String(formData.get("submission_id") ?? "").trim();
    const commentText = String(formData.get("comment_text") ?? "").trim();

    if (!actionSubmissionId) redirect("/portal?banner=invalid_request");
    if (!commentText) redirect(`/portal/intake-submissions/${actionSubmissionId}?banner=comment_empty`);

    const supabase = await createClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) redirect("/login");

    const { data: cu, error: cuErr } = await supabase
      .from("contractor_users")
      .select("contractor_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (cuErr || !cu?.contractor_id) redirect("/ops");

    const admin = createAdminClient();
    const { data: scopedSubmission, error: scopedSubmissionErr } = await admin
      .from("contractor_intake_submissions")
      .select("id, review_status")
      .eq("id", actionSubmissionId)
      .eq("contractor_id", cu.contractor_id)
      .maybeSingle();

    if (scopedSubmissionErr) throw scopedSubmissionErr;
    if (!scopedSubmission?.id) notFound();

    const reviewStatus = String((scopedSubmission as any)?.review_status ?? "").trim().toLowerCase();
    if (reviewStatus !== "pending") {
      redirect(`/portal/intake-submissions/${actionSubmissionId}`);
    }

    const trimmedComment = commentText.slice(0, 4000).trim();
    if (!trimmedComment) {
      redirect(`/portal/intake-submissions/${actionSubmissionId}?banner=comment_empty`);
    }

    const { error: insertErr } = await admin
      .from("contractor_intake_submission_comments")
      .insert({
        submission_id: actionSubmissionId,
        author_user_id: userData.user.id,
        author_role: "contractor",
        comment_text: trimmedComment,
      });

    if (insertErr) throw insertErr;

    revalidatePath(`/portal/intake-submissions/${actionSubmissionId}`);
    revalidatePath("/portal");
    revalidatePath("/portal/jobs");
    redirect(`/portal/intake-submissions/${actionSubmissionId}?banner=comment_added`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-gray-900 dark:text-gray-100">
      {banner === "comment_added" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Comment added.
        </div>
      ) : null}

      {banner === "comment_empty" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Add a comment before submitting.
        </div>
      ) : null}

      <section className="rounded-[28px] border border-slate-200/80 bg-white/96 p-5 shadow-[0_24px_48px_-34px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-slate-950/85 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <Link
            href="/portal"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color] hover:border-slate-400 hover:bg-slate-50"
          >
            Back to portal
          </Link>
          <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-800">
            Under review
          </span>
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            Intake submission
          </div>
          <h1 className="mt-1 text-[clamp(1.6rem,3.4vw,2.2rem)] font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">
            {proposedTitle || "Submitted intake"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            We received your submission and our team is reviewing it before finalization.
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Submitted {submittedAt}</p>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200/80 bg-white/96 p-5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)] dark:border-slate-800 dark:bg-slate-950/85 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Customer</div>
            <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{customerName || "Not provided"}</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{proposedPhone || "No phone"}</div>
            <div className="text-sm text-slate-600 dark:text-slate-300">{proposedEmail || "No email"}</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Service location</div>
            <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{proposedAddress || "Not provided"}</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{[proposedCity, proposedZip].filter(Boolean).join(" ") || "City/ZIP not provided"}</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Job type</div>
            <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{proposedJobType || "Not provided"}</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{proposedProjectType || "Project type not provided"}</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Permit</div>
            <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{proposedPermit || "Not provided"}</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Jurisdiction</div>
            <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{proposedJurisdiction || "Not provided"}</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Permit date</div>
            <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{proposedPermitDate || "Not provided"}</div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/55">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Submitted note</div>
          {proposedNotes ? (
            <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-slate-200">{proposedNotes}</div>
          ) : (
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">No note was included with this submission.</div>
          )}
        </div>

        {submittedFileCount > 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/55">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Submitted files</div>
            <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
              {submittedFileCount} {submittedFileCount === 1 ? "file" : "files"} received with this submission.
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/55">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Add follow-up comment</div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Add details to help our team during review. Your original submission stays unchanged.
          </p>

          <form action={addProposalComment} className="mt-3 space-y-3">
            <input type="hidden" name="submission_id" value={submissionId} />
            <textarea
              name="comment_text"
              rows={4}
              maxLength={4000}
              placeholder="Add a follow-up comment"
              className="w-full rounded-xl border border-slate-300/80 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <button
              type="submit"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_26px_-20px_rgba(37,99,235,0.42)] transition-[background-color,box-shadow,transform] hover:bg-blue-700 hover:shadow-[0_16px_28px_-20px_rgba(37,99,235,0.46)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 active:translate-y-[0.5px]"
            >
              Add comment
            </button>
          </form>
        </div>

        {addendumRows && addendumRows.length > 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/55">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Follow-up comments</div>
            <div className="mt-2 space-y-2">
              {addendumRows.map((row: any) => (
                <div key={String(row.id)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                  <div className="text-xs text-slate-500 dark:text-slate-400">{formatDateTimeLA(String(row.created_at ?? ""))}</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-slate-200">
                    {String(row.comment_text ?? "").trim()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}