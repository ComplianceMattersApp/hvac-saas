import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentContractorPortalContext } from "@/lib/portal/intake-proposal-read-model";
import { requireInternalUser } from "@/lib/auth/internal-user";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import { generateContractorReportPreview } from "@/lib/actions/job-ops-actions";
import PrintFailureReportButton from "./PrintFailureReportButton";

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

export default async function ContractorFailureReportPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: jobId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const portalContext = await requireCurrentContractorPortalContext({ supabase }).catch(() => null);
  const internalContext = portalContext
    ? null
    : await requireInternalUser({ supabase, userId: auth.user.id }).catch(() => null);
  if (!portalContext && !internalContext) notFound();

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, contractor_id, customer_first_name, customer_last_name, job_address, city, contractors:contractor_id ( owner_user_id )")
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!job) notFound();
  const contractorRelation = job.contractors as unknown as
    { owner_user_id?: string | null } | Array<{ owner_user_id?: string | null }> | null;
  const jobOwnerId = String(
    (Array.isArray(contractorRelation) ? contractorRelation[0]?.owner_user_id : contractorRelation?.owner_user_id) ?? "",
  ).trim();
  if (portalContext && String(job.contractor_id ?? "") !== portalContext.contractorId) notFound();
  if (internalContext && jobOwnerId !== String(internalContext.internalUser.account_owner_user_id ?? "")) notFound();
  const businessIdentity = await resolveInternalBusinessIdentityByAccountOwnerId({
    supabase,
    accountOwnerUserId: jobOwnerId,
  });
  const sp = searchParams ? await searchParams : {};
  const currentMode = internalContext && (Array.isArray(sp.mode) ? sp.mode[0] : sp.mode) === "current";

  const { data: reportEvent } = await supabase
    .from("job_events")
    .select("created_at, meta")
    .eq("job_id", jobId)
    .eq("event_type", "contractor_report_sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let meta: Record<string, unknown> | null =
    reportEvent && reportEvent.meta && typeof reportEvent.meta !== "string"
      ? reportEvent.meta as Record<string, unknown>
      : null;
  if (currentMode) {
    const preview = await generateContractorReportPreview({ jobId });
    meta = {
      customer_name: preview.customer_name,
      location_text: preview.location_text,
      contractor_name: preview.contractor_name,
      service_date_text: preview.service_date_text,
      reasons: preview.reasons,
      failure_details: preview.failure_details,
      contractor_failure_summary_v1: preview.contractor_failure_summary_v1,
      next_step: preview.next_step,
      sent_at_iso: new Date().toISOString(),
    };
  }
  if (!meta) notFound();
  const reportCreatedAt = String(reportEvent?.created_at ?? "").trim();

  const summary =
    meta.contractor_failure_summary_v1 && typeof meta.contractor_failure_summary_v1 === "object"
      ? meta.contractor_failure_summary_v1 as Record<string, unknown>
      : {};
  const reasons = strings(summary.what_needs_correction).length
    ? strings(summary.what_needs_correction)
    : strings(meta.reasons);
  const contractorNote = String(meta.contractor_note ?? "").trim();

  const { data: primarySelectionEvent } = await supabase
    .from("job_events")
    .select("meta")
    .eq("job_id", jobId)
    .eq("event_type", "refrigerant_evidence_primary_selected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const primarySelectionMeta =
    primarySelectionEvent && typeof primarySelectionEvent.meta !== "string"
      ? primarySelectionEvent.meta as Record<string, unknown>
      : null;
  const designatedAttachmentId = String(primarySelectionMeta?.attachment_id ?? "").trim();

  const { data: evidence } = await supabase
    .from("attachments")
    .select("id, bucket, storage_path, file_name, caption, created_at, content_type")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .ilike("content_type", "image/%")
    .ilike("caption", "Refrigerant Charge Photo Evidence%")
    .order("created_at", { ascending: false })
    .limit(20);
  const primaryEvidence =
    (designatedAttachmentId
      ? evidence?.find((attachment) => String(attachment.id) === designatedAttachmentId)
      : null) ??
    evidence?.[0] ??
    null;
  const { data: signed } = primaryEvidence
    ? await supabase.storage.from(String(primaryEvidence.bucket)).createSignedUrl(String(primaryEvidence.storage_path), 600)
    : { data: null };

  const customerName = String(meta.customer_name ?? "").trim() ||
    [job.customer_first_name, job.customer_last_name].map((value) => String(value ?? "").trim()).filter(Boolean).join(" ") ||
    "Customer";
  const location = String(meta.location_text ?? "").trim() ||
    [job.job_address, job.city].map((value) => String(value ?? "").trim()).filter(Boolean).join(", ");
  const generatedAt = String(meta.sent_at_iso ?? reportCreatedAt).trim();

  return (
    <main className="mx-auto max-w-[8.5in] bg-white p-6 text-[11pt] leading-snug text-slate-950 print:p-0">
      <style>{`
        @page { size: Letter portrait; margin: 0.38in; }
        @media print {
          html, body { width: 7.74in; min-height: 10.24in; background: white !important; }
          main { width: 7.74in; max-width: 7.74in; margin: 0; }
          figure, section, header, footer { break-inside: avoid; }
        }
      `}</style>
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-300 pb-3 print:hidden">
        <Link href={`/portal/jobs/${jobId}`} className="text-sm font-semibold text-blue-700">Back to job</Link>
        <div className="text-xs text-slate-500">
          {currentMode ? "Office preview · not yet sent" : "One-page summary"} · primary refrigerant photo only
        </div>
        <PrintFailureReportButton jobId={jobId} mode={currentMode ? "current" : "saved"} />
      </div>

      <header className="flex items-start justify-between gap-6 border-b-2 border-slate-950 pb-3">
        <div className="flex items-start gap-3">
          {businessIdentity.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={businessIdentity.logo_url} alt="" className="h-12 w-16 object-contain" />
          ) : null}
          <div>
          <div className="text-sm font-bold">{businessIdentity.display_name}</div>
          <div className="text-xs font-bold uppercase tracking-[0.14em]">Contractor Failure Report</div>
          <h1 className="mt-1 text-2xl font-bold">Failed — Action Required</h1>
          </div>
        </div>
        <div className="text-right text-xs leading-5">
          <div className="font-semibold">{String(job.title ?? "Job")}</div>
          <div>Job {jobId.slice(0, 8)}</div>
          {businessIdentity.support_phone ? <div>{businessIdentity.support_phone}</div> : null}
          {businessIdentity.support_email ? <div>{businessIdentity.support_email}</div> : null}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-x-8 gap-y-1 border-b border-slate-300 py-3 text-sm">
        <div><strong>Customer:</strong> {customerName}</div>
        <div><strong>Service/Test date:</strong> {String(meta.service_date_text ?? "Not available")}</div>
        <div className="col-span-2"><strong>Location:</strong> {location || "Not available"}</div>
      </section>

      <section className="py-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-red-800">
          {String(summary.what_failed ?? "Refrigerant charge photo evidence did not pass review.")}
        </h2>
        <ul className="mt-2 space-y-1 pl-5">
          {reasons.map((reason) => <li key={reason} className="list-disc font-medium">{reason}</li>)}
        </ul>
      </section>

      {contractorNote ? (
        <section className="mb-3 border-2 border-amber-400 bg-amber-50 px-3 py-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-amber-900">Important message from our team</h2>
          <div className="mt-1 whitespace-pre-wrap font-medium">{contractorNote}</div>
        </section>
      ) : null}

      <section className="mb-3 border border-blue-300 bg-blue-50 px-3 py-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-blue-900">Next step</h2>
        <div className="mt-1 font-medium">{String(summary.next_step ?? meta.next_step ?? "Review and submit your response in the portal.")}</div>
      </section>

      {primaryEvidence && signed?.signedUrl ? (
        <figure className="break-inside-avoid border-t border-slate-300 pt-3">
          <figcaption className="mb-2 flex justify-between gap-4 text-xs">
            <strong>Primary refrigerant-charge failure evidence</strong>
            <span>{String(primaryEvidence.caption ?? primaryEvidence.file_name)}</span>
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signed.signedUrl}
            alt="Primary refrigerant-charge failure evidence"
            className="mx-auto block max-h-[3.25in] max-w-full object-contain [image-orientation:from-image]"
          />
          {(evidence?.length ?? 0) > 1 ? (
            <div className="mt-1 text-center text-[10px] text-slate-600">
              Additional refrigerant-charge evidence is available in the contractor portal.
            </div>
          ) : null}
        </figure>
      ) : (
        <div className="border-t border-slate-300 pt-2 text-xs text-slate-600">
          Refrigerant-charge photo evidence is available in the contractor portal but was not available for this printout.
        </div>
      )}

      <footer className="mt-3 border-t border-slate-300 pt-2 text-[9px] text-slate-500">
        Report shared {generatedAt ? new Date(generatedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "date unavailable"}.
        Model/serial captures and unrelated job attachments are intentionally excluded.
      </footer>
    </main>
  );
}
