"use client";

import Link from "next/link";
import QueueCard, { type QueueCardStateChip, type QueueCardTone } from "@/components/ops/QueueCard";
import QueueCardOpenAndAct from "@/components/ops/QueueCardOpenAndAct";
import { updateJobScheduleFromForm } from "@/lib/actions";
import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";
import { markInvoiceCompleteFromForm } from "@/lib/actions/job-ops-actions";
import {
  rejectFieldPaymentCollectionReportFromForm,
  verifyFieldPaymentCollectionReportFromForm,
} from "@/lib/actions/internal-invoice-payment-actions";
import { telHref, smsHref } from "@/lib/ops/phone-links";

const utilityLabelClass = "text-[11px] font-semibold uppercase tracking-[0.11em] sm:text-[10px] sm:tracking-[0.12em]";
const inlineActionClass =
  "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:scale-[0.99]";
const compactContactActionClass =
  "inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";
const inlinePrimaryActionClass =
  "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 active:scale-[0.99]";
const scheduleFieldClass =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition-colors focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200";
const primaryActionClass =
  "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 active:scale-[0.99]";
const chipClass = "inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600";
const inputClass = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900";

export type NeedsSchedulingRowView = {
  kind: "need_to_schedule";
  jobId: string;
  href: string;
  title: string;
  subtitle: string;
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
  reasonLabel: string;
  reasonDetail: string | null;
  ageLabel: string;
  ageDays: number | null;
  stateChips: QueueCardStateChip[];
  tone: QueueCardTone;
  lastActionText: string;
  needsLabel: string;
  contractorName: string;
  scheduledText: string;
  assignmentSummary: string;
  nextStepText: string;
  phone: string;
  canMarkExternalInvoiceSent: boolean;
  returnToHref: string;
};

export type FollowUpRowView = {
  kind: "follow_ups";
  jobId: string;
  cardDomId: string;
  href: string;
  title: string;
  subtitle: string;
  dueText: string;
  urgencyLabel: string;
  urgencyTone: QueueCardTone;
  ageLabel: string;
  ageDays: number | null;
  lastActionText: string;
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
  reasonLabel: string;
  reasonDetail: string | null;
  ageLabel: string;
  ageDays: number | null;
  stateChips: QueueCardStateChip[];
  tone: QueueCardTone;
  lastActionText: string;
  assignmentSummary: string;
  contractorName: string;
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
  if (view.kind === "need_to_schedule") return <NeedsSchedulingCard view={view} />;
  if (view.kind === "closeout") return <CloseoutCard view={view} />;
  if (view.kind === "follow_ups") return <FollowUpCard view={view} />;
  if (view.kind === "field_payment_review") return <FieldPaymentReviewCard view={view} />;
  return <GenericCard view={view} />;
}

