"use client";

import { useEffect, useRef } from "react";
import { recordContractorFailureReportAudit } from "@/lib/actions/contractor-report-audit-actions";

export default function PrintFailureReportButton({
  jobId,
  mode,
}: {
  jobId: string;
  mode: "saved" | "current";
}) {
  const viewRecorded = useRef(false);
  useEffect(() => {
    if (viewRecorded.current) return;
    viewRecorded.current = true;
    void recordContractorFailureReportAudit({ jobId, action: "viewed", mode }).catch(() => undefined);
  }, [jobId, mode]);

  async function printReport() {
    await recordContractorFailureReportAudit({ jobId, action: "printed", mode }).catch(() => undefined);
    window.print();
  }

  return (
    <button
      type="button"
      onClick={printReport}
      className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
    >
      Print failure report
    </button>
  );
}
