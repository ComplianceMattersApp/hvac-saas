"use client";

import { useEffect, useState, useTransition } from "react";
import {
  generateContractorReportPreview,
  getLatestSavedContractorReportSnapshot,
  sendContractorReport,
  type ContractorReportPreview,
  type ContractorFailureDetail,
  type ContractorSavedReportSnapshot,
} from "@/lib/actions/job-ops-actions";
import ActionFeedback from "@/components/ui/ActionFeedback";

function contractorReportErrorMessage(action: "generate" | "send") {
  return action === "generate" ? "Could not prepare report." : "Could not send report.";
}

function contractorSummaryLabels(reportKind: string | null | undefined) {
  const kind = String(reportKind ?? "").trim().toLowerCase();

  if (kind === "pending_info") {
    return {
      explanationLabel: "What Is Missing",
    };
  }

  if (kind === "on_hold") {
    return {
      explanationLabel: "Why This Is On Hold",
    };
  }

  return {
    explanationLabel: "What Failed",
  };
}

export default function ContractorReportPanel({
  jobId,
  contractorResponseLabel,
  contractorResponseSubLabel,
}: {
  jobId: string;
  contractorResponseLabel?: string | null;
  contractorResponseSubLabel?: string | null;
}) {
  const [preview, setPreview] = useState<ContractorReportPreview | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<ContractorSavedReportSnapshot | null>(null);
  const [sendMode, setSendMode] = useState<"generated" | "saved">("generated");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [contractorNote, setContractorNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<"generate" | "send" | "load_saved" | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSend =
    sendMode === "saved"
      ? !!savedSnapshot && !isPending
      : !!preview && !isPending;
  const summaryLabels = contractorSummaryLabels(preview?.contractor_failure_summary_v1?.report_kind);

  useEffect(() => {
    setLastAction("load_saved");
    startTransition(async () => {
      try {
        const latest = await getLatestSavedContractorReportSnapshot({ jobId });
        setSavedSnapshot(latest);
      } catch (e) {
        console.error("getLatestSavedContractorReportSnapshot failed", e);
      } finally {
        setLastAction(null);
      }
    });
  }, [jobId]);

  function formatSavedSentAt(value?: string | null) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) return raw;
    return parsed.toLocaleString();
  }

  function onGenerate() {
    setError(null);
    setSuccess(null);
    setLastAction("generate");

    startTransition(async () => {
      try {
        const nextPreview = await generateContractorReportPreview({ jobId });
        setPreview(nextPreview);
        setSendMode("generated");
        setRecipientEmail(nextPreview.default_recipient_email ?? "");
        setContractorNote("");
      } catch (e) {
        console.error("generateContractorReportPreview failed", e);
        setPreview(null);
        setError(contractorReportErrorMessage("generate"));
      } finally {
        setLastAction(null);
      }
    });
  }

  function onSend() {
    if (sendMode === "generated" && !preview) return;
    if (sendMode === "saved" && !savedSnapshot) return;

    setError(null);
    setSuccess(null);
    setLastAction("send");

    startTransition(async () => {
      try {
        const result = await sendContractorReport({
          jobId,
          recipientEmail,
          contractorNote: sendMode === "generated" ? contractorNote : undefined,
          savedReportEventId: sendMode === "saved" ? savedSnapshot?.event_id : undefined,
        });

        setSuccess(result.alreadySent ? "This was already sent." : "Report sent.");
        const refreshedSnapshot = await getLatestSavedContractorReportSnapshot({ jobId });
        setSavedSnapshot(refreshedSnapshot);
        if (refreshedSnapshot) {
          setSendMode("saved");
        }
      } catch (e) {
        console.error("sendContractorReport failed", e);
        const msg = e instanceof Error ? String(e.message ?? "").trim() : "";
        if (msg.toLowerCase().includes("recipient email")) {
          setError(msg);
        } else {
          setError(contractorReportErrorMessage("send"));
        }
      } finally {
        setLastAction(null);
      }
    });
  }

  function onUseSavedReport() {
    if (!savedSnapshot) return;
    setError(null);
    setSuccess(null);
    setPreview(null);
    setSendMode("saved");
    setRecipientEmail(savedSnapshot.default_recipient_email ?? savedSnapshot.recipient_email ?? "");
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200/90 bg-white/96 p-4 text-gray-900 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.24)] sm:p-5">
      <div className="mb-3 text-sm font-semibold text-slate-950">Contractor Report</div>

      {contractorResponseLabel ? (
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800">
            {contractorResponseLabel}
          </span>
          {contractorResponseSubLabel ? (
            <span className="text-xs text-slate-500">{contractorResponseSubLabel}</span>
          ) : null}
        </div>
      ) : null}

      <ActionFeedback type="error" message={error} className="mb-3" />
      <ActionFeedback type="success" message={success} className="mb-3" />

      <div className="mb-3 flex flex-wrap gap-2">
        {savedSnapshot ? (
          <button
            type="button"
            onClick={onUseSavedReport}
            disabled={isPending}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50"
          >
            Resend Report
          </button>
        ) : null}

        <button
          type="button"
          onClick={onGenerate}
          disabled={isPending}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50"
        >
          {isPending && lastAction === "generate"
            ? "Generating..."
            : savedSnapshot
            ? "Generate Fresh Report"
            : "Generate Report"}
        </button>

        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending && lastAction === "send"
            ? "Sending..."
            : sendMode === "saved"
            ? "Send Report"
            : "Send Report"}
        </button>
      </div>

      {savedSnapshot ? (
        <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3 text-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Report history</div>
          <div className="mt-1 text-slate-700">
            {formatSavedSentAt(savedSnapshot.sent_at_iso) ? (
              <span>Sent {formatSavedSentAt(savedSnapshot.sent_at_iso)}</span>
            ) : (
              <span>Report saved and ready to send</span>
            )}
            {savedSnapshot.recipient_email ? <span> to {savedSnapshot.recipient_email}</span> : null}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {sendMode === "saved"
              ? "Sending the saved report to a different recipient — no regeneration needed."
              : "You can resend the saved report or generate a fresh one with updated test results."}
          </div>
        </div>
      ) : null}

      {sendMode === "saved" && savedSnapshot ? (
        <div className="space-y-3 text-sm">
          <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Recipient</div>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="contractor@example.com"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Use the saved report content. Change the recipient as needed.
            </p>

            {savedSnapshot.contractor_note ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="mb-1 font-semibold uppercase tracking-[0.1em] text-slate-500">Previous note</div>
                <div className="whitespace-pre-wrap">{savedSnapshot.contractor_note}</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : preview ? (
        <div className="space-y-3 text-sm">
          {/* Meta block */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-3">
            <div className="mb-2.5 border-b border-slate-200/70 pb-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Report Type</div>
              <div className="mt-0.5 font-semibold text-slate-950">{preview.title}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {preview.reasons.length} issue{preview.reasons.length === 1 ? "" : "s"} identified &middot; {preview.service_date_text}
              </div>
            </div>
            <div className="space-y-0.5 text-slate-700">
              <div><span className="font-medium text-slate-900">Customer:</span> {preview.customer_name}</div>
              <div><span className="font-medium text-slate-900">Location:</span> {preview.location_text}</div>
              <div><span className="font-medium text-slate-900">Contractor:</span> {preview.contractor_name ?? "Not assigned"}</div>
              <div><span className="font-medium text-slate-900">Service / Test Date:</span> {preview.service_date_text}</div>
            </div>
          </div>

          {/* What Failed block */}
          <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              {summaryLabels.explanationLabel}
            </div>
            {preview.failure_details && preview.failure_details.length > 0 ? (
              <div className="space-y-2.5">
                {preview.failure_details.map((detail: ContractorFailureDetail, idx: number) => {
                  // Last line is typically the "Difference / status" summary line
                  const metricLines = detail.detail_lines.slice(0, -1);
                  const summaryLine = detail.detail_lines[detail.detail_lines.length - 1] ?? null;
                  return (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                    >
                      <div className="mb-1.5 font-semibold text-red-700">{detail.headline}</div>
                      <div className="space-y-0.5 text-slate-700">
                        {metricLines.map((line: string, lineIdx: number) => {
                          const colonIdx = line.indexOf(":");
                          if (colonIdx > -1) {
                            const label = line.slice(0, colonIdx).trim();
                            const value = line.slice(colonIdx + 1).trim();
                            return (
                              <div key={lineIdx} className="flex gap-1">
                                <span className="min-w-[10rem] shrink-0 text-slate-500">{label}:</span>
                                <span className="font-medium text-slate-900">{value}</span>
                              </div>
                            );
                          }
                          return <div key={lineIdx}>{line}</div>;
                        })}
                      </div>
                      {summaryLine ? (
                        <div className="mt-2 border-t border-slate-200 pt-1.5 text-xs font-medium text-red-600">
                          {summaryLine}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <ul className="list-disc pl-5 text-slate-700">
                {preview.reasons.map((reason, idx) => (
                  <li key={`${reason}-${idx}`}>{reason}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Next Step block */}
          <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Next Step</div>
            <div className="text-slate-700">{preview.next_step}</div>
          </div>

          {/* Additional Note block */}
          <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Recipient
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="contractor@example.com"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Defaults to the contractor email on file. Change if sending to a different contact.
            </p>

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Additional note <span className="normal-case font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={contractorNote}
              onChange={(e) => setContractorNote(e.target.value)}
              rows={3}
              placeholder="Optional note to include in the report"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
        </div>
      ) : (
        <div className="text-sm leading-6 text-slate-600">
          {isPending && lastAction === "load_saved"
            ? "Loading report history..."
            : "Generate a fresh report with current test results. The report will be saved for later resend if needed."}
        </div>
      )}
    </div>
  );
}