function NeedsSchedulingCard({ view }: { view: NeedsSchedulingRowView }) {
  const phoneHref = telHref(view.phone);
  const textHref = smsHref(view.phone);

  return (
    <QueueCard
      key={view.jobId}
      variant="needs-scheduling-rich"
      href={view.href}
      title={view.title}
      subtitle={view.subtitle}
      actionLabel="Open Job"
      tone={view.tone}
      stateChips={view.stateChips}
      ageLabel={view.ageLabel}
      ageDays={view.ageDays}
      tagsColumns={4}
      tags={[
        { label: "Reason", value: view.reasonLabel, detail: view.reasonDetail || undefined },
        { label: "Last Action", value: view.lastActionText },
        { label: "Last Attempt", value: view.recentAttemptText },
        ...(view.contractorName ? [{ label: "Contractor", value: view.contractorName }] : []),
      ]}
    >
      <QueueCardOpenAndAct>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <span className={utilityLabelClass}>Phone</span>
            {view.phone ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {phoneHref || textHref ? (
                  <a
                    href={phoneHref || textHref}
                    className="text-sm font-semibold text-slate-800 transition-colors hover:text-slate-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                  >
                    {view.phone}
                  </a>
                ) : (
                  <span className="text-sm font-medium text-slate-800">{view.phone}</span>
                )}
                <div className="flex items-center gap-1.5">
                  {phoneHref ? (
                    <a href={phoneHref} className={compactContactActionClass}>
                      Call
                    </a>
                  ) : null}
                  {textHref ? (
                    <a href={textHref} className={compactContactActionClass}>
                      Open SMS App
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <span className="text-sm text-slate-400">No phone on file</span>
            )}
          </div>
          <div className="grid gap-1.5">
            <span className={utilityLabelClass}>Schedule</span>
            <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              {view.scheduleWindowText ? `${view.scheduleDateText} / ${view.scheduleWindowText}` : view.scheduleDateText}
            </span>
          </div>

          <form action={updateJobScheduleFromForm} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.35)]">
            <input type="hidden" name="job_id" value={view.jobId} />
            <input type="hidden" name="permit_number" value={view.permitNumber} />
            <input type="hidden" name="jurisdiction" value={view.jurisdiction} />
            <input type="hidden" name="permit_date" value={view.permitDate} />
            <input type="hidden" name="return_to" value={view.returnToHref} />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Date
                <input type="date" name="scheduled_date" defaultValue={view.scheduledDateRaw} className={scheduleFieldClass} />
              </label>
              <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Start
                <input type="time" name="window_start" defaultValue={view.windowStartInput} className={scheduleFieldClass} />
              </label>
              <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                End
                <input type="time" name="window_end" defaultValue={view.windowEndInput} className={scheduleFieldClass} />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button type="submit" className={inlinePrimaryActionClass}>
                Save Schedule
              </button>
              <button type="submit" name="unschedule" value="1" className={inlineActionClass}>
                Clear
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-1.5">
            <form action={logCustomerContactAttemptFromForm}>
              <input type="hidden" name="job_id" value={view.jobId} />
              <input type="hidden" name="method" value="call" />
              <input type="hidden" name="result" value="no_answer" />
              <input type="hidden" name="return_to" value={view.returnToHref} />
              <input type="hidden" name="success_banner" value="contact_attempt_logged_call" />
              <button type="submit" className={inlineActionClass}>
                Log Call
              </button>
            </form>
            <form action={logCustomerContactAttemptFromForm}>
              <input type="hidden" name="job_id" value={view.jobId} />
              <input type="hidden" name="method" value="text" />
              <input type="hidden" name="result" value="sent" />
              <input type="hidden" name="return_to" value={view.returnToHref} />
              <input type="hidden" name="success_banner" value="contact_attempt_logged_text" />
              <button type="submit" className={inlineActionClass}>
                Log Text Attempt
              </button>
            </form>
          </div>
          <p className="text-[11px] text-slate-500">Logs communication attempts only; does not confirm carrier delivery.</p>
        </div>
      </QueueCardOpenAndAct>
    </QueueCard>
  );
}

