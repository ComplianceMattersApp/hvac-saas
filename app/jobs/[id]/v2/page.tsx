// app/jobs/[id]/v2/page — Desktop Job Detail V2
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  resolveJobDetailActor,
  loadScopedInternalJobDetailReadBoundaryOutcome,
} from "@/lib/actions/internal-job-detail-read-boundary";
import {
  advanceJobStatusFromForm,
  getContractors,
  createNextServiceVisitFromForm,
  createCallbackVisitFromForm,
  updateJobScheduleFromForm,
  addInternalNoteFromForm,
  addPublicNoteFromForm,
  updateJobVisitScopeFromForm,
  changeJobServiceLocationFromForm,
} from "@/lib/actions/job-actions";
import {
  markJobFieldCompleteFromForm,
  markJobPartsNeededFromForm,
  markJobApprovalNeededFromForm,
  markJobUnableToCompleteFromForm,
  markServicePartOrderedFromForm,
  markServicePartArrivedFromForm,
  markServiceApprovalReceivedFromForm,
  markEccPermitAvailableFromForm,
  markCertsCompleteFromForm,
  markInvoiceCompleteFromForm,
} from "@/lib/actions/job-ops-actions";
import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";
import { getActiveJobAssignmentDisplayMap } from "@/lib/staffing/human-layer";
import DeferredAddAssigneeForm from "../_components/DeferredAddAssigneeForm";
import ChangeServiceLocationForm from "../_components/ChangeServiceLocationForm";
import { getCloseoutNeeds } from "@/lib/utils/closeout";
import { getActiveWaitingState } from "@/lib/utils/ops-status";
import { sanitizeVisitScopeItems } from "@/lib/jobs/visit-scope";
import { formatJobDisplayReference } from "@/lib/utils/display-references";
import { formatPersonNamePart } from "@/lib/utils/identity-display";
import { isValidEccPermitNumber } from "@/lib/ecc/permit-needed";
import DeferredTimelineBody from "../_components/DeferredTimelineBody";
import DeferredInternalNotesBody from "../_components/DeferredInternalNotesBody";
import DeferredSharedNotesBody from "../_components/DeferredSharedNotesBody";
import DeferredServiceChainPanelBody from "../_components/DeferredServiceChainPanelBody";
import DeferredJobAttachmentsInternal from "../_components/DeferredJobAttachmentsInternal";
import JobLocationPreview, { buildAddressDisplay } from "@/components/jobs/JobLocationPreview";
import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";

import ScrollSpyNav, { type NavItem } from "./_components/ScrollSpyNav";
import AlertBanner from "./_components/AlertBanner";
import FinishOutcomeCards from "./_components/FinishOutcomeCards";
import RecordsTabs, { type RecordTab } from "./_components/RecordsTabs";
import SchedulePanel from "./_components/SchedulePanel";
import NoteComposer from "./_components/NoteComposer";

// ─── types ────────────────────────────────────────────────────────────────────

type SearchParams = Record<string, string | string[] | undefined>;

// ─── design tokens (verbatim from spec) ───────────────────────────────────────

