"use client";

import Link from "next/link";
import type { QueueCardStateChip, QueueCardTone } from "@/components/ops/QueueCard";
import {
  rejectFieldPaymentCollectionReportFromForm,
  verifyFieldPaymentCollectionReportFromForm,
} from "@/lib/actions/internal-invoice-payment-actions";
import { telHref, smsHref } from "@/lib/ops/phone-links";

const utilityLabelClass = "text-[11px] font-semibold uppercase tracking-[0.11em] sm:text-[10px] sm:tracking-[0.12em]";
const inlineActionClass =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:scale-[0.99] xl:min-h-8 xl:text-[11px]";
const compactContactActionClass =
  "inline-flex min-h-11 min-w-14 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";
const primaryActionClass =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 active:scale-[0.99] xl:min-h-8 xl:text-[11px]";
const inputClass = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900";

export type NeedsSchedulingRowView = {
  kind: "need_to_schedule";
  jobId: string;
  href: string;
  title: string;
  subtitle: string;
  jobTypeLabel: string;
  customerName: string;
  address: string;
  reasonLabel: string;
  reasonDetail: string | null;
  ageLabel: string;
  ageDays: number | null;
  stateChips: QueueCardStateChip[];
  tone: QueueCardTone;
  lastActionText: string;
  recentAttemptText: string;
  contractorName: string;
  phone: string;
  scheduleDateText: string;
  scheduleWindowText: string;
  scheduledDateRaw: string;
  windowStartInput: string;
  windowEndInput: string;
  permitNumber: string;
  jurisdiction: string;
  permitDate: string;
  returnToHref: string;
};

export type CloseoutRowView = {
  kind: "closeout";
  jobId: string;
  cardDomId: string;
  href: string;
  title: string;
  subtitle: string;
  jobTypeLabel: string;
  customerName: string;
  address: string;
  reasonLabel: string;
  reasonDetail: string | null;
  ageLabel: string;
  ageDays: number | null;
  stateChips: QueueCardStateChip[];
  tone: QueueCardTone;
  lastActionText: string;
  recentAttemptText: string;
  needsLabel: string;
  contractorName: string;
  scheduledText: string;
  assignmentSummary: string;
  nextStepText: string;
};

export type FollowUpRowView = {
  kind: "follow_ups";
  jobId: string;
  cardDomId: string;
  href: string;
  title: string;
  subtitle: string;
  jobTypeLabel: string;
  customerName: string;
  address: string;
  dueText: string;
  urgencyLabel: string;
  urgencyTone: QueueCardTone;
  ageLabel: string;
  ageDays: number | null;
  lastActionText: string;
  recentAttemptText: string;
  owner: string;
  statusLabel: string;
  note: string;
};

export type GenericRowView = {
  kind: "generic";
  jobId: string;
  href: string;
  title: string;
  subtitle: string;
  jobTypeLabel: string;
  customerName: string;
  address: string;
  reasonLabel: string;
  reasonDetail: string | null;
  ageLabel: string;
  ageDays: number | null;
  stateChips: QueueCardStateChip[];
  tone: QueueCardTone;
  lastActionText: string;
  recentAttemptText: string;
  assignmentSummary: string;
  contractorName: string;
  actionLabel: string;
};

export type FieldPaymentReviewRowView = {
  kind: "field_payment_review";
  reportId: string;
  cardDomId: string;
  jobId: string;
  internalInvoiceId: string;
  jobHref: string;
  invoiceWorkspaceHref: string;
  title: string;
  subtitle: string;
  amountText: string;
  methodText: string;
  reportedText: string;
  reportedDetail: string;
  invoiceReference: string;
  isSelfReported: boolean;
  returnToHref: string;
};

export type OpsQueueRowView =
  | NeedsSchedulingRowView
  | CloseoutRowView
  | FollowUpRowView
  | GenericRowView
  | FieldPaymentReviewRowView;

export default function OpsQueueRowCard({ view }: { view: OpsQueueRowView }) {
  if (view.kind === "field_payment_review") return <FieldPaymentReviewCard view={view} />;

  const richCard =
    view.kind === "need_to_schedule" ? (
      <NeedsSchedulingCard view={view} />
    ) : view.kind === "closeout" ? (
      <CloseoutCard view={view} />
    ) : view.kind === "follow_ups" ? (
      <FollowUpCard view={view} />
    ) : (
      <GenericCard view={view} />
    );

  return (
    <>
      <div className="xl:hidden">{richCard}</div>
      <DesktopLedgerRow view={view} />
    </>
  );
}

