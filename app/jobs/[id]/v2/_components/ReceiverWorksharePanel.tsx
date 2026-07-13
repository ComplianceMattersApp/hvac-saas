import type { CSSProperties } from "react";

import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";
import {
  addWorkshareOutcomeNoteFromForm,
  sendWorkshareOutcomeToContractorFromForm,
} from "@/lib/workflows/account-workshare-requests-actions";
import type { AccountWorkshareRequestRow } from "@/lib/workflows/account-workshare-requests-read";
import { formatWorkshareDateTime } from "@/app/ops/workshare/_components/workshare-request-card";

const mono = "var(--font-geist-mono), monospace";
const sectionStyle: CSSProperties = {
  padding: "30px 0",
  borderTop: "1px solid oklch(0.88 0.008 250)",
  scrollMarginTop: "88px",
};
const sectionLabelStyle: CSSProperties = {
  fontFamily: mono,
  fontSize: "11px",
  letterSpacing: "0.11em",
  textTransform: "uppercase",
  color: "oklch(0.42 0.025 262)",
  fontWeight: 700,
};
const fieldLabelStyle: CSSProperties = {
  fontFamily: mono,
  fontSize: "10px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "oklch(0.48 0.02 262)",
  fontWeight: 700,
  marginBottom: "6px",
};
const textareaStyle: CSSProperties = {
  width: "100%",
  padding: "10px 11px",
  borderRadius: "9px",
  border: "1px solid oklch(0.9 0.006 250)",
  background: "#fff",
  fontSize: "13.5px",
  fontFamily: "inherit",
  lineHeight: 1.5,
  color: "oklch(0.3 0.02 262)",
  resize: "vertical",
};
const primaryBtnStyle: CSSProperties = {
  height: "38px",
  padding: "0 18px",
  borderRadius: "9px",
  border: "none",
  background: "oklch(0.55 0.17 255)",
  color: "#fff",
  fontSize: "12.5px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

// Receiver (rater) side of a workshare job: shows the originating contractor's
// context, a pending retest request (with the contractor's corrections note), the
// current outcome, and a "message the contractor" note box.
export default function ReceiverWorksharePanel({
  request,
  senderCompanyName,
  receivingJobId,
  currentResult,
}: {
  request: AccountWorkshareRequestRow;
  senderCompanyName: string;
  receivingJobId: string;
  currentResult: "passed" | "failed" | null;
}) {
  const customer = clean(request.customer_name_snapshot) || "Customer not provided";
  const retestPending = !!request.retest_requested_at && !request.outcome;
  // The result is "sent" only when what the contractor has (request.outcome)
  // matches the live test result. A ready-but-unsent result awaits the rater.
  const sent = !!currentResult && request.outcome === currentResult;
  const readyToSend = !!currentResult && !sent;

  return (
    <section id="workshare-partner" data-jobsection="workshare-partner" style={sectionStyle}>
      <div style={{ ...sectionLabelStyle, marginBottom: "6px" }}>Workshare — ECC/HERS</div>
      <p style={{ fontSize: "13px", lineHeight: 1.5, color: "oklch(0.5 0.02 262)", marginBottom: "16px", maxWidth: "640px" }}>
        This job came from an ECC/HERS request sent by <strong>{senderCompanyName}</strong> for {customer}. Review the test
        result, then send it to them when you&apos;re ready — nothing is shared automatically.
      </p>

      {retestPending ? (
        <div
          style={{
            borderRadius: "10px",
            border: "1px solid oklch(0.85 0.06 75)",
            background: "oklch(0.97 0.04 75)",
            padding: "12px 14px",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "12.5px", fontWeight: 700, color: "oklch(0.5 0.12 65)" }}>
            Retest requested{request.retest_requested_at ? ` · ${formatWorkshareDateTime(request.retest_requested_at)}` : ""}
          </div>
          <p style={{ fontSize: "13px", lineHeight: 1.5, color: "oklch(0.42 0.04 65)", marginTop: "4px" }}>
            {clean(request.retest_note)
              ? `The contractor reported: ${clean(request.retest_note)}`
              : "The contractor asked for a retest. Re-run the test on this job."}
          </p>
        </div>
      ) : null}

      {!currentResult ? (
        <p style={{ fontSize: "12.5px", color: "oklch(0.55 0.015 262)", marginBottom: "16px" }}>
          No result yet — complete the ECC test on this job, then you can send the pass/fail to the contractor.
        </p>
      ) : readyToSend ? (
        <div
          style={{
            borderRadius: "10px",
            border: "1px solid oklch(0.9 0.006 250)",
            background: "oklch(0.99 0.002 250)",
            padding: "14px",
            marginBottom: "8px",
            display: "grid",
            gap: "10px",
            maxWidth: "560px",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "oklch(0.3 0.02 262)" }}>Test result ready:</span>
            <span
              style={{
                padding: "5px 12px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                border: `1px solid ${currentResult === "passed" ? "oklch(0.82 0.09 155)" : "oklch(0.82 0.09 25)"}`,
                background: currentResult === "passed" ? "oklch(0.96 0.04 155)" : "oklch(0.96 0.04 25)",
                color: currentResult === "passed" ? "oklch(0.45 0.13 155)" : "oklch(0.5 0.15 25)",
              }}
            >
              {currentResult === "passed" ? "Passed" : "Failed"}
            </span>
            <span style={{ fontSize: "12px", color: "oklch(0.5 0.12 65)", fontWeight: 600 }}>Not sent yet</span>
          </div>
          <p style={{ fontSize: "12.5px", lineHeight: 1.5, color: "oklch(0.5 0.02 262)" }}>
            Double-check the result, then send it to {senderCompanyName} when you&apos;re ready.
          </p>
          <form action={sendWorkshareOutcomeToContractorFromForm} style={{ display: "grid", gap: "8px" }}>
            <input type="hidden" name="receiving_job_id" value={receivingJobId} />
            <label style={fieldLabelStyle}>Add a note (optional)</label>
            <textarea
              name="outcome_note"
              maxLength={2000}
              rows={2}
              placeholder='e.g. "Passed after the duct fix — good to schedule the final."'
              style={textareaStyle}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <ImmediateSubmitButton pendingText="Sending…" className="" style={primaryBtnStyle}>
                Send result to contractor
              </ImmediateSubmitButton>
            </div>
          </form>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px", maxWidth: "560px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                padding: "5px 12px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                border: `1px solid ${currentResult === "passed" ? "oklch(0.82 0.09 155)" : "oklch(0.82 0.09 25)"}`,
                background: currentResult === "passed" ? "oklch(0.96 0.04 155)" : "oklch(0.96 0.04 25)",
                color: currentResult === "passed" ? "oklch(0.45 0.13 155)" : "oklch(0.5 0.15 25)",
              }}
            >
              Sent: {currentResult === "passed" ? "Passed" : "Failed"}
            </span>
            <span style={{ fontSize: "12px", color: "oklch(0.55 0.015 262)" }}>The contractor has been notified.</span>
          </div>
          {request.outcome_note ? (
            <div style={{ fontSize: "12.5px", color: "oklch(0.45 0.02 262)" }}>Last note sent: {request.outcome_note}</div>
          ) : null}
          <form action={addWorkshareOutcomeNoteFromForm} style={{ display: "grid", gap: "8px" }}>
            <input type="hidden" name="receiving_job_id" value={receivingJobId} />
            <label style={fieldLabelStyle}>Send a follow-up note (optional)</label>
            <textarea
              name="outcome_note"
              required
              maxLength={2000}
              rows={2}
              placeholder="Send the contractor an update."
              style={textareaStyle}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <ImmediateSubmitButton pendingText="Sending…" className="" style={primaryBtnStyle}>
                Send note
              </ImmediateSubmitButton>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