const S = {
  mono: "var(--font-ibm-plex-mono), monospace",
  sectionLabel: {
    fontFamily: "var(--font-ibm-plex-mono), monospace",
    fontSize: "11px",
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "oklch(0.55 0.015 262)",
    fontWeight: 600,
  },
  fieldLabel: {
    fontFamily: "var(--font-ibm-plex-mono), monospace",
    fontSize: "10px",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "oklch(0.62 0.015 262)",
    fontWeight: 600,
    marginBottom: "7px",
  },
  fieldValue: {
    fontSize: "14.5px",
    lineHeight: 1.55,
    color: "oklch(0.33 0.02 262)",
  },
  hairline: { borderTop: "1px solid oklch(0.93 0.005 250)" },
  rowRule: { borderBottom: "1px solid oklch(0.96 0.004 250)" },
  section: { padding: "30px 0", borderTop: "1px solid oklch(0.93 0.005 250)", scrollMarginTop: "20px" },
  primaryBtn: {
    height: "42px",
    borderRadius: "10px",
    border: "none",
    background: "oklch(0.55 0.17 255)",
    color: "#fff",
    fontSize: "13.5px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 1px 2px rgba(40,80,180,0.25)",
    width: "100%",
    display: "block",
  },
  outlineBtn: (active = false) => ({
    height: "38px",
    padding: "0 16px",
    borderRadius: "9px",
    border: `1px solid ${active ? "oklch(0.85 0.04 255)" : "oklch(0.9 0.006 250)"}`,
    background: active ? "oklch(0.97 0.02 255)" : "#fff",
    color: active ? "oklch(0.45 0.14 255)" : "oklch(0.32 0.02 262)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  }),
  contactBtn: {
    height: "36px",
    padding: "0 18px",
    borderRadius: "9px",
    border: "1px solid oklch(0.9 0.006 250)",
    background: "oklch(0.98 0.003 250)",
    fontSize: "12.5px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    color: "oklch(0.32 0.02 262)",
  },
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function param(sp: SearchParams, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v.trim() : "";
}

type StatusPill = {
  label: string;
  bg: string;
  fg: string;
  dot: string;
};

function deriveStatusPill(
  status: string,
  opsStatus: string,
): StatusPill {
  if (status === "cancelled")
    return { label: "CANCELLED", bg: "oklch(0.96 0.004 250)", fg: "oklch(0.55 0.015 262)", dot: "oklch(0.7 0.02 262)" };
  if (status === "on_the_way")
    return { label: "ON THE WAY", bg: "oklch(0.96 0.025 255)", fg: "oklch(0.5 0.13 255)", dot: "oklch(0.55 0.17 255)" };
  if (status === "in_process")
    return { label: "IN PROGRESS · ON SITE", bg: "oklch(0.96 0.025 255)", fg: "oklch(0.5 0.13 255)", dot: "oklch(0.55 0.17 255)" };
  if (opsStatus === "need_to_schedule" || (!status || status === "open"))
    return { label: "NEEDS SCHEDULE", bg: "oklch(0.96 0.05 75)", fg: "oklch(0.5 0.12 65)", dot: "oklch(0.72 0.15 70)" };
  if (opsStatus === "scheduled")
    return { label: "SCHEDULED", bg: "oklch(0.96 0.025 255)", fg: "oklch(0.5 0.13 255)", dot: "oklch(0.55 0.17 255)" };
  if (opsStatus === "pending_info")
    return { label: "PENDING INFO", bg: "oklch(0.96 0.05 75)", fg: "oklch(0.5 0.12 65)", dot: "oklch(0.72 0.15 70)" };
  if (opsStatus === "on_hold")
    return { label: "ON HOLD", bg: "oklch(0.96 0.05 75)", fg: "oklch(0.5 0.12 65)", dot: "oklch(0.72 0.15 70)" };
  if (opsStatus === "failed" || status === "failed")
    return { label: "FAILED", bg: "oklch(0.96 0.04 25)", fg: "oklch(0.5 0.12 25)", dot: "oklch(0.58 0.18 25)" };
  if (opsStatus === "retest_needed")
    return { label: "RETEST NEEDED", bg: "oklch(0.96 0.05 75)", fg: "oklch(0.5 0.12 65)", dot: "oklch(0.72 0.15 70)" };
  if (opsStatus === "invoice_required")
    return { label: "INVOICE REQUIRED", bg: "oklch(0.96 0.05 75)", fg: "oklch(0.5 0.12 65)", dot: "oklch(0.72 0.15 70)" };
  if (opsStatus === "paperwork_required")
    return { label: "PAPERWORK REQUIRED", bg: "oklch(0.96 0.05 75)", fg: "oklch(0.5 0.12 65)", dot: "oklch(0.72 0.15 70)" };
  if (opsStatus === "closed" || status === "completed")
    return { label: "CLOSED", bg: "oklch(0.95 0.04 150)", fg: "oklch(0.45 0.13 150)", dot: "oklch(0.58 0.13 150)" };
  return { label: "IN PROGRESS", bg: "oklch(0.96 0.025 255)", fg: "oklch(0.5 0.13 255)", dot: "oklch(0.55 0.17 255)" };
}

type FieldStepState = "done" | "now" | "todo";

function deriveFieldSteps(status: string): [FieldStepState, FieldStepState, FieldStepState] {
  if (status === "in_process") return ["done", "done", "now"];
  if (status === "on_the_way") return ["now", "todo", "todo"];
  return ["now", "todo", "todo"];
}

function deriveBlockers(job: {
  status: string;
  ops_status: string;
  scheduled_date: string | null;
  window_start: string | null;
  field_complete: boolean | null;
  certs_complete: boolean | null;
  invoice_complete: boolean | null;
  job_type: string;
  permit_number: string | null;
  ecc_test_runs: Array<{ is_completed: boolean | null }>;
}): string[] {
  const blockers: string[] = [];
  const isScheduled = Boolean(job.scheduled_date || job.window_start);
  const fieldComplete = Boolean(job.field_complete);

  if (!fieldComplete && !isScheduled) blockers.push("Not scheduled");
  if (!fieldComplete && isScheduled && job.status !== "on_the_way" && job.status !== "in_process")
    blockers.push("Visit not started");

  const isEcc = job.job_type === "ecc";
  if (isEcc && !isValidEccPermitNumber(job.permit_number)) blockers.push("No permit number");

  if (isEcc) {
    const completedRuns = job.ecc_test_runs.filter((r) => r.is_completed).length;
    if (completedRuns === 0) blockers.push("0 tests complete");
  }

  if (!Boolean(job.invoice_complete)) blockers.push("Invoice not resolved");

  return blockers;
}

function formatVisitScopeTotal(items: ReturnType<typeof sanitizeVisitScopeItems>): string {
  const total = items.reduce((sum, item) => sum + (item.expected_unit_price ?? 0), 0);
  if (total === 0) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(total);
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── Supabase select ───────────────────────────────────────────────────────────

const JOB_V2_SELECT = `
  id, title, city, job_address, status, ops_status,
  job_type, service_visit_type, service_visit_reason, service_visit_outcome,
  visit_scope_summary, visit_scope_items,
  customer_id, location_id, service_case_id, parent_job_id,
  contractor_id,
  job_display_number,
  customer_first_name, customer_last_name, customer_email, customer_phone,
  scheduled_date, window_start, window_end, on_the_way_at,
  field_complete, certs_complete, invoice_complete,
  ops_status, pending_info_reason, on_hold_reason,
  permit_number, jurisdiction, permit_date,
  billing_recipient, billing_name, billing_email,
  billing_recipient, billing_name,
  job_notes,
  created_at, deleted_at,
  locations:location_id (
    id, nickname, label, address_line1, address_line2, city, state, zip
  ),
  ecc_test_runs (
    id, test_type, is_completed, computed_pass, override_pass, created_at
  )
`;

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function JobDetailV2Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id: jobId } = await params;
  const sp = (await searchParams) ?? {};
  const bannerMessage = param(sp, "banner");

  // ── auth ──────────────────────────────────────────────────────────────────

  let supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const actorResolution = await resolveJobDetailActor({ supabase, userId: user.id });
  if (actorResolution.kind === "contractor") redirect(`/portal/jobs/${jobId}`);
  if (actorResolution.kind === "unauthorized") redirect("/login");

  const internalUser = actorResolution.internalUser;
  const accountOwnerUserId = internalUser.account_owner_user_id;
  const internalRole = String(internalUser.role ?? "").toLowerCase();
  const isAdmin = internalRole === "admin";

  // check for dual-role contractor shadow membership
  const { data: shadowMembership } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const hasShadowMembership = Boolean(shadowMembership?.contractor_id);

  // same-account boundary check
  const scopedOutcome = await loadScopedInternalJobDetailReadBoundaryOutcome({
    accountOwnerUserId,
    jobId,
  });
  if (scopedOutcome.status !== "ok") return notFound();

  if (hasShadowMembership) supabase = createAdminClient();

  // ── main job query ─────────────────────────────────────────────────────────

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(JOB_V2_SELECT)
    .eq("id", jobId)
    .single();

  if (jobError) throw jobError;
  if (!job) return notFound();
  if (job.deleted_at) redirect("/ops?saved=job_archived");

  // ── supplemental queries ──────────────────────────────────────────────────

  const [assignmentMap, contractorRows, { data: customerLocationsRaw }] = await Promise.all([
    getActiveJobAssignmentDisplayMap({ jobIds: [jobId], supabase }),
    job.contractor_id
      ? getContractors(accountOwnerUserId)
      : Promise.resolve([] as Array<{ id: string; business_name: string | null; display_name: string | null }>),
    job.customer_id
      ? supabase
          .from("locations")
          .select("id, address_line1, city, state, zip, postal_code")
          .eq("customer_id", job.customer_id)
          .eq("owner_user_id", accountOwnerUserId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const customerLocations: Array<{ id: string; label: string }> = (customerLocationsRaw ?? []).map(
    (loc: any) => ({
      id: String(loc.id),
      label: [loc.address_line1, loc.city, loc.state, loc.zip ?? loc.postal_code]
        .map((v: any) => String(v ?? "").trim())
        .filter(Boolean)
        .join(", ") || "Unknown address",
    }),
  );

  const assignedTeam = assignmentMap[jobId] ?? [];
  const contractor = job.contractor_id
    ? (contractorRows as Array<{ id: string; business_name?: string | null; display_name?: string | null }>).find(
        (c) => c.id === job.contractor_id,
      )
    : null;
  const contractorName = contractor
    ? String(contractor.business_name ?? contractor.display_name ?? "").trim() || null
    : null;

  // ── derived display values ────────────────────────────────────────────────

  const status = String(job.status ?? "").toLowerCase();
  const opsStatus = String(job.ops_status ?? "").toLowerCase();
  const jobType = String(job.job_type ?? "").toLowerCase();
  const isEccJob = jobType === "ecc";
  const fieldComplete = Boolean(job.field_complete);
  const certsComplete = Boolean(job.certs_complete);
  const invoiceComplete = Boolean(job.invoice_complete);

  const isFieldActive = status === "in_process";
  const isEnRoute = status === "on_the_way";
  const visitStarted = isFieldActive || isEnRoute;

  const statusPill = deriveStatusPill(status, opsStatus);
  const fieldSteps = deriveFieldSteps(status);

  const visitScopeItems = sanitizeVisitScopeItems(job.visit_scope_items);
  const invoiceTotal = formatVisitScopeTotal(visitScopeItems);

  type LocationRow = {
    id: string; nickname: string | null; label: string | null;
    address_line1: string | null; address_line2: string | null;
    city: string | null; state: string | null; zip: string | null;
  };
  const rawLoc = (job as any).locations;
  const location: LocationRow | null = Array.isArray(rawLoc)
    ? (rawLoc.find((l: unknown) => l) ?? null)
    : (rawLoc ?? null);

  const addressDisplay = location
    ? buildAddressDisplay({
        addressLine1: location.address_line1,
        addressLine2: location.address_line2,
        city: location.city,
        state: location.state,
        zip: location.zip,
      })
    : String(job.job_address ?? job.city ?? "").trim();

  const customerFullName = [
    formatPersonNamePart(job.customer_first_name),
    formatPersonNamePart(job.customer_last_name),
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || "Customer";

  const jobDisplayRef = formatJobDisplayReference(job.job_display_number ?? "");

  // closeout blockers
  const blockers = deriveBlockers({
    status,
    ops_status: opsStatus,
    scheduled_date: job.scheduled_date,
    window_start: job.window_start,
    field_complete: job.field_complete,
    certs_complete: job.certs_complete,
    invoice_complete: job.invoice_complete,
    job_type: jobType,
    permit_number: job.permit_number,
    ecc_test_runs: (job.ecc_test_runs ?? []) as Array<{ is_completed: boolean | null }>,
  });

  // waiting state
  const waitingState = getActiveWaitingState({
    ops_status: opsStatus,
    pending_info_reason: job.pending_info_reason,
    on_hold_reason: job.on_hold_reason,
  });

  // service chain IDs for deferred components
  const serviceCaseId = job.service_case_id as string | null;
  const parentJobId = job.parent_job_id as string | null;
  const timelineJobIds = [jobId, parentJobId].filter(Boolean) as string[];
  const hasDirectNarrativeChain = Boolean(parentJobId);

  // brief fields
  const briefFields: Array<{ label: string; value: string }> = [
    {
      label: "Visit Reason",
      value: String(job.service_visit_reason ?? job.title ?? "").trim() || "—",
    },
    {
      label: "Customer Concern",
      value: String(job.service_visit_outcome ?? "").trim() || "Not yet captured.",
    },
    {
      label: "Service Details",
      value: String(job.service_visit_type ?? "").trim() || "—",
    },
    {
      label: "Work Summary",
      value: visitStarted
        ? String(job.visit_scope_summary ?? "").trim() || "On site — work in progress."
        : String(job.visit_scope_summary ?? "").trim() || "Pending field visit — no work items captured yet.",
    },
  ];

  // ECC test run counts
  const eccRuns = (job.ecc_test_runs ?? []) as Array<{ is_completed: boolean | null }>;
  const completedEccRuns = eccRuns.filter((r) => r.is_completed).length;

  // return URL for actions
  const returnTo = `/jobs/${jobId}/v2`;

  // server actions (all read job_id / return_to from formData hidden inputs)
  const advanceStatusAction = advanceJobStatusFromForm;
  const createReturnVisitAction = createNextServiceVisitFromForm;
  const createCallbackAction = createCallbackVisitFromForm;

  // nav items
  const navItems: NavItem[] = [
    { id: "brief", label: "Job Brief" },
    { id: "people", label: "People & Place" },
    { id: "notes", label: "Job Memory" },
    { id: "field", label: "Field & Finish" },
    { id: "billing", label: "Work & Billing" },
    { id: "followup", label: "Follow-Up & Chain" },
    ...(isEccJob ? [{ id: "compliance", label: "Compliance" }] : []),
    { id: "records", label: "Records" },
  ];

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        maxWidth: "1300px",
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 290px",
        gap: "32px",
        alignItems: "start",
        color: "oklch(0.27 0.02 262)",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* ── LEFT: continuous sheet ─────────────────────────────────────────── */}
      <div
        style={{
          background: "#fff",
          border: "1px solid oklch(0.91 0.006 250)",
          borderRadius: "16px",
          margin: "0 0 64px",
          padding: "0 40px",
        }}
      >
        {/* alert / feedback strip */}
        {bannerMessage ? <AlertBanner message={bannerMessage} /> : null}

        {/* header band */}
        <div style={{ padding: "32px 0 28px" }}>
          <div
            style={{
              fontFamily: S.mono,
              fontSize: "11px",
              letterSpacing: "0.06em",
              fontWeight: 600,
              color: "oklch(0.55 0.015 262)",
              marginBottom: "9px",
            }}
          >
            <Link href="/ops" style={{ color: "oklch(0.55 0.17 255)", textDecoration: "none" }}>
              Ops
            </Link>
            {" "}/ Jobs / <span style={{ color: "oklch(0.4 0.02 262)" }}>{jobDisplayRef}</span>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "28px",
              fontWeight: 700,
              letterSpacing: "-0.015em",
              color: "oklch(0.27 0.02 262)",
            }}
          >
            {job.title}
          </h1>
        </div>

        {/* ── JOB BRIEF ─────────────────────────────────────────────────────── */}
        <section
          id="brief"
          data-jobsection="brief"
          style={S.section}
        >
          <div style={{ ...S.sectionLabel, marginBottom: "20px" }}>Job Brief</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "24px 48px",
            }}
          >
            {briefFields.map((f) => (
              <div key={f.label}>
                <div style={S.fieldLabel}>{f.label}</div>
                <div style={S.fieldValue}>{f.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── PEOPLE & PLACE ────────────────────────────────────────────────── */}
        <section
          id="people"
          data-jobsection="people"
          style={S.section}
        >
          <div style={{ ...S.sectionLabel, marginBottom: "20px" }}>People &amp; Place</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "40px" }}>

            {/* left: customer + team */}
            <div>
              <div style={{ fontSize: "19px", fontWeight: 700 }}>{customerFullName}</div>
              <div
                style={{
                  fontFamily: S.mono,
                  fontSize: "12.5px",
                  color: "oklch(0.55 0.015 262)",
                  marginTop: "4px",
                }}
              >
                {[job.customer_phone, job.customer_email].filter(Boolean).join(" · ") || "No contact info"}
              </div>

              {/* direct contact buttons */}
              <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
                {job.customer_phone ? (
                  <a
                    href={`tel:${job.customer_phone}`}
                    style={{ ...S.contactBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Call
                  </a>
                ) : null}
                {job.customer_phone ? (
                  <a
                    href={`sms:${job.customer_phone}`}
                    style={{ ...S.contactBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Text
                  </a>
                ) : null}
                {job.customer_email ? (
                  <a
                    href={`mailto:${job.customer_email}`}
                    style={{ ...S.contactBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Email
                  </a>
                ) : null}
              </div>

              {/* contact logging row */}
              <div
                style={{
                  marginTop: "16px",
                  paddingTop: "16px",
                  ...S.hairline,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: S.mono,
                    fontSize: "10px",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "oklch(0.62 0.015 262)",
                    fontWeight: 600,
                  }}
                >
                  Contact Logging
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {(["No Answer", "Sent Text", "Reached"] as const).map((label) => {
                    const resultMap = {
                      "No Answer": "no_answer",
                      "Sent Text": "sent_text",
                      Reached: "reached",
                    } as const;
                    return (
                      <form key={label} action={logCustomerContactAttemptFromForm}>
                        <input type="hidden" name="job_id" value={jobId} />
                        <input type="hidden" name="method" value="call" />
                        <input type="hidden" name="result" value={resultMap[label]} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <input type="hidden" name="success_banner" value="contact_attempt_logged" />
                        <ImmediateSubmitButton
                          pendingText="…"
                          className=""
                          style={{
                            height: "32px",
                            padding: "0 12px",
                            borderRadius: "8px",
                            border: "1px solid oklch(0.9 0.006 250)",
                            background: "#fff",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            color: "oklch(0.4 0.02 262)",
                          } as React.CSSProperties}
                        >
                          {label}
                        </ImmediateSubmitButton>
                      </form>
                    );
                  })}
                </div>
              </div>

              {/* contractor / billing */}
              {contractorName ? (
                <div
                  style={{ marginTop: "16px", paddingTop: "16px", ...S.hairline }}
                >
                  <div style={S.fieldLabel}>Contractor / Billing</div>
                  <div style={{ fontSize: "14px", fontWeight: 600 }}>{contractorName}</div>
                </div>
              ) : null}

              {/* assigned team */}
              <div style={{ marginTop: "22px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "10px",
                  }}
                >
                  <div style={S.fieldLabel}>Assigned team</div>
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  {assignedTeam.map((member) => (
                    <div
                      key={member.user_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "9px",
                        padding: "7px 12px 7px 8px",
                        borderRadius: "30px",
                        background: "oklch(0.985 0.003 250)",
                        border: "1px solid oklch(0.93 0.005 250)",
                      }}
                    >
                      <span
                        style={{
                          width: "26px",
                          height: "26px",
                          borderRadius: "50%",
                          background: "oklch(0.95 0.02 255)",
                          color: "oklch(0.45 0.12 255)",
                          fontSize: "11px",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(member.display_name)}
                      </span>
                      <span style={{ fontSize: "13px", fontWeight: 600 }}>
                        {formatPersonNamePart(member.display_name)}
                      </span>
                      {member.is_primary ? (
                        <span
                          style={{
                            fontFamily: S.mono,
                            fontSize: "9px",
                            fontWeight: 600,
                            color: "oklch(0.55 0.14 150)",
                            letterSpacing: "0.04em",
                          }}
                        >
                          PRIMARY
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              <Suspense fallback={null}>
                <DeferredAddAssigneeForm
                  jobId={jobId}
                  tab="info"
                  assignedTeam={assignedTeam}
                  returnTo={returnTo}
                />
              </Suspense>
              </div>
            </div>

            {/* right: map + address */}
            <div>
              {location ? (
                <Suspense
                  fallback={
                    <div
                      style={{
                        height: "172px",
                        borderRadius: "12px",
                        background: "oklch(0.95 0.004 250)",
                      }}
                    />
                  }
                >
                  <JobLocationPreview
                    addressLine1={location.address_line1}
                    addressLine2={location.address_line2}
                    city={location.city}
                    state={location.state}
                    zip={location.zip}
                    showAddressOverlay
                    showAddressFooter={false}
                  />
                </Suspense>
              ) : (
                <div
                  style={{
                    height: "172px",
                    borderRadius: "12px",
                    overflow: "hidden",
                    background:
                      "repeating-linear-gradient(135deg, oklch(0.93 0.01 250) 0 14px, oklch(0.95 0.008 250) 14px 28px)",
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "10px",
                      left: "10px",
                      fontFamily: S.mono,
                      fontSize: "9.5px",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                      color: "oklch(0.5 0.02 262)",
                      background: "rgba(255,255,255,0.85)",
                      padding: "4px 8px",
                      borderRadius: "6px",
                    }}
                  >
                    No location linked
                  </span>
                </div>
              )}
              {addressDisplay ? (
                <div style={{ marginTop: "12px" }}>
                  <div style={{ display: "flex", gap: "14px" }}>
                    {addressDisplay ? (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressDisplay)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: "12.5px",
                          fontWeight: 600,
                          color: "oklch(0.5 0.13 255)",
                          textDecoration: "none",
                        }}
                      >
                        Navigate
                      </a>
                    ) : null}
                    {addressDisplay ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressDisplay)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: "12.5px",
                          fontWeight: 600,
                          color: "oklch(0.5 0.13 255)",
                          textDecoration: "none",
                        }}
                      >
                        Open in Maps
                      </a>
                    ) : null}
                  </div>
                  {customerLocations.length > 1 && (
                    <div style={{ marginTop: "10px" }}>
                      <ChangeServiceLocationForm
                        action={changeJobServiceLocationFromForm}
                        currentLocationId={location?.id ?? ""}
                        jobId={jobId}
                        locations={customerLocations}
                        returnTo={returnTo}
                      />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── JOB MEMORY (notes hub) ────────────────────────────────────────── */}
        <section
          id="notes"
          data-jobsection="notes"
          style={S.section}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "18px",
            }}
          >
            <div style={S.sectionLabel}>Job Memory</div>
            <a
              href="#records"
              style={{
                fontSize: "12.5px",
                fontWeight: 600,
                color: "oklch(0.5 0.13 255)",
                textDecoration: "none",
              }}
            >
              View full timeline →
            </a>
          </div>

          {/* note composer */}
          <div style={{ marginBottom: "18px" }}>
            <NoteComposer
              jobId={jobId}
              returnTo={returnTo}
              internalAction={addInternalNoteFromForm}
              publicAction={addPublicNoteFromForm}
            />
          </div>

          {/* notes feed — deferred */}
          <Suspense
            fallback={
              <div
                style={{
                  padding: "20px 0",
                  fontSize: "13px",
                  color: "oklch(0.62 0.015 262)",
                }}
              >
                Loading notes…
              </div>
            }
          >
            <DeferredInternalNotesBody
              jobId={jobId}
              timelineJobIds={timelineJobIds}
              hasDirectNarrativeChain={hasDirectNarrativeChain}
              emptyStateClassName="text-sm text-slate-500"
            />
          </Suspense>
        </section>

        {/* ── FIELD & FINISH ────────────────────────────────────────────────── */}
        <section
          id="field"
          data-jobsection="field"
          style={S.section}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}
          >
            <div style={S.sectionLabel}>Field &amp; Finish</div>
            <span
              style={{
                fontFamily: S.mono,
                fontSize: "9.5px",
                letterSpacing: "0.06em",
                fontWeight: 600,
                color: "oklch(0.5 0.13 255)",
                background: "oklch(0.96 0.025 255)",
                padding: "3px 8px",
                borderRadius: "6px",
              }}
            >
              EVERYSTEP
            </span>
          </div>
          <div style={{ fontSize: "13px", color: "oklch(0.5 0.015 262)", marginBottom: "18px" }}>
            {visitStarted
              ? "Tech is on site. When the work is done, submit an outcome below — it routes the job from here."
              : "This visit hasn't started yet. Field status moves through these steps — the finish outcomes open at the end."}
          </div>

          {/* status track: 3 cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: "10px",
              marginBottom: "20px",
            }}
          >
            {(
              [
                { title: "On the Way", detail: isEnRoute ? "En route to the site" : visitStarted ? "Tech departed for the site" : "Tech heads out once scheduled" },
                { title: "On Site & Working", detail: isFieldActive ? "Notes, photos, work items captured" : "Capture notes, photos, work items" },
                { title: "Finish & Report", detail: "Submit an EveryStep outcome" },
              ] as const
            ).map((step, i) => {
              const state = fieldSteps[i];
              const isNow = state === "now";
              const isDone = state === "done";
              const tagText = isDone ? `STEP ${i + 1} · DONE` : isNow ? `STEP ${i + 1} · NOW` : `STEP ${i + 1}`;
              const tagColor = isNow
                ? "oklch(0.5 0.13 255)"
                : isDone
                  ? "oklch(0.5 0.13 150)"
                  : "oklch(0.62 0.015 262)";
              const cardStyle = isNow
                ? {
                    padding: "14px",
                    borderRadius: "11px",
                    border: "1px solid oklch(0.85 0.04 255)",
                    background: "oklch(0.97 0.02 255)",
                  }
                : isDone
                  ? {
                      padding: "14px",
                      borderRadius: "11px",
                      border: "1px solid oklch(0.88 0.05 150)",
                      background: "oklch(0.98 0.025 150)",
                    }
                  : {
                      padding: "14px",
                      borderRadius: "11px",
                      border: "1px solid oklch(0.93 0.005 250)",
                    };

              return (
                <div key={i} style={cardStyle}>
                  <div
                    style={{
                      fontFamily: S.mono,
                      fontSize: "10px",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      color: tagColor,
                    }}
                  >
                    {tagText}
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      marginTop: "6px",
                      color: state === "todo" ? "oklch(0.45 0.02 262)" : "oklch(0.27 0.02 262)",
                    }}
                  >
                    {step.title}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      marginTop: "3px",
                      color: isNow ? "oklch(0.5 0.015 262)" : "oklch(0.6 0.015 262)",
                    }}
                  >
                    {step.detail}
                  </div>
                </div>
              );
            })}
          </div>

          {/* finish outcomes: interactive when in_process, locked when not */}
          {isFieldActive ? (
            <FinishOutcomeCards
              jobId={jobId}
              returnTo={returnTo}
              completeAction={markJobFieldCompleteFromForm}
              partsAction={markJobPartsNeededFromForm}
              approvalAction={markJobApprovalNeededFromForm}
              unableAction={markJobUnableToCompleteFromForm}
            />
          ) : !fieldComplete ? (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "9px",
                  background: "oklch(0.96 0.004 250)",
                  marginBottom: "12px",
                }}
              >
                <span
                  style={{
                    fontFamily: S.mono,
                    fontSize: "9.5px",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    color: "oklch(0.55 0.015 262)",
                    border: "1px solid oklch(0.88 0.006 250)",
                    padding: "3px 7px",
                    borderRadius: "5px",
                  }}
                >
                  LOCKED
                </span>
                <span style={{ fontSize: "12.5px", color: "oklch(0.5 0.015 262)" }}>
                  Finish outcomes unlock at Step 3, once the visit is in progress.
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4,1fr)",
                  gap: "10px",
                  opacity: 0.5,
                  pointerEvents: "none",
                }}
              >
                {[
                  { label: "Work Completed", desc: "Ready for closeout & billing.", tone: "oklch(0.58 0.13 150)" },
                  { label: "Parts Needed", desc: "Flag a return, tie to next visit.", tone: "oklch(0.66 0.14 68)" },
                  { label: "Approval Needed", desc: "Customer must approve to continue.", tone: "oklch(0.66 0.14 68)" },
                  { label: "Unable to Complete", desc: "Needs an office decision.", tone: "oklch(0.58 0.18 25)" },
                ].map((o) => (
                  <div
                    key={o.label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      padding: "14px",
                      borderRadius: "11px",
                      border: "1px solid oklch(0.92 0.006 250)",
                      background: "#fff",
                    }}
                  >
                    <span
                      style={{
                        width: "9px",
                        height: "9px",
                        borderRadius: "50%",
                        background: o.tone,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 700,
                        color: "oklch(0.27 0.02 262)",
                        marginTop: "8px",
                      }}
                    >
                      {o.label}
                    </span>
                    <span
                      style={{
                        fontSize: "11.5px",
                        lineHeight: 1.4,
                        color: "oklch(0.5 0.015 262)",
                        marginTop: "4px",
                      }}
                    >
                      {o.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "11px",
                background: "oklch(0.95 0.04 150)",
                border: "1px solid oklch(0.88 0.05 150)",
                fontSize: "13.5px",
                fontWeight: 600,
                color: "oklch(0.45 0.13 150)",
              }}
            >
              Field work complete — visit submitted.
            </div>
          )}
        </section>

        {/* ── WORK & BILLING ────────────────────────────────────────────────── */}
        <section
          id="billing"
          data-jobsection="billing"
          style={S.section}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "18px",
            }}
          >
            <div style={S.sectionLabel}>Work &amp; Billing</div>
            <form action={updateJobVisitScopeFromForm} style={{ display: "inline" }}>
              <input type="hidden" name="job_id" value={jobId} />
              <input type="hidden" name="tab" value="info" />
              <input type="hidden" name="return_to" value={returnTo} />
              <input
                type="hidden"
                name="visit_scope_items_json"
                value={JSON.stringify(visitScopeItems)}
              />
              <input
                type="text"
                name="visit_scope_summary"
                defaultValue={String(job.visit_scope_summary ?? "")}
                placeholder="Add / update work summary…"
                style={{
                  height: "34px",
                  padding: "0 10px",
                  borderRadius: "8px",
                  border: "1px solid oklch(0.85 0.04 255)",
                  background: "oklch(0.97 0.02 255)",
                  color: "oklch(0.27 0.02 262)",
                  fontSize: "12.5px",
                  fontFamily: "inherit",
                  width: "220px",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                style={{
                  height: "34px",
                  padding: "0 12px",
                  marginLeft: "6px",
                  borderRadius: "8px",
                  border: "1px solid oklch(0.85 0.04 255)",
                  background: "oklch(0.97 0.02 255)",
                  color: "oklch(0.45 0.14 255)",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Save
              </button>
            </form>
          </div>

          {/* work items */}
          {visitScopeItems.length > 0 ? (
            <div style={{ marginBottom: "20px" }}>
              {visitScopeItems.map((item, idx) => (
                <div
                  key={item.id ?? idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "13px 0",
                    ...S.rowRule,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13.5px", fontWeight: 600 }}>{item.title}</div>
                    {item.details ? (
                      <div
                        style={{
                          fontFamily: S.mono,
                          fontSize: "11px",
                          color: "oklch(0.6 0.015 262)",
                          marginTop: "2px",
                        }}
                      >
                        {item.details}
                      </div>
                    ) : null}
                  </div>
                  {visitStarted ? (
                    <span
                      style={{
                        fontFamily: S.mono,
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "4px 9px",
                        borderRadius: "6px",
                        background: "oklch(0.95 0.04 150)",
                        color: "oklch(0.45 0.13 150)",
                      }}
                    >
                      Captured
                    </span>
                  ) : null}
                  {item.expected_unit_price != null ? (
                    <span
                      style={{
                        fontFamily: S.mono,
                        fontSize: "14px",
                        fontWeight: 600,
                        width: "78px",
                        textAlign: "right",
                      }}
                    >
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                        item.expected_unit_price,
                      )}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: "22px",
                textAlign: "center",
                border: "1px dashed oklch(0.88 0.006 250)",
                borderRadius: "11px",
                color: "oklch(0.55 0.015 262)",
                fontSize: "13px",
                marginBottom: "20px",
              }}
            >
              No work items yet — add work performed, then price it before invoicing.
            </div>
          )}

          {/* closeout readiness */}
          <div style={{ ...S.fieldLabel, marginBottom: "10px" }}>Closeout readiness</div>
          <div
            style={{
              border: "1px solid oklch(0.93 0.005 250)",
              borderRadius: "11px",
              overflow: "hidden",
              marginBottom: "20px",
            }}
          >
            {[
              {
                label: "Field work complete",
                detail: fieldComplete
                  ? "Tech submitted visit outcome"
                  : visitStarted
                    ? "Tech on site, finishing now"
                    : "Visit not yet finished in the field",
                dot: fieldComplete
                  ? "oklch(0.58 0.13 150)"
                  : visitStarted
                    ? "oklch(0.55 0.17 255)"
                    : "oklch(0.66 0.14 68)",
                value: fieldComplete ? "Done" : visitStarted ? "On site" : "Pending",
                valueBg: fieldComplete
                  ? "oklch(0.95 0.04 150)"
                  : visitStarted
                    ? "oklch(0.96 0.025 255)"
                    : "oklch(0.96 0.05 75)",
                valueFg: fieldComplete
                  ? "oklch(0.45 0.13 150)"
                  : visitStarted
                    ? "oklch(0.5 0.13 255)"
                    : "oklch(0.5 0.12 65)",
              },
              ...(isEccJob
                ? [
                    {
                      label: "Certs / compliance",
                      detail: certsComplete ? "Certificates sent" : "Tests & certificate not complete",
                      dot: certsComplete ? "oklch(0.58 0.13 150)" : "oklch(0.66 0.14 68)",
                      value: certsComplete ? "Done" : "Blocked",
                      valueBg: certsComplete ? "oklch(0.95 0.04 150)" : "oklch(0.96 0.05 75)",
                      valueFg: certsComplete ? "oklch(0.45 0.13 150)" : "oklch(0.5 0.12 65)",
                    },
                  ]
                : []),
              {
                label: "Billing resolved",
                detail: invoiceComplete ? "Invoice closed" : "No invoice issued or external mark",
                dot: invoiceComplete ? "oklch(0.58 0.13 150)" : "oklch(0.7 0.02 262)",
                value: invoiceComplete ? "Done" : "Open",
                valueBg: invoiceComplete ? "oklch(0.95 0.04 150)" : "oklch(0.96 0.004 250)",
                valueFg: invoiceComplete ? "oklch(0.45 0.13 150)" : "oklch(0.55 0.015 262)",
              },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "13px 16px",
                  ...S.rowRule,
                }}
              >
                <span
                  style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    background: row.dot,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13.5px", fontWeight: 600 }}>{row.label}</div>
                  <div style={{ fontSize: "12px", color: "oklch(0.55 0.015 262)", marginTop: "1px" }}>
                    {row.detail}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: S.mono,
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "4px 9px",
                    borderRadius: "6px",
                    background: row.valueBg,
                    color: row.valueFg,
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* invoice bar */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={S.fieldLabel}>Ready to invoice</div>
              <div
                style={{
                  fontFamily: S.mono,
                  fontSize: "26px",
                  fontWeight: 600,
                  marginTop: "2px",
                }}
              >
                {invoiceTotal}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <Link
                href={`/jobs/${jobId}/invoice`}
                style={{
                  height: "42px",
                  padding: "0 18px",
                  borderRadius: "10px",
                  border: "1px solid oklch(0.9 0.006 250)",
                  background: "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "oklch(0.32 0.02 262)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Mark Externally Billed
              </Link>
              <Link
                href={`/jobs/${jobId}/invoice`}
                style={{
                  height: "42px",
                  padding: "0 22px",
                  borderRadius: "10px",
                  border: "none",
                  background: "oklch(0.27 0.02 262)",
                  color: "#fff",
                  fontSize: "13.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Create Invoice
              </Link>
            </div>
          </div>
        </section>

        {/* ── FOLLOW-UP & SERVICE CHAIN ─────────────────────────────────────── */}
        <section
          id="followup"
          data-jobsection="followup"
          style={S.section}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}
          >
            <div style={S.sectionLabel}>Follow-Up &amp; Service Chain</div>
            <span
              style={{
                fontFamily: S.mono,
                fontSize: "9.5px",
                letterSpacing: "0.06em",
                fontWeight: 600,
                color: "oklch(0.5 0.13 255)",
                background: "oklch(0.96 0.025 255)",
                padding: "3px 8px",
                borderRadius: "6px",
              }}
            >
              EVERYSTEP
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px" }}>
            {/* schedule a next visit */}
            <div>
              <div style={{ ...S.fieldLabel, marginBottom: "10px" }}>Schedule a next visit</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <form action={createReturnVisitAction}>
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <ImmediateSubmitButton
                    pendingText="Creating…"
                    className=""
                    style={S.outlineBtn(true) as React.CSSProperties}
                  >
                    Create Return Visit
                  </ImmediateSubmitButton>
                </form>
                <form action={createCallbackAction}>
                  <input type="hidden" name="job_id" value={jobId} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <ImmediateSubmitButton
                    pendingText="Creating…"
                    className=""
                    style={S.outlineBtn(false) as React.CSSProperties}
                  >
                    Create Callback
                  </ImmediateSubmitButton>
                </form>
              </div>
              <div
                style={{
                  fontSize: "12px",
                  lineHeight: 1.5,
                  color: "oklch(0.55 0.015 262)",
                  marginTop: "12px",
                }}
              >
                A <strong style={{ color: "oklch(0.4 0.02 262)" }}>return</strong> continues
                unresolved work and links to this visit. A{" "}
                <strong style={{ color: "oklch(0.4 0.02 262)" }}>callback</strong> opens a new
                issue after completion — original job history stays intact.
              </div>
            </div>

            {/* EveryStep sync */}
            <div>
              <div style={{ ...S.fieldLabel, marginBottom: "10px" }}>EveryStep sync</div>
              {waitingState ? (
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "11px",
                    border: "1px solid oklch(0.88 0.05 75)",
                    background: "oklch(0.97 0.03 75)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: S.mono,
                      fontSize: "10px",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      fontWeight: 600,
                      color: "oklch(0.5 0.12 65)",
                      marginBottom: "6px",
                    }}
                  >
                    Active hold — {waitingState.blockerLabel}
                  </div>
                  <div
                    style={{ fontSize: "13px", fontWeight: 600, color: "oklch(0.4 0.02 262)" }}
                  >
                    {waitingState.blockerReason}
                  </div>
                  {waitingState.blockerType === "waiting_on_part" ? (
                    <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                      <form action={markServicePartOrderedFromForm}>
                        <input type="hidden" name="job_id" value={jobId} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <ImmediateSubmitButton pendingText="Saving…" className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline underline-offset-2 bg-transparent border-0 cursor-pointer p-0">
                          Mark Part Ordered
                        </ImmediateSubmitButton>
                      </form>
                      <form action={markServicePartArrivedFromForm}>
                        <input type="hidden" name="job_id" value={jobId} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <ImmediateSubmitButton pendingText="Saving…" className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline underline-offset-2 bg-transparent border-0 cursor-pointer p-0">
                          Mark Part Arrived
                        </ImmediateSubmitButton>
                      </form>
                    </div>
                  ) : waitingState.blockerType === "waiting_on_customer_approval" ? (
                    <form action={markServiceApprovalReceivedFromForm} style={{ marginTop: "12px" }}>
                      <input type="hidden" name="job_id" value={jobId} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <ImmediateSubmitButton pendingText="Saving…" className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline underline-offset-2 bg-transparent border-0 cursor-pointer p-0">
                        Mark Approval Received
                      </ImmediateSubmitButton>
                    </form>
                  ) : null}
                </div>
              ) : (
                <div
                  style={{
                    padding: "16px",
                    borderRadius: "11px",
                    border: "1px dashed oklch(0.88 0.006 250)",
                    background: "oklch(0.985 0.003 250)",
                  }}
                >
                  <div
                    style={{ fontSize: "13px", fontWeight: 600, color: "oklch(0.4 0.02 262)" }}
                  >
                    No active hold
                  </div>
                  <div
                    style={{
                      fontSize: "12.5px",
                      lineHeight: 1.55,
                      color: "oklch(0.55 0.015 262)",
                      marginTop: "5px",
                    }}
                  >
                    When the field flags <strong style={{ color: "oklch(0.45 0.02 262)" }}>Parts Needed</strong>{" "}
                    or <strong style={{ color: "oklch(0.45 0.02 262)" }}>Approval Needed</strong>, the tracker
                    appears here — every step (ordered → arrived → released) stays synced to this job and
                    the next visit.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* service chain */}
          <div style={{ marginTop: "24px" }}>
            <div style={{ ...S.fieldLabel, marginBottom: "12px" }}>Service chain</div>
            <Suspense
              fallback={
                <div
                  style={{
                    padding: "13px 0",
                    fontSize: "13px",
                    color: "oklch(0.62 0.015 262)",
                    ...S.rowRule,
                  }}
                >
                  Loading service chain…
                </div>
              }
            >
              {serviceCaseId ? (
                <DeferredServiceChainPanelBody
                  currentJobId={jobId}
                  accountOwnerUserId={accountOwnerUserId}
                  serviceCaseId={serviceCaseId}
                  emptyStateClassName="text-sm text-slate-500 py-3"
                />
              ) : (
                <div style={{ fontSize: "13px", color: "oklch(0.62 0.015 262)", padding: "3px 0" }}>
                  No service chain linked
                </div>
              )}
            </Suspense>
          </div>
        </section>

        {/* ── ECC & COMPLIANCE (ECC jobs only) ─────────────────────────────── */}
        {isEccJob ? (
          <section
            id="compliance"
            data-jobsection="compliance"
            style={S.section}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}
            >
              <div style={S.sectionLabel}>ECC &amp; Compliance</div>
            </div>
            <div
              style={{
                border: "1px solid oklch(0.93 0.005 250)",
                borderRadius: "11px",
                overflow: "hidden",
              }}
            >
              {[
                {
                  label: "Permit number",
                  value: isValidEccPermitNumber(job.permit_number) ? String(job.permit_number) : "Missing",
                  isOk: isValidEccPermitNumber(job.permit_number),
                },
                {
                  label: "Tests complete",
                  value: completedEccRuns > 0 ? `${completedEccRuns} run${completedEccRuns !== 1 ? "s" : ""}` : "0 runs",
                  isOk: completedEccRuns > 0,
                },
                {
                  label: "Certs sent",
                  value: certsComplete ? "Sent" : "Not yet",
                  isOk: certsComplete,
                },
                {
                  label: "Retest",
                  value: opsStatus === "retest_needed" ? "Required" : "N/A",
                  isOk: opsStatus !== "retest_needed",
                },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    ...S.rowRule,
                  }}
                >
                  <span
                    style={{ fontSize: "13.5px", fontWeight: 500, color: "oklch(0.38 0.02 262)" }}
                  >
                    {row.label}
                  </span>
                  <span
                    style={{
                      fontFamily: S.mono,
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "4px 9px",
                      borderRadius: "6px",
                      background: row.isOk ? "oklch(0.96 0.004 250)" : "oklch(0.96 0.05 75)",
                      color: row.isOk ? "oklch(0.55 0.015 262)" : "oklch(0.5 0.12 65)",
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
              <Link
                href={`/jobs/${jobId}/tests`}
                style={{
                  height: "38px",
                  padding: "0 18px",
                  borderRadius: "9px",
                  border: "none",
                  background: "oklch(0.55 0.17 255)",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Open Tests Workspace
              </Link>
              <form action={markEccPermitAvailableFromForm}>
                <input type="hidden" name="job_id" value={jobId} />
                <input type="hidden" name="return_to" value={returnTo} />
                <ImmediateSubmitButton
                  pendingText="Saving…"
                  className=""
                  style={{
                    height: "38px",
                    padding: "0 18px",
                    borderRadius: "9px",
                    border: "1px solid oklch(0.9 0.006 250)",
                    background: "#fff",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: "oklch(0.32 0.02 262)",
                  } as React.CSSProperties}
                >
                  Add Permit Number
                </ImmediateSubmitButton>
              </form>
            </div>
          </section>
        ) : null}

        {/* ── RECORDS ───────────────────────────────────────────────────────── */}
        <section
          id="records"
          data-jobsection="records"
          style={{ ...S.section, paddingBottom: "36px" }}
        >
          <div style={{ ...S.sectionLabel, marginBottom: "16px" }}>Records</div>
          <RecordsTabs
            tabs={
              [
                {
                  id: "timeline",
                  label: "Timeline",
                  count: "—",
                  content: (
                    <Suspense
                      fallback={
                        <div style={{ padding: "16px 0", fontSize: "13px", color: "oklch(0.62 0.015 262)" }}>
                          Loading timeline…
                        </div>
                      }
                    >
                      <DeferredTimelineBody
                        jobId={jobId}
                        timelineJobIds={timelineJobIds}
                        hasDirectNarrativeChain={hasDirectNarrativeChain}
                        emptyStateClassName="text-sm text-slate-500 py-3"
                        jobSummary={{
                          id: jobId,
                          status: status,
                          ops_status: opsStatus,
                          field_complete: job.field_complete,
                          scheduled_date: job.scheduled_date,
                          window_start: job.window_start,
                          window_end: job.window_end,
                        }}
                      />
                    </Suspense>
                  ),
                },
                {
                  id: "attachments",
                  label: "Attachments",
                  count: "0",
                  content: (
                    <Suspense
                      fallback={
                        <div style={{ padding: "16px 0", fontSize: "13px", color: "oklch(0.62 0.015 262)" }}>
                          Loading attachments…
                        </div>
                      }
                    >
                      <DeferredJobAttachmentsInternal
                        jobId={jobId}
                        accountOwnerUserId={accountOwnerUserId}
                      />
                    </Suspense>
                  ),
                },
                {
                  id: "notes",
                  label: "Shared Notes",
                  count: "—",
                  content: (
                    <Suspense
                      fallback={
                        <div style={{ padding: "16px 0", fontSize: "13px", color: "oklch(0.62 0.015 262)" }}>
                          Loading notes…
                        </div>
                      }
                    >
                      <DeferredSharedNotesBody
                        jobId={jobId}
                        timelineJobIds={timelineJobIds}
                        hasDirectNarrativeChain={hasDirectNarrativeChain}
                        emptyStateClassName="text-sm text-slate-500 py-3"
                      />
                    </Suspense>
                  ),
                },
                ...(isEccJob
                  ? [
                      {
                        id: "ecc",
                        label: "ECC",
                        count: `${completedEccRuns} runs`,
                        content: (
                          <div style={{ padding: "4px 0" }}>
                            <Link
                              href={`/jobs/${jobId}/tests`}
                              style={{
                                fontSize: "13px",
                                fontWeight: 600,
                                color: "oklch(0.5 0.13 255)",
                                textDecoration: "none",
                              }}
                            >
                              Open Tests Workspace →
                            </Link>
                          </div>
                        ),
                      } satisfies RecordTab,
                    ]
                  : []),
                {
                  id: "chain",
                  label: "Service Chain",
                  count: serviceCaseId ? "linked" : "—",
                  content: (
                    <Suspense
                      fallback={
                        <div style={{ padding: "16px 0", fontSize: "13px", color: "oklch(0.62 0.015 262)" }}>
                          Loading chain…
                        </div>
                      }
                    >
                      {serviceCaseId ? (
                        <DeferredServiceChainPanelBody
                          currentJobId={jobId}
                          accountOwnerUserId={accountOwnerUserId}
                          serviceCaseId={serviceCaseId}
                          emptyStateClassName="text-sm text-slate-500 py-3"
                        />
                      ) : (
                        <div style={{ fontSize: "13px", color: "oklch(0.62 0.015 262)", padding: "3px 0" }}>
                          No service chain linked
                        </div>
                      )}
                    </Suspense>
                  ),
                },
              ] satisfies RecordTab[]
            }
          />
        </section>
      </div>

      {/* ── RIGHT: command rail ────────────────────────────────────────────── */}
      <aside
        style={{
          position: "sticky",
          top: "72px",
          alignSelf: "start",
          padding: "24px 0",
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
        }}
      >
        {/* job id */}
        <div
          style={{
            fontFamily: S.mono,
            fontSize: "10.5px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "oklch(0.6 0.015 262)",
            fontWeight: 600,
          }}
        >
          Job {jobDisplayRef}
        </div>

        {/* status pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginTop: "10px" }}>
          {isEccJob ? (
            <span
              style={{
                fontFamily: S.mono,
                fontSize: "10.5px",
                fontWeight: 600,
                padding: "4px 8px",
                borderRadius: "6px",
                background: "oklch(0.95 0.03 255)",
                color: "oklch(0.5 0.13 255)",
              }}
            >
              ECC
            </span>
          ) : null}
          <span
            style={{
              fontFamily: S.mono,
              fontSize: "10.5px",
              fontWeight: 600,
              padding: "4px 9px",
              borderRadius: "6px",
              background: statusPill.bg,
              color: statusPill.fg,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: statusPill.dot,
                flexShrink: 0,
              }}
            />
            {statusPill.label}
          </span>
        </div>

        {/* primary actions */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" }}
        >
          {!fieldComplete && (
            <form action={advanceStatusAction}>
              <input type="hidden" name="job_id" value={jobId} />
              <input type="hidden" name="return_to" value={returnTo} />
              <ImmediateSubmitButton
                pendingText="Updating…"
                className=""
                style={S.primaryBtn as React.CSSProperties}
              >
                {status === "in_process"
                  ? "Finish Visit"
                  : status === "on_the_way"
                    ? "Mark On Site"
                    : "Mark On the Way"}
              </ImmediateSubmitButton>
            </form>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <SchedulePanel
              jobId={jobId}
              returnTo={returnTo}
              scheduledDate={String(job.scheduled_date ?? "")}
              windowStart={String(job.window_start ?? "")}
              windowEnd={String(job.window_end ?? "")}
              action={updateJobScheduleFromForm}
            />
            {isEccJob ? (
              <Link
                href={`/jobs/${jobId}/tests`}
                style={{
                  flex: 1,
                  height: "38px",
                  borderRadius: "9px",
                  border: "1px solid oklch(0.9 0.006 250)",
                  background: "#fff",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "oklch(0.32 0.02 262)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Tests
              </Link>
            ) : null}
          </div>
        </div>

        {/* jump nav — scroll-spy */}
        <ScrollSpyNav items={navItems} />

        {/* blockers */}
        {blockers.length > 0 ? (
          <div
            style={{
              marginTop: "24px",
              paddingTop: "18px",
              borderTop: "1px solid oklch(0.91 0.006 250)",
            }}
          >
            <div
              style={{
                fontFamily: S.mono,
                fontSize: "9.5px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: "oklch(0.5 0.12 65)",
                marginBottom: "12px",
              }}
            >
              {blockers.length} item{blockers.length === 1 ? "" : "s"} block closeout
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {blockers.map((b) => (
                <div
                  key={b}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    fontSize: "12.5px",
                    fontWeight: 500,
                    color: "oklch(0.45 0.025 262)",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "oklch(0.72 0.15 70)",
                      flexShrink: 0,
                    }}
                  />
                  {b}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: "24px",
              paddingTop: "18px",
              borderTop: "1px solid oklch(0.91 0.006 250)",
              fontSize: "12.5px",
              color: "oklch(0.58 0.13 150)",
              fontWeight: 600,
            }}
          >
            All closeout requirements met
          </div>
        )}
      </aside>
    </div>
  );
}
