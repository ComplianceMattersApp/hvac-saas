import type { CSSProperties, ReactNode } from "react";

import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";
import {
  createAccountWorkshareRequestFromJobForm,
  cancelAccountWorkshareRequestFromForm,
} from "@/lib/workflows/account-workshare-requests-actions";
import type { AccountWorkshareRequestRow } from "@/lib/workflows/account-workshare-requests-read";
import { formatWorkshareDateTime } from "@/app/ops/workshare/_components/workshare-request-card";

export type WorkshareConnectionOption = { id: string; label: string };

// Local style tokens mirroring the v2 job-detail design language.
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
  marginBottom: "7px",
};
const inputStyle: CSSProperties = {
  width: "100%",
  height: "38px",
  padding: "0 11px",
  borderRadius: "9px",
  border: "1px solid oklch(0.9 0.006 250)",
  background: "#fff",
  fontSize: "13.5px",
  fontFamily: "inherit",
  color: "oklch(0.3 0.02 262)",
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
  height: "42px",
  padding: "0 22px",
  borderRadius: "10px",
  border: "none",
  background: "oklch(0.55 0.17 255)",
  color: "#fff",
  fontSize: "13.5px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 1px 2px rgba(40,80,180,0.25)",
};
const cancelBtnStyle: CSSProperties = {
  height: "36px",
  padding: "0 16px",
  borderRadius: "9px",
  border: "1px solid oklch(0.88 0.03 25)",
  background: "oklch(0.98 0.01 25)",
  color: "oklch(0.5 0.13 25)",
  fontSize: "12.5px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

function NoticeBanner({ notice }: { notice: string }) {
  if (notice === "workshare_request_sent") {
    return <Banner tone="success">ECC/HERS request sent to the connected rater.</Banner>;
  }
  if (notice === "workshare_request_cancelled") {
    return <Banner tone="success">ECC/HERS request cancelled.</Banner>;
  }
  if (notice === "workshare_request_error") {
    return <Banner tone="error">ECC/HERS request could not be updated. Please try again.</Banner>;
  }
  return null;
}

function Banner({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  const success = tone === "success";
  return (
    <div
      style={{
        marginBottom: "16px",
        padding: "10px 13px",
        borderRadius: "9px",
        fontSize: "13px",
        fontWeight: 600,
        border: `1px solid ${success ? "oklch(0.85 0.06 155)" : "oklch(0.85 0.06 25)"}`,
        background: success ? "oklch(0.97 0.03 155)" : "oklch(0.97 0.03 25)",
        color: success ? "oklch(0.45 0.12 155)" : "oklch(0.5 0.13 25)",
      }}
    >
      {children}
    </div>
  );
}

export default function EccHersRequestSection({
  jobId,
  returnTo,
  connections,
  requests,
  defaultScope,
  notice,
}: {
  jobId: string;
  returnTo: string;
  connections: WorkshareConnectionOption[];
  requests: AccountWorkshareRequestRow[];
  defaultScope: string;
  notice: string;
}) {
  const sentCount = requests.filter((request) => request.status === "sent").length;

  return (
    <section id="workshare" data-jobsection="workshare" style={sectionStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <div style={sectionLabelStyle}>ECC/HERS Work Request</div>
        {requests.length > 0 ? (
          <span
            style={{
              fontFamily: mono,
              fontSize: "9.5px",
              letterSpacing: "0.06em",
              fontWeight: 600,
              color: "oklch(0.5 0.13 255)",
              background: "oklch(0.96 0.025 255)",
              padding: "3px 8px",
              borderRadius: "6px",
            }}
          >
            {sentCount} SENT
          </span>
        ) : null}
      </div>
      <p style={{ fontSize: "13px", lineHeight: 1.5, color: "oklch(0.5 0.02 262)", marginBottom: "18px", maxWidth: "640px" }}>
        Send this job&apos;s ECC/HERS request to a connected rater account. This shares a safe request snapshot only — the
        rater reviews and accepts or declines it.
      </p>

      <NoticeBanner notice={notice} />

      <form
        action={createAccountWorkshareRequestFromJobForm}
        style={{
          display: "grid",
          gap: "16px",
          padding: "18px",
          borderRadius: "12px",
          border: "1px solid oklch(0.9 0.006 250)",
          background: "oklch(0.99 0.002 250)",
        }}
      >
        <input type="hidden" name="source_job_id" value={jobId} />
        <input type="hidden" name="return_to" value={returnTo} />

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,0.9fr) minmax(0,1.1fr)", gap: "16px" }}>
          <label>
            <div style={fieldLabelStyle}>Rater account</div>
            <select name="connection_id" required style={inputStyle} defaultValue={connections[0]?.id ?? ""}>
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={fieldLabelStyle}>Preferred date / window</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,0.7fr) minmax(0,1fr)", gap: "8px" }}>
              <input type="date" name="preferred_date" style={inputStyle} />
              <input
                type="text"
                name="preferred_window"
                maxLength={240}
                placeholder="Morning, afternoon, or access window"
                style={inputStyle}
              />
            </div>
          </label>
        </div>

        <label>
          <div style={fieldLabelStyle}>Requested ECC/HERS scope</div>
          <textarea
            name="requested_scope"
            required
            maxLength={4000}
            defaultValue={defaultScope}
            rows={4}
            style={textareaStyle}
          />
        </label>

        <label>
          <div style={fieldLabelStyle}>Notes for rater</div>
          <textarea name="sender_notes" maxLength={4000} rows={3} style={textareaStyle} />
        </label>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid oklch(0.92 0.006 250)",
            paddingTop: "14px",
          }}
        >
          <div style={{ fontSize: "12px", lineHeight: 1.5, color: "oklch(0.55 0.015 262)", maxWidth: "420px" }}>
            Snapshot includes customer, location, permit, source job reference, and requested scope fields only.
          </div>
          <ImmediateSubmitButton pendingText="Sending…" className="" style={primaryBtnStyle}>
            Send request
          </ImmediateSubmitButton>
        </div>
      </form>

      {requests.length > 0 ? (
        <div style={{ marginTop: "18px", display: "grid", gap: "8px" }}>
          {requests.map((request) => (
            <div
              key={request.id}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "11px 14px",
                borderRadius: "10px",
                border: "1px solid oklch(0.92 0.006 250)",
                background: "#fff",
              }}
            >
              <div>
                <div style={{ fontSize: "13.5px", fontWeight: 600, color: "oklch(0.3 0.02 262)" }}>
                  Request {request.status === "sent" ? "sent" : request.status}
                </div>
                <div style={{ fontSize: "12px", color: "oklch(0.55 0.015 262)", marginTop: "2px" }}>
                  {formatWorkshareDateTime(request.sent_at)}
                  {request.receiver_account_id ? ` · rater ${request.receiver_account_id.slice(0, 8)}` : ""}
                </div>
              </div>
              {request.status === "sent" ? (
                <form action={cancelAccountWorkshareRequestFromForm}>
                  <input type="hidden" name="source_job_id" value={jobId} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <input type="hidden" name="request_id" value={request.id} />
                  <ImmediateSubmitButton pendingText="Cancelling…" className="" style={cancelBtnStyle}>
                    Cancel request
                  </ImmediateSubmitButton>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
