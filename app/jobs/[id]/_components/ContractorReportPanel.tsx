"use client";

import { useState, useTransition } from "react";
import {
  generateContractorReportPreview,
  sendContractorReport,
  type ContractorReportPreview,
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
  const [contractorNote, setContractorNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<"generate" | "send" | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canSend = !!preview && !isPending && !sent;
  const summaryLabels = contractorSummaryLabels(preview?.contractor_failure_summary_v1?.report_kind);

  function onGenerate() {
    setError(null);
    setSuccess(null);
    setLastAction("generate");

    startTransition(async () => {
      try {
        const nextPreview = await generateContractorReportPreview({ jobId });
        setPreview(nextPreview);
        setContractorNote("");
        setSent(false);
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
    if (!preview) return;

    setError(null);
    setSuccess(null);
    setLastAction("send");

    startTransition(async () => {
      try {
        const result = await sendContractorReport({
          jobId,
          contractorNote,
        });

        setSuccess(result.alreadySent ? "This was already sent." : "Report sent.");
        setSent(true);
      } catch (e) {
        console.error("sendContractorReport failed", e);
        setError(contractorReportErrorMessage("send"));
      } finally {
        setLastAction(null);
      }
    });
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
        <button
          type="button"
          onClick={onGenerate}
          disabled={isPending}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50"
        >
          {isPending && lastAction === "generate" ? "Generating..." : "Generate Contractor Report"}
        </button>

        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sent
            ? "Sent ✓"
            : isPending && lastAction === "send"
            ? "Sending..."
            : "Send to Contractor"}
        </button>
      </div>

      {preview ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/72 px-3.5 py-3 text-sm">
            <div className="mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Report Type</div>
              <div className="mt-1 font-medium text-slate-950">{preview.title}</div>
              <div className="mt-1 text-xs text-slate-500">
                {preview.reasons.length} reason{preview.reasons.length === 1 ? "" : "s"} • {preview.service_date_text}
              </div>
            </div>

            <div><span className="font-medium">Customer:</span> {preview.customer_name}</div>
            <div><span className="font-medium">Location:</span> {preview.location_text}</div>
            <div><span className="font-medium">Contractor:</span> {preview.contractor_name ?? "Not assigned"}</div>
            <div><span className="font-medium">Service/Test Date:</span> {preview.service_date_text}</div>

            <div className="mt-2">
              <div className="font-medium">{summaryLabels.explanationLabel}</div>
              <ul className="list-disc pl-5">
                {preview.reasons.map((reason, idx) => (
                  <li key={`${reason}-${idx}`}>{reason}</li>
                ))}
              </ul>
            </div>

            <div className="mt-2"><span className="font-medium">Next Step:</span> {preview.next_step}</div>

            <div className="mt-3">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Additional Note to Contractor (Optional)
              </label>
              <textarea
                value={contractorNote}
                onChange={(e) => setContractorNote(e.target.value)}
                rows={3}
                placeholder="Optional note included in the contractor report"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm leading-6 text-slate-600">
          Generate a report preview from current job data. Preview is ephemeral and is not saved.
        </div>
      )}
    </div>
  );
}