function CloseoutCard({ view }: { view: CloseoutRowView }) {
  const phoneHref = telHref(view.phone);
  const textHref = smsHref(view.phone);

  return (
    <QueueCard
      key={view.jobId}
      id={view.cardDomId}
      variant="closeout-rich"
      href={view.href}
      title={view.title}
      subtitle={view.subtitle}
      actionLabel="Open Job"
      tone={view.tone}
      stateChips={view.stateChips}
      ageLabel={view.ageLabel}
      ageDays={view.ageDays}
      tagsColumns={4}
      tags={[
        { label: "Reason", value: view.reasonLabel, detail: view.reasonDetail || undefined },
        { label: "Last Action", value: view.lastActionText },
        { label: "Needs", value: view.needsLabel },
        ...(view.contractorName ? [{ label: "Contractor", value: view.contractorName }] : []),
      ]}
    >
      <QueueCardOpenAndAct>
        <div className="space-y-3">
          {view.scheduledText ? (
            <div className="grid gap-1.5">
              <span className={utilityLabelClass}>Scheduled</span>
              <span className={chipClass}>{view.scheduledText}</span>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <span className={utilityLabelClass}>Assignment</span>
            <span className={chipClass}>{view.assignmentSummary}</span>
          </div>
          <div className="grid gap-1.5">
            <span className={utilityLabelClass}>Next Step</span>
            <p className="text-sm leading-5 text-slate-700">{view.nextStepText}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={view.href} className={primaryActionClass}>
              View Job
            </Link>
            {phoneHref ? (
              <a href={phoneHref} className={inlineActionClass}>
                Call
              </a>
            ) : null}
            {textHref ? (
              <a href={textHref} className={inlineActionClass}>
                Open SMS App
              </a>
            ) : null}
            {view.canMarkExternalInvoiceSent ? (
              <form action={markInvoiceCompleteFromForm}>
                <input type="hidden" name="job_id" value={view.jobId} />
                <input type="hidden" name="return_to" value={view.returnToHref} />
                <input type="hidden" name="success_notice" value="external_billing_complete" />
                <button type="submit" className={inlineActionClass}>
                  External Billing Complete
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </QueueCardOpenAndAct>
    </QueueCard>
  );
}

function FollowUpCard({ view }: { view: FollowUpRowView }) {
  return (
    <QueueCard
      key={view.jobId}
      id={view.cardDomId}
      variant={
        view.urgencyTone === "rose"
          ? "follow-up-overdue"
          : view.urgencyTone === "amber"
          ? "follow-up-soon"
          : "follow-up-future"
      }
      href={view.href}
      title={view.title}
      subtitle={view.subtitle}
      actionLabel="Open Follow Up"
      stateChips={[{ label: view.urgencyLabel, tone: view.urgencyTone }]}
      ageLabel={view.ageLabel}
      ageDays={view.ageDays}
      tagsColumns={4}
      tags={[
        { label: "Due", value: view.dueText },
        { label: "Last Action", value: view.lastActionText },
        { label: "Owner", value: view.owner },
        { label: "Status", value: view.statusLabel },
        { label: "Reminder", value: view.note, fullWidth: true },
      ]}
    />
  );
}

function GenericCard({ view }: { view: GenericRowView }) {
  return (
    <QueueCard
      key={view.jobId}
      href={view.href}
      title={view.title}
      subtitle={view.subtitle}
      actionLabel="Open Job"
      tone={view.tone}
      stateChips={view.stateChips}
      ageLabel={view.ageLabel}
      ageDays={view.ageDays}
      quote={view.reasonDetail || undefined}
      tagsColumns={4}
      tags={[
        { label: "Reason", value: view.reasonLabel },
        { label: "Last Action", value: view.lastActionText },
        { label: "Assignment", value: view.assignmentSummary },
        ...(view.contractorName ? [{ label: "Contractor", value: view.contractorName }] : []),
      ]}
    />
  );
}

function FieldPaymentReviewCard({ view }: { view: FieldPaymentReviewRowView }) {
  return (
    <QueueCard
      key={`field-payment-${view.reportId}`}
      id={view.cardDomId}
      variant="closeout-payment-review"
      href={view.jobHref}
      title={view.title}
      subtitle={view.subtitle}
      actionLabel="Open Job"
      tags={[
        { label: "Amount", value: view.amountText },
        { label: "Method", value: view.methodText },
        { label: "Reported", value: view.reportedText, detail: `by ${view.reportedDetail}` },
      ]}
    >
      <QueueCardOpenAndAct>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <span className={utilityLabelClass}>Invoice</span>
            <span className="text-sm font-medium text-slate-700">{view.invoiceReference}</span>
          </div>
          <div className="grid gap-1.5">
            <span className={utilityLabelClass}>Next Step</span>
            <p className="text-sm leading-5 text-slate-700">Confirm only after verifying the money was received.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={view.jobHref} className={primaryActionClass}>
              View Job
            </Link>
            <Link href={view.invoiceWorkspaceHref} className={inlineActionClass}>
              Open invoice workspace
            </Link>
          </div>
          {view.isSelfReported ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
              Reporter cannot verify their own report.
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px]">
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
      </QueueCardOpenAndAct>
    </QueueCard>
  );
}
