"use client";

import { useState, useTransition } from "react";
import {
  generateContractorReportPreview,
  sendContractorReport,
  type ContractorReportPreview,
} from "@/lib/actions/job-ops-actions";

export default function ContractorReportPanel({
  jobId,
}: {
  jobId: string;
}) {
  const [preview, setPreview] = useState<ContractorReportPreview | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [contractorNote, setContractorNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSend = !!preview && !isPending;

  function onGenerate() {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const nextPreview = await generateContractorReportPreview({ jobId });
        setPreview(nextPreview);
        setIsExpanded(true);
      } catch (e) {
        setPreview(null);
        setIsExpanded(false);
        setError(e instanceof Error ? e.message : "Failed to generate report preview");
      }
    });
  }

  function onSend() {
    if (!preview) return;

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        await sendContractorReport({
          jobId,
          contractorNote,
        });

        setSuccess("Contractor report published to portal.");
        setIsExpanded(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to send contractor report");
      }
    });
  }

  return (
    <div className="rounded-lg border bg-white p-4 text-gray-900 mb-6">
      <div className="text-sm font-semibold mb-3">Contractor Report</div>

      {error ? (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={isPending}
          className="px-3 py-2 rounded border text-sm bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {isPending ? "Generating..." : "Generate Contractor Report"}
        </button>

        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
        >
          {isPending ? "Sending..." : "Send to Contractor"}
        </button>
      </div>

      {preview ? (
        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-gray-600">Report Type</div>
                <div className="font-medium text-gray-900">{preview.title}</div>
                <div className="text-xs text-gray-600 mt-1">
                  {preview.reasons.length} reason{preview.reasons.length === 1 ? "" : "s"} • {preview.service_date_text}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                className="px-2 py-1 rounded border text-xs bg-white hover:bg-gray-50"
              >
                {isExpanded ? "Collapse" : "Expand"}
              </button>
            </div>
          </div>

          {!isExpanded ? (
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              Preview is collapsed. Expand to review details, edit contractor note, and send.
            </div>
          ) : null}

          {isExpanded ? (
            <>
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                <div className="text-xs text-gray-600 mb-2">Generated Summary</div>

                <div><span className="font-medium">Customer:</span> {preview.customer_name}</div>
                <div><span className="font-medium">Location:</span> {preview.location_text}</div>
                <div><span className="font-medium">Contractor:</span> {preview.contractor_name ?? "Not assigned"}</div>
                <div><span className="font-medium">Service/Test Date:</span> {preview.service_date_text}</div>

                <div className="mt-2">
                  <div className="font-medium">Reasons</div>
                  <ul className="list-disc pl-5">
                    {preview.reasons.map((reason, idx) => (
                      <li key={`${reason}-${idx}`}>{reason}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-2"><span className="font-medium">Next Step:</span> {preview.next_step}</div>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Contractor Note</label>
                <textarea
                  value={contractorNote}
                  onChange={(e) => setContractorNote(e.target.value)}
                  rows={4}
                  placeholder="Optional contractor-facing note"
                  className="w-full rounded border px-3 py-2 text-sm"
                />
              </div>

              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                <div className="text-xs text-gray-600 mb-1">Email-ready Body Preview</div>
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">{preview.body_text}</pre>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-gray-600">
          Generate a report preview from current job data. Preview is ephemeral and is not saved.
        </div>
      )}
    </div>
  );
}