type LedgerRowView = Exclude<OpsQueueRowView, FieldPaymentReviewRowView>;

function ledgerAgeTone(ageDays: number | null) {
  if (ageDays != null && ageDays > 30) {
    return { rail: "bg-rose-600", text: "text-rose-700" };
  }
  if (ageDays != null && ageDays > 14) {
    return { rail: "bg-amber-500", text: "text-amber-700" };
  }
  return { rail: "bg-slate-300", text: "text-slate-600" };
}

function ledgerReason(view: LedgerRowView) {
  if (view.kind === "follow_ups") {
    return { label: view.statusLabel, detail: view.note };
  }
  return { label: view.reasonLabel, detail: view.reasonDetail };
}

function ledgerContractor(view: LedgerRowView) {
  if (view.kind === "follow_ups") return view.owner;
  if (view.contractorName) return view.contractorName;
  if ("assignmentSummary" in view) return view.assignmentSummary;
  return "Internal work";
}

function normalizeLedgerComparison(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

const LEDGER_CHIP_TONE_CLASS: Record<QueueCardTone, string> = {
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  slate: "border-slate-200 bg-slate-50 text-slate-600",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function DesktopLedgerRow({ view }: { view: LedgerRowView }) {
  const ageTone = ledgerAgeTone(view.ageDays);
  const reason = ledgerReason(view);
  const contractor = ledgerContractor(view);
  const phone = view.kind === "need_to_schedule" ? view.phone : "";
  const reasonComparison = normalizeLedgerComparison([reason.label, reason.detail].filter(Boolean).join(" "));
  const needsComparison =
    view.kind === "closeout" ? normalizeLedgerComparison(view.needsLabel) : "";
  const nextStepComparison =
    view.kind === "closeout" ? normalizeLedgerComparison(view.nextStepText) : "";
  const showCloseoutNeeds =
    view.kind === "closeout" &&
    Boolean(needsComparison) &&
    !reasonComparison.includes(needsComparison);
  const showCloseoutNext =
    view.kind === "closeout" &&
    Boolean(nextStepComparison) &&
    !reasonComparison.includes(nextStepComparison) &&
    nextStepComparison !== needsComparison;
  const stateChips =
    view.kind === "follow_ups"
      ? [{ label: view.urgencyLabel, tone: view.urgencyTone }]
      : view.stateChips;

  return (
    <div
      data-ops-ledger-row={view.kind}
      className="group/ledger hidden border-b border-[#eceeea] bg-white last:border-b-0 xl:block"
    >
      <div className="grid min-h-[124px] grid-cols-[3px_minmax(190px,1fr)_140px_62px_130px_130px_110px] 2xl:grid-cols-[3px_minmax(220px,1fr)_168px_72px_158px_158px_132px]">
        <div className={ageTone.rail} aria-hidden="true" />
        <div className="min-w-0 px-4 py-3">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600">
            {view.jobTypeLabel}
          </div>
          {stateChips.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {stateChips.map((chip, index) => (
                <span
                  key={`${chip.label}-${index}`}
                  className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.03em] ${LEDGER_CHIP_TONE_CLASS[chip.tone]}`}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-1 truncate text-[15px] font-semibold text-navy">{view.customerName}</div>
          <div className="mt-0.5 truncate text-[12.5px] leading-[1.15rem] text-slate-600">{view.address}</div>
          <div className="mt-0.5 truncate text-[12px] font-medium leading-[1.1rem] text-slate-600">{view.title}</div>
          <div className="mt-1 line-clamp-2 text-[12.5px] leading-[1.15rem] text-slate-700">
            <span className="text-slate-600">Reason </span>
            {reason.label}
            {reason.detail ? <span className="text-slate-500"> · {reason.detail}</span> : null}
          </div>
          {view.kind === "closeout" ? (
            <div className="mt-1 grid gap-0.5 text-[12px] leading-[1.1rem] text-slate-600">
              {showCloseoutNeeds ? (
                <div className="truncate"><span className="text-slate-400">Needs </span>{view.needsLabel}</div>
              ) : null}
              {showCloseoutNext ? (
                <div className="truncate"><span className="text-slate-400">Next </span>{view.nextStepText}</div>
              ) : null}
            </div>
          ) : view.kind === "follow_ups" ? (
            <div className="mt-1 truncate text-[12px] leading-[1.1rem] text-slate-600">
              <span className="text-slate-600">Due </span>{view.dueText}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 border-l border-[#eceeea] px-4 py-3">
          <div className="truncate text-[13.5px] font-medium text-slate-800">{contractor}</div>
          <div className="mt-1 truncate font-mono text-[12px] tabular-nums text-slate-600">
            {phone || ("assignmentSummary" in view ? view.assignmentSummary : "")}
          </div>
          {view.kind === "closeout" ? (
            <div className="mt-1 truncate text-[12px] text-slate-600">
              {view.scheduledText || "Not scheduled"}
            </div>
          ) : null}
        </div>
        <div className={`border-l border-[#eceeea] px-3 py-3 font-mono text-[13px] font-semibold tabular-nums ${ageTone.text}`}>
          {view.ageDays == null ? view.ageLabel : `${view.ageDays}d`}
        </div>
        <div className="min-w-0 border-l border-[#eceeea] px-3 py-3">
          <div className="line-clamp-3 text-[13px] font-medium leading-[1.15rem] text-slate-800">{view.lastActionText}</div>
        </div>
        <div className="min-w-0 border-l border-[#eceeea] px-3 py-3">
          <div className="line-clamp-3 text-[13px] font-medium leading-[1.15rem] text-slate-800">
            {view.recentAttemptText || "No attempts yet"}
          </div>
        </div>
        <div className="flex flex-wrap content-center items-center justify-center gap-1.5 border-l border-[#eceeea] bg-slate-50 px-2 py-3">
          <Link href={view.href} className="inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-3 text-[13px] font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
            {view.kind === "follow_ups"
              ? "Open Follow Up"
              : view.kind === "generic"
              ? view.actionLabel
              : "Open Job"}
          </Link>
        </div>
      </div>

    </div>
  );
}

function LedgerDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className={utilityLabelClass}>{label}</div>
      <div className="mt-1 leading-5 text-slate-700">{value}</div>
    </div>
  );
}

type MobileField = {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  fullWidth?: boolean;
};

function mobileAgeClass(ageDays: number | null) {
  if (ageDays != null && ageDays > 30) return "text-rose-700";
  if (ageDays != null && ageDays > 14) return "text-amber-700";
  return "text-navy";
}

function MobileOpsCard({
  view,
  actionLabel,
  fields,
  phoneHref,
  textHref,
  children,
}: {
  view: LedgerRowView;
  actionLabel: string;
  fields: MobileField[];
  phoneHref?: string | null;
  textHref?: string | null;
  children?: React.ReactNode;
}) {
  const reason = ledgerReason(view);
  const ageTone = ledgerAgeTone(view.ageDays);
  const stateChips =
    view.kind === "follow_ups"
      ? [{ label: view.urgencyLabel, tone: view.urgencyTone }]
      : view.stateChips;

  // Each mobile row is a discrete card: an age-toned spine marks where it
  // starts, a tinted action footer marks where it ends, and the card border
  // reads stronger than any hairline inside it. Cards are gapped by the list
  // container, so one card can never bleed into the next.
  return (
    <article
      id={"cardDomId" in view ? view.cardDomId : undefined}
      data-ops-mobile-row={view.kind}
      className="grid grid-cols-[4px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_22px_-18px_rgba(15,23,42,0.45)]"
    >
      <div className={ageTone.rail} aria-hidden="true" />
      <div className="min-w-0">
        <div className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                {view.jobTypeLabel}
                {view.title ? <span className="text-slate-400"> · {view.title}</span> : null}
              </div>
              {stateChips.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {stateChips.map((chip, index) => (
                    <span
                      key={`${chip.label}-${index}`}
                      className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.03em] ${LEDGER_CHIP_TONE_CLASS[chip.tone]}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className={`shrink-0 font-mono text-[13px] font-semibold tabular-nums ${mobileAgeClass(view.ageDays)}`}>
              {view.ageDays == null ? view.ageLabel : `${view.ageDays}d`}
            </div>
          </div>

          <Link href={view.href} className="mt-2 flex min-h-11 items-center text-base font-semibold leading-5 text-navy hover:text-blue-700 hover:underline">
            {view.customerName}
          </Link>
          <div className="text-[13px] leading-5 text-slate-500">{view.address}</div>
          <div className="mt-1 text-[13px] leading-5 text-slate-700">
            <span className="mr-1 text-slate-500">Reason</span>
            {reason.label}
            {reason.detail ? <span className="text-slate-600"> · {reason.detail}</span> : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-slate-200 pt-3 text-[13px] leading-5">
            {fields.map((field, index) => (
              <div key={`${field.label}-${index}`} className={field.fullWidth ? "col-span-2" : "min-w-0"}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">{field.label}</div>
                <div className="mt-0.5 font-medium text-slate-900">{field.value}</div>
                {field.detail ? <div className="text-[12.5px] text-slate-500">{field.detail}</div> : null}
              </div>
            ))}
          </div>

          {children}
        </div>

        <div className={`grid gap-2 border-t border-slate-300 bg-slate-100 px-4 py-3 ${phoneHref || textHref ? "grid-cols-[minmax(0,1fr)_78px_78px]" : "grid-cols-1"}`}>
          <Link href={view.href} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
            {actionLabel}
          </Link>
          {phoneHref ? <a href={phoneHref} className={compactContactActionClass}>Call</a> : null}
          {textHref ? <a href={textHref} className={compactContactActionClass}>Text</a> : null}
        </div>
      </div>
    </article>
  );
}

function NeedsSchedulingCard({ view }: { view: NeedsSchedulingRowView }) {
  const phoneHref = telHref(view.phone);
  const textHref = smsHref(view.phone);

  return (
    <MobileOpsCard
      view={view}
      actionLabel="Open Job"
      phoneHref={phoneHref}
      textHref={textHref}
      fields={[
        { label: "Contractor", value: view.contractorName || "Internal work", detail: view.phone || "No phone on file" },
        { label: "Last Action", value: view.lastActionText },
        { label: "Last Attempt", value: view.recentAttemptText, fullWidth: true },
      ]}
    />
  );
}

function CloseoutCard({ view }: { view: CloseoutRowView }) {
  const reasonComparison = normalizeLedgerComparison([view.reasonLabel, view.reasonDetail].filter(Boolean).join(" "));
  const needsComparison = normalizeLedgerComparison(view.needsLabel);
  const nextStepComparison = normalizeLedgerComparison(view.nextStepText);
  const showNeeds = Boolean(needsComparison) && !reasonComparison.includes(needsComparison);
  const showNext =
    Boolean(nextStepComparison) &&
    !reasonComparison.includes(nextStepComparison) &&
    nextStepComparison !== needsComparison;

  return (
    <MobileOpsCard
      view={view}
      actionLabel="Open Job"
      fields={[
        { label: "Contractor", value: view.contractorName || view.assignmentSummary || "Internal work" },
        { label: "Last Action", value: view.lastActionText },
        { label: "Last Attempt", value: view.recentAttemptText, fullWidth: true },
        ...(showNeeds ? [{ label: "Needs", value: view.needsLabel }] : []),
      ]}
    >
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-slate-200 pt-3">
        <div className="min-w-0">
          <div className={utilityLabelClass}>Scheduled</div>
          <div className="mt-0.5 text-[12.5px] text-slate-800">{view.scheduledText || "Not scheduled"}</div>
        </div>
        <div className="min-w-0">
          <div className={utilityLabelClass}>Assignment</div>
          <div className="mt-0.5 text-[12.5px] text-slate-800">{view.assignmentSummary}</div>
        </div>
        {showNext ? (
          <div className="col-span-2 min-w-0">
            <div className={utilityLabelClass}>Next Step</div>
            <div className="mt-0.5 text-[12.5px] leading-5 text-slate-800">{view.nextStepText}</div>
          </div>
        ) : null}
      </div>
    </MobileOpsCard>
  );
}

function FollowUpCard({ view }: { view: FollowUpRowView }) {
  return (
    <MobileOpsCard
      view={view}
      actionLabel="Open Follow Up"
      fields={[
        { label: "Due", value: view.dueText },
        { label: "Last Action", value: view.lastActionText },
        { label: "Owner", value: view.owner },
        { label: "Status", value: view.statusLabel },
        { label: "Last Attempt", value: view.recentAttemptText, fullWidth: true },
        { label: "Reminder", value: view.note, fullWidth: true },
      ]}
    />
  );
}

function GenericCard({ view }: { view: GenericRowView }) {
  return (
    <MobileOpsCard
      view={view}
      actionLabel={view.actionLabel}
      fields={[
        { label: "Contractor", value: view.contractorName || view.assignmentSummary || "Internal work" },
        ...(view.contractorName
          ? [{ label: "Assignment", value: view.assignmentSummary }]
          : []),
        { label: "Last Action", value: view.lastActionText },
        { label: "Last Attempt", value: view.recentAttemptText, fullWidth: true },
      ]}
    />
  );
}

function FieldPaymentReviewCard({ view }: { view: FieldPaymentReviewRowView }) {
  return (
    <article
      id={view.cardDomId}
      data-ops-field-payment-review
      className="overflow-hidden rounded-xl border border-amber-200 bg-white"
    >
      <div className="grid grid-cols-[3px_minmax(0,1fr)]">
        <div className="bg-amber-500" aria-hidden="true" />
        <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(220px,1fr)_minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-amber-700">
              Field Payment Review
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-navy">{view.title}</div>
            <div className="mt-0.5 truncate text-[11.5px] text-slate-500">{view.subtitle}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs text-slate-700 sm:grid-cols-4">
            <LedgerDetail label="Amount" value={view.amountText} />
            <LedgerDetail label="Method" value={view.methodText} />
            <LedgerDetail label="Reported" value={`${view.reportedText} · by ${view.reportedDetail}`} />
            <LedgerDetail label="Invoice" value={view.invoiceReference} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={view.jobHref} className={primaryActionClass}>
              View Job
            </Link>
            <Link href={view.invoiceWorkspaceHref} className={inlineActionClass}>
              Open invoice workspace
            </Link>
          </div>
        </div>
      </div>

      <details className="group border-t border-[#eceeea]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 bg-slate-50 px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-200 xl:min-h-10 xl:text-[12px] [&::-webkit-details-marker]:hidden">
          <span>Open &amp; Act</span>
          <span className="text-[10px] text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
        </summary>
        <div className="grid gap-3 border-t border-[#eceeea] p-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <div>
            <div className={utilityLabelClass}>Next Step</div>
            <p className="mt-1 text-sm leading-5 text-slate-700">Confirm only after verifying the money was received.</p>
          </div>
          {view.isSelfReported ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
              Reporter cannot verify their own report.
            </div>
          ) : (
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] sm:grid-cols-2">
              <form action={verifyFieldPaymentCollectionReportFromForm} className="space-y-2">
                <input type="hidden" name="field_payment_report_id" value={view.reportId} />
                <input type="hidden" name="report_id" value={view.reportId} />
                <input type="hidden" name="invoice_id" value={view.internalInvoiceId} />
                <input type="hidden" name="job_id" value={view.jobId} />
                <input type="hidden" name="tab" value="info" />
                <input type="hidden" name="return_to" value={view.returnToHref} />
                <label className="block">
                  <span className="mb-1 block font-semibold text-slate-900">Verification note</span>
                  <input name="verification_note" type="text" className={inputClass} placeholder="Optional office confirmation details" />
                </label>
                <button type="submit" className={inlineActionClass}>
                  Confirm Payment
                </button>
              </form>
              <form action={rejectFieldPaymentCollectionReportFromForm} className="space-y-2">
                <input type="hidden" name="field_payment_report_id" value={view.reportId} />
                <input type="hidden" name="report_id" value={view.reportId} />
                <input type="hidden" name="invoice_id" value={view.internalInvoiceId} />
                <input type="hidden" name="job_id" value={view.jobId} />
                <input type="hidden" name="tab" value="info" />
                <input type="hidden" name="return_to" value={view.returnToHref} />
                <label className="block">
                  <span className="mb-1 block font-semibold text-slate-900">Rejection reason</span>
                  <input name="rejection_reason" type="text" required className={inputClass} placeholder="Required" />
                </label>
                <button type="submit" className={inlineActionClass}>
                  Reject Report
                </button>
              </form>
            </div>
          )}
        </div>
      </details>
    </article>
  );
}
