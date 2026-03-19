// app/portal/jobs/[id]/page
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requestRetestReadyFromPortal } from "@/lib/actions/job-actions";
import { insertInternalNotificationForEvent } from "@/lib/actions/notification-actions";
import { createClient } from "@/lib/supabase/server";
import JobAttachments from "@/components/portal/JobAttachments";
import SubmitButton from "@/components/SubmitButton";
import JobLocationPreview from "@/components/jobs/JobLocationPreview";
import {
  extractFailureReasons,
  finalRunPass,
  resolveContractorIssues,
} from "@/lib/portal/resolveContractorIssues";
import { formatBusinessDateUS } from "@/lib/utils/schedule-la";

function formatDateLA(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatDateTimeLA(iso: string) {
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

function titleCaseFromSnake(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return "-";

  return v
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimeLocal(value: string | null | undefined) {
  const s = String(value || "").slice(0, 5);
  return s || "-";
}

function getEventNoteText(meta?: any) {
  if (!meta) return "";
  return String(meta.note ?? meta.message ?? meta.caption ?? "").trim();
}

function getEventAttachmentCount(meta?: any) {
  if (!meta) return 0;
  const explicitCount = Number(meta.count ?? 0);
  if (Number.isFinite(explicitCount) && explicitCount > 0) return explicitCount;
  if (Array.isArray(meta.attachment_ids) && meta.attachment_ids.length > 0) return meta.attachment_ids.length;
  if (Array.isArray(meta.file_names) && meta.file_names.length > 0) return meta.file_names.length;
  if (typeof meta.file_name === "string" && meta.file_name.trim()) return 1;
  return 0;
}

function getEventAttachmentLabel(meta?: any) {
  const count = getEventAttachmentCount(meta);
  return count > 0 ? `${count} attachment${count === 1 ? "" : "s"}` : "";
}

function summarizePlainText(value?: string | null, maxLength = 140) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatPortalTimelineLabel(type?: string | null, meta?: any) {
  if (type === "contractor_note") {
    return getEventAttachmentCount(meta) > 0 ? "Contractor response received" : "Contractor note received";
  }
  if (type === "contractor_correction_submission") return "Correction submission received";
  if (type === "attachment_added") return "Attachment received";
  if (type === "customer_attempt") return "Contact attempt logged";
  if (type === "retest_ready_requested") return "Retest ready requested";
  if (type === "contractor_report_sent") return "Contractor report shared";
  if (type === "status_changed") return `Status updated: ${titleCaseFromSnake(String(meta?.to ?? ""))}`;
  if (type === "job_failed") return "Result recorded: Failed";
  if (type === "job_passed") return "Result recorded: Passed";
  if (type === "job_created") return "Job created";
  return titleCaseFromSnake(type);
}

function formatPortalTimelineDetail(type?: string | null, meta?: any) {
  const noteSummary = summarizePlainText(getEventNoteText(meta), 160);
  const attachmentLabel = getEventAttachmentLabel(meta);

  if (type === "customer_attempt") {
    const method = summarizePlainText(String(meta?.method ?? "").replace(/_/g, " "), 40);
    const result = summarizePlainText(String(meta?.result ?? "").replace(/_/g, " "), 60);
    return [method, result].filter(Boolean).join(" - ");
  }

  if (["contractor_note", "contractor_correction_submission", "attachment_added"].includes(String(type ?? ""))) {
    if (noteSummary && attachmentLabel) return `${noteSummary} - ${attachmentLabel}`;
    if (noteSummary) return noteSummary;
    if (attachmentLabel) return `Included ${attachmentLabel}`;
  }

  if (type === "retest_ready_requested") {
    return "Contractor marked corrections complete and asked for retest review.";
  }

  if (type === "contractor_report_sent") {
    return "Shared with contractor for review and next steps.";
  }

  return "";
}

function buildAddressLines(opts: {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  const line1 = [opts.address1, opts.address2]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" ");

  const cityState = [String(opts.city ?? "").trim(), String(opts.state ?? "").trim()]
    .filter(Boolean)
    .join(", ");

  const line2 = [cityState, String(opts.zip ?? "").trim()].filter(Boolean).join(" ");

  return {
    line1: line1 || "",
    line2: line2 || "",
  };
}

export default async function PortalJobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: jobId } = await params;
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const noteErrorRaw = sp.note_error;
  const noteError = Array.isArray(noteErrorRaw) ? noteErrorRaw[0] : noteErrorRaw;

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const { data: cu, error: cuErr } = await supabase
    .from("contractor_users")
    .select("contractor_id, contractors ( id, name )")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (cuErr) throw cuErr;
  if (!cu?.contractor_id) redirect("/ops");

  const contractorName =
    (cu as any)?.contractors?.name ?? (cu?.contractor_id ? "Contractor" : "-");

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select(
      `
      id, title, status, ops_status, city, job_address, location_id,
      customer_id, customer_first_name, customer_last_name, customer_phone,
      created_at, follow_up_date, scheduled_date, window_start, window_end,
      permit_number, jurisdiction, permit_date, pending_info_reason, next_action_note,
      parent_job_id, contractor_id,
      locations:location_id ( address_line1, address_line2, city, state, zip ),
      customers:customer_id ( id, full_name, first_name, last_name, phone )
      `
    )
    .eq("id", jobId)
    .eq("contractor_id", cu.contractor_id)
    .maybeSingle();

  if (jobErr) throw jobErr;
  if (!job) notFound();

  const rootJobId = (job as any)?.parent_job_id ?? jobId;

  const { data: jobChain, error: chainErr } = await supabase
    .from("jobs")
    .select("id, parent_job_id, ops_status")
    .eq("contractor_id", cu.contractor_id)
    .is("deleted_at", null)
    .or(`id.eq.${rootJobId},parent_job_id.eq.${rootJobId}`)
    .order("created_at", { ascending: true })
    .limit(20);

  if (chainErr) throw chainErr;

  const chainJobIds = (jobChain ?? []).map((j: any) => j.id);

  const SAFE_EVENT_TYPES = [
    "job_created",
    "customer_attempt",
    "contractor_note",
    "public_note",
    "contractor_correction_submission",
    "attachment_added",
    "retest_ready_requested",
    "job_failed",
    "job_passed",
    "status_changed",
    "contractor_report_sent",
  ];

  const { data: events, error: evErr } = await supabase
    .from("job_events")
    .select("job_id, created_at, event_type, meta")
    .in("job_id", chainJobIds.length ? chainJobIds : [jobId])
    .in("event_type", SAFE_EVENT_TYPES)
    .order("created_at", { ascending: false })
    .limit(300);

  if (evErr) throw evErr;

  const contractorSafeEvents = (events ?? []).filter((e: any) => {
    const type = String(e?.event_type ?? "");
    const meta = typeof e?.meta === "string" ? null : e?.meta;

    if (type === "attachment_added") {
      return String(meta?.source ?? "").toLowerCase() !== "internal";
    }

    if (type === "status_changed") {
      const to = String(meta?.to ?? "").toLowerCase();
      return ["failed", "retest_needed", "paperwork_required", "closed"].includes(to);
    }

    return true;
  });

  const allowedAttachmentIds = new Set<string>();
  for (const e of contractorSafeEvents) {
    const type = String(e?.event_type ?? "");
    const meta = typeof e?.meta === "string" ? null : e?.meta;

    if (!meta) continue;

    if (["contractor_note", "public_note", "contractor_correction_submission", "attachment_added"].includes(type)) {
      const ids = Array.isArray(meta.attachment_ids) ? meta.attachment_ids : [];
      for (const id of ids) {
        const s = String(id ?? "").trim();
        if (s) allowedAttachmentIds.add(s);
      }
    }
  }

  const raterNotes = contractorSafeEvents
    .filter((e: any) => String(e?.event_type ?? "") === "public_note")
    .map((e: any) => {
      const meta = typeof e.meta === "string" ? null : e.meta;
      return {
        created_at: e.created_at,
        note: String(meta?.note ?? "").trim(),
      };
    })
    .filter((n: any) => n.note);

  const contractorNotes = contractorSafeEvents
    .filter((e: any) =>
      ["contractor_note", "contractor_correction_submission"].includes(String(e?.event_type ?? ""))
    )
    .map((e: any) => {
      const meta = typeof e.meta === "string" ? null : e.meta;
      return {
        created_at: e.created_at,
        event_type: String(e?.event_type ?? ""),
        note: String(meta?.note ?? "").trim(),
      };
    })
    .filter((n: any) => n.note);

  const { data: attachments, error: attErr } = await supabase
    .from("attachments")
    .select("id, bucket, storage_path, file_name, content_type, file_size, caption, created_at")
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (attErr) throw attErr;

  const attachmentItems = await Promise.all(
    (attachments ?? []).map(async (a: any) => {
      const { data } = await supabase.storage
        .from(String(a.bucket))
        .createSignedUrl(String(a.storage_path), 60 * 10);

      return {
        ...a,
        signedUrl: data?.signedUrl ?? null,
      };
    })
  );

  const sharedAttachmentItems = attachmentItems.filter((a: any) =>
    allowedAttachmentIds.has(String(a.id ?? ""))
  );

  const retestReadyRequests = contractorSafeEvents.filter(
    (e: any) => String(e?.event_type ?? "") === "retest_ready_requested"
  );

  const hasRetestReadyRequest = retestReadyRequests.length > 0;

  const openRetestChild =
    (jobChain ?? []).find(
      (j: any) =>
        String(j.parent_job_id ?? "") === String(jobId) &&
        String((j as any).ops_status ?? "").toLowerCase() !== "closed"
    ) ?? null;

  const hasOpenRetestChild = !!openRetestChild;

  const { data: testRuns, error: trErr } = await supabase
    .from("ecc_test_runs")
    .select("id, job_id, created_at, test_type, computed_pass, override_pass, computed, is_completed")
    .in("job_id", chainJobIds.length ? chainJobIds : [jobId])
    .order("created_at", { ascending: false })
    .limit(100);

  if (trErr) throw trErr;

  const latestCompletedRun = (testRuns ?? []).find((r: any) => r.is_completed) ?? null;

  const latestFailedRun =
    (testRuns ?? []).find((r: any) => r.is_completed && finalRunPass(r) === false) ?? null;

  const opsStatus = String((job as any)?.ops_status ?? "").toLowerCase();
  const isPortalFailed = ["failed", "retest_needed"].includes(opsStatus);

  const statusRun = isPortalFailed ? (latestFailedRun ?? latestCompletedRun) : latestCompletedRun;
  const topReasons = statusRun ? extractFailureReasons(statusRun) : [];

  const resolvedIssues = resolveContractorIssues({
    job: {
      id: String((job as any)?.id ?? ""),
      ops_status: (job as any)?.ops_status,
      pending_info_reason: (job as any)?.pending_info_reason,
      next_action_note: (job as any)?.next_action_note,
      action_required_by: (job as any)?.action_required_by,
      scheduled_date: (job as any)?.scheduled_date,
      window_start: (job as any)?.window_start,
      window_end: (job as any)?.window_end,
    },
    failureReasons: topReasons,
    events: contractorSafeEvents,
    chain: {
      hasOpenRetestChild,
      hasRetestReadyRequest,
    },
  });

  const primaryIssue = resolvedIssues.primaryIssue;
  const secondaryIssues = resolvedIssues.secondaryIssues ?? [];

  const loc = Array.isArray((job as any)?.locations)
    ? (job as any).locations.find((location: any) => location) ?? null
    : (job as any)?.locations ?? null;

  const addressDisplay = buildAddressLines({
    address1:
      String(loc?.address_line1 ?? "").trim() || String((job as any)?.job_address ?? "").trim(),
    address2: String(loc?.address_line2 ?? "").trim(),
    city: String(loc?.city ?? "").trim() || String((job as any)?.city ?? "").trim(),
    state: String(loc?.state ?? "").trim(),
    zip: String(loc?.zip ?? "").trim(),
  });

  const customerName =
    String((job as any)?.customers?.full_name ?? "").trim() ||
    [
      String((job as any)?.customers?.first_name ?? "").trim(),
      String((job as any)?.customers?.last_name ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" ") ||
    [String((job as any)?.customer_first_name ?? "").trim(), String((job as any)?.customer_last_name ?? "").trim()]
      .filter(Boolean)
      .join(" ") ||
    "Customer";

  const customerPhone =
    String((job as any)?.customers?.phone ?? "").trim() || String((job as any)?.customer_phone ?? "").trim() || "-";

  const pendingInfoReasonText = String((job as any)?.pending_info_reason ?? "").trim();
  const showPermitField =
    primaryIssue.group === "needs_info" && /permit/i.test(pendingInfoReasonText);

  const latestRaterNote = raterNotes.length > 0 ? raterNotes[0].note : "";

  const latestSentReportEvent = contractorSafeEvents.find(
    (e: any) =>
      String(e?.event_type ?? "") === "contractor_report_sent" &&
      String(e?.job_id ?? "") === String(jobId)
  );

  const latestSentReportMeta =
    latestSentReportEvent && typeof latestSentReportEvent.meta !== "string"
      ? latestSentReportEvent.meta
      : null;

  const timelineEvents = contractorSafeEvents.filter((e: any) => {
    const type = String(e?.event_type ?? "");
    return [
      "job_created",
      "customer_attempt",
      "contractor_note",
      "contractor_correction_submission",
      "attachment_added",
      "retest_ready_requested",
      "job_failed",
      "job_passed",
      "status_changed",
      "contractor_report_sent",
    ].includes(type);
  });

  async function addContractorNote(formData: FormData) {
    "use server";

    const nextJobId = String(formData.get("job_id") || "").trim();
    const note = String(formData.get("note") || "").trim();

    if (!nextJobId) throw new Error("Missing job_id");
    if (!note) {
      redirect(`/portal/jobs/${nextJobId}?note_error=empty_note`);
    }

    const nextSupabase = await createClient();

    const { data: nextUserData, error: userErr } = await nextSupabase.auth.getUser();
    if (userErr) throw userErr;
    if (!nextUserData?.user) redirect("/login");

    // Idempotency guard: if the same actor submits the same note back-to-back,
    // keep only one canonical contractor_note event.
    const { data: recentDuplicate, error: dupErr } = await nextSupabase
      .from("job_events")
      .select("id")
      .eq("job_id", nextJobId)
      .eq("event_type", "contractor_note")
      .eq("user_id", nextUserData.user.id)
      .contains("meta", { note })
      .gte("created_at", new Date(Date.now() - 15_000).toISOString())
      .maybeSingle();

    if (dupErr) throw dupErr;
    if (recentDuplicate?.id) {
      revalidatePath(`/portal/jobs/${nextJobId}`);
      redirect(`/portal/jobs/${nextJobId}`);
    }

    const { error: insErr } = await nextSupabase.from("job_events").insert({
      job_id: nextJobId,
      event_type: "contractor_note",
      user_id: nextUserData.user.id,
      meta: { note },
    });

    if (insErr) throw insErr;

    await insertInternalNotificationForEvent({
      supabase: nextSupabase,
      jobId: nextJobId,
      eventType: "contractor_note",
      actorUserId: nextUserData.user.id,
    });

    revalidatePath(`/portal/jobs/${nextJobId}`);
    redirect(`/portal/jobs/${nextJobId}`);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-gray-900 dark:text-gray-100">
      <section className="rounded-xl border bg-white dark:bg-gray-900 p-5 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-4">
          <Link
            href="/portal"
            className="inline-flex px-3 py-2 rounded-lg border bg-white dark:bg-gray-900 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Back
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-3 md:items-stretch">
          <div className="space-y-2">
            <div className="text-xs text-gray-500 dark:text-gray-300">Contractor Portal - {contractorName}</div>

            <div className="text-2xl font-semibold tracking-tight">{customerName}</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{String((job as any).title ?? "Job")}</div>

            <div className="space-y-0.5">
              {addressDisplay.line1 ? (
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{addressDisplay.line1}</div>
              ) : null}
              {addressDisplay.line2 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">{addressDisplay.line2}</div>
              ) : null}
              {!addressDisplay.line1 && !addressDisplay.line2 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Address not available</div>
              ) : null}
            </div>
          </div>

          <div className="h-full w-full">
            <JobLocationPreview
              addressLine1={String(loc?.address_line1 ?? "").trim() || String((job as any)?.job_address ?? "").trim()}
              addressLine2={String(loc?.address_line2 ?? "").trim()}
              city={String(loc?.city ?? "").trim() || String((job as any)?.city ?? "").trim()}
              state={String(loc?.state ?? "").trim()}
              zip={String(loc?.zip ?? "").trim()}
            />
          </div>
        </div>

        <div className={`grid grid-cols-1 ${showPermitField ? "md:grid-cols-4" : "md:grid-cols-3"} gap-3 text-sm`}>
          <div className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3 h-full">
            <div className="text-xs text-gray-500 dark:text-gray-300">Customer Phone</div>
            <div className="mt-1 font-medium">{customerPhone}</div>
          </div>

          <div className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3 h-full">
            <div className="text-xs text-gray-500 dark:text-gray-300">Current Status</div>
            <div className="mt-1 font-medium">{titleCaseFromSnake((job as any).status)} / {titleCaseFromSnake((job as any).ops_status)}</div>
          </div>

          <div className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3 h-full">
            <div className="text-xs text-gray-500 dark:text-gray-300">Service Date</div>
            <div className="mt-1 font-medium">
              {(job as any).scheduled_date ? formatBusinessDateUS(String((job as any).scheduled_date)) : "Not scheduled"}
              {(job as any).window_start && (job as any).window_end
                ? ` • ${formatTimeLocal((job as any).window_start)}-${formatTimeLocal((job as any).window_end)}`
                : ""}
            </div>
          </div>

          {showPermitField ? (
            <div className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3 h-full">
              <div className="text-xs text-gray-500 dark:text-gray-300">Permit #</div>
              <div className="mt-1 font-medium">{String((job as any).permit_number ?? "").trim() || "-"}</div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border bg-white dark:bg-gray-900 p-5 shadow-sm space-y-3">
        <div className="text-sm font-semibold">Status</div>
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-300">
          {primaryIssue.group === "needs_info"
            ? "Need information from you"
            : primaryIssue.group === "failed"
            ? "Failed"
            : primaryIssue.group === "in_progress"
            ? "In progress"
            : "Passed"}
        </div>
        <div className="text-lg font-semibold">{primaryIssue.headline}</div>
        {primaryIssue.explanation ? (
          <div className="text-sm text-gray-700 dark:text-gray-200">{primaryIssue.explanation}</div>
        ) : null}

        {(primaryIssue.detailLines ?? []).slice(0, 4).length > 0 ? (
          <div className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
            {(primaryIssue.detailLines ?? []).slice(0, 4).map((reason, idx) => (
              <div key={`${reason}-${idx}`}>Failed - {reason}</div>
            ))}
          </div>
        ) : null}

        {latestRaterNote ? (
          <div className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-300">Rater / Inspector Note</div>
            <div className="mt-1 text-sm whitespace-pre-wrap">{latestRaterNote}</div>
          </div>
        ) : null}
      </section>

      {latestSentReportMeta ? (
        <section className="rounded-xl border bg-white dark:bg-gray-900 p-5 shadow-sm space-y-3">
          <div className="text-sm font-semibold">Latest Contractor Report</div>

          <div className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3 text-sm space-y-1">
            <div><span className="font-medium">Type:</span> {String(latestSentReportMeta.report_kind ?? "").trim() === "pending_info" ? "INFORMATION NEEDED" : "FAILED TEST"}</div>
            <div><span className="font-medium">Customer:</span> {String(latestSentReportMeta.customer_name ?? "-")}</div>
            <div><span className="font-medium">Location:</span> {String(latestSentReportMeta.location_text ?? "-")}</div>
            <div><span className="font-medium">Contractor:</span> {String(latestSentReportMeta.contractor_name ?? "").trim() || "Not assigned"}</div>
            <div><span className="font-medium">Service/Test Date:</span> {String(latestSentReportMeta.service_date_text ?? "-")}</div>

            <div className="pt-1">
              <div className="font-medium">Reasons</div>
              <ul className="list-disc pl-5">
                {(Array.isArray(latestSentReportMeta.reasons) ? latestSentReportMeta.reasons : []).map(
                  (reason: any, idx: number) => (
                    <li key={`${String(reason)}-${idx}`}>{String(reason)}</li>
                  )
                )}
              </ul>
            </div>

            {String(latestSentReportMeta.contractor_note ?? "").trim() ? (
              <div className="pt-1">
                <div className="font-medium">Contractor Note</div>
                <div className="whitespace-pre-wrap">{String(latestSentReportMeta.contractor_note)}</div>
              </div>
            ) : null}

            <div className="pt-1"><span className="font-medium">Next Step:</span> {String(latestSentReportMeta.next_step ?? "-")}</div>
            {false && <div>{latestSentReportMeta.body_text}</div>}
          </div>
        </section>
      ) : null}

      {secondaryIssues.length > 0 ? (
        <section className="rounded-xl border bg-white dark:bg-gray-900 p-5 shadow-sm space-y-3">
          <div className="text-sm font-semibold">Additional Blockers</div>
          <div className="space-y-2">
            {secondaryIssues.map((issue, idx) => (
              <div key={`${issue.group}-${idx}`} className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3">
                <div className="text-sm font-medium">{issue.headline}</div>
                {issue.explanation ? (
                  <div className="mt-1 text-sm text-gray-700 dark:text-gray-200">{issue.explanation}</div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border bg-white dark:bg-gray-900 p-5 shadow-sm space-y-4">
        <div className="text-sm font-semibold">Contractor Actions</div>

        {isPortalFailed && !hasOpenRetestChild ? (
          <div className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3 space-y-2">
            <div className="text-sm font-medium">Retest readiness</div>
            {hasRetestReadyRequest ? (
              <div className="text-sm text-emerald-700 dark:text-emerald-300">
                Retest Ready has already been submitted.
              </div>
            ) : (
              <form action={requestRetestReadyFromPortal}>
                <input type="hidden" name="job_id" value={jobId} />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg border bg-gray-900 text-white text-sm font-medium hover:opacity-90 transition"
                >
                  Retest Ready
                </button>
              </form>
            )}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-sm font-medium">Add contractor note</div>
          {noteError === "empty_note" ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Please enter a note before sending.
            </div>
          ) : null}
          <form action={addContractorNote} className="space-y-3">
            <input type="hidden" name="job_id" value={jobId} />
            <textarea
              name="note"
              rows={3}
              placeholder="Type your note here..."
              className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-900"
            />
            <SubmitButton className="px-4 py-2 rounded-lg border bg-gray-900 text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed">
              Save Note
            </SubmitButton>
          </form>
        </div>
      </section>

      <section className="rounded-xl border bg-white dark:bg-gray-900 p-5 shadow-sm space-y-4">
        <div className="text-sm font-semibold">Notes</div>

        <div className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3">
          <div className="text-sm font-medium">Rater / Inspector Notes</div>
          {raterNotes.length === 0 ? (
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">No notes yet.</div>
          ) : (
            <div className="mt-2 space-y-2">
              {raterNotes.map((n: any, idx: number) => (
                <div key={`rater-${idx}`} className="rounded-md border bg-white dark:bg-gray-900 p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-300">
                    {n.created_at ? formatDateLA(String(n.created_at)) : "-"}
                  </div>
                  <div className="mt-1 text-sm whitespace-pre-wrap">{n.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3">
          <div className="text-sm font-medium">Contractor Notes</div>
          {contractorNotes.length === 0 ? (
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">No notes yet.</div>
          ) : (
            <div className="mt-2 space-y-2">
              {contractorNotes.map((n: any, idx: number) => (
                <div key={`contractor-${idx}`} className="rounded-md border bg-white dark:bg-gray-900 p-3">
                  <div className="text-xs text-gray-500 dark:text-gray-300">
                    {n.event_type === "contractor_correction_submission"
                      ? "Correction submission"
                      : "Contractor note"}
                    {" • "}
                    {n.created_at ? formatDateLA(String(n.created_at)) : "-"}
                  </div>
                  <div className="mt-1 text-sm whitespace-pre-wrap">{n.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="text-sm font-semibold">Shared Files</div>
        <JobAttachments jobId={jobId} initialItems={sharedAttachmentItems} />
      </section>

      <section className="rounded-xl border bg-white dark:bg-gray-900 p-5 shadow-sm space-y-3">
        <div className="text-sm font-semibold">Timeline</div>

        {timelineEvents.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-300">No timeline events yet.</div>
        ) : (
          <div className="space-y-2">
            {timelineEvents.map((e: any, idx: number) => {
              const type = String(e?.event_type ?? "");
              const meta = typeof e.meta === "string" ? null : e.meta;

              const label =
                formatPortalTimelineLabel(type, meta);
              const detail = formatPortalTimelineDetail(type, meta);

              return (
                <div key={`${String(e.created_at)}-${idx}`} className="rounded-lg border bg-gray-50 dark:bg-gray-800/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-300">
                      {e.created_at ? formatDateTimeLA(String(e.created_at)) : "-"}
                    </div>
                  </div>

                  <div className="mt-2 text-sm font-medium">{label}</div>

                  {detail ? (
                    <div className="mt-1 text-sm text-gray-700 dark:text-gray-200">{detail}</div>
                  ) : null}

                  {type === "customer_attempt" ? (
                    <div className="text-xs text-gray-500 dark:text-gray-300">
                      Operational contact history recorded for this job.
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="rounded-xl border bg-white dark:bg-gray-900 p-4 text-sm text-gray-700 dark:text-gray-200 shadow-sm">
        If you need help, contact Compliance Matters: <b className="whitespace-nowrap">(209) 518-2383</b>
      </div>
    </div>
  );
}
