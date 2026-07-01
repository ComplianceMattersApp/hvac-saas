"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type SchedulePanelProps = {
  jobId: string;
  returnTo: string;
  scheduledDate: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  action: (formData: FormData) => Promise<void>;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        height: "38px",
        padding: "0 20px",
        borderRadius: "9px",
        border: "none",
        background: pending ? "oklch(0.7 0.08 255)" : "oklch(0.55 0.17 255)",
        color: "#fff",
        fontSize: "13px",
        fontWeight: 600,
        cursor: pending ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        flexShrink: 0,
      }}
    >
      {pending ? "Saving…" : "Save schedule"}
    </button>
  );
}

function UnscheduleButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        height: "34px",
        padding: "0 14px",
        borderRadius: "8px",
        border: "1px solid oklch(0.88 0.01 15)",
        background: "oklch(0.98 0.005 15)",
        color: "oklch(0.5 0.12 25)",
        fontSize: "12px",
        fontWeight: 600,
        cursor: pending ? "not-allowed" : "pointer",
        fontFamily: "inherit",
      }}
    >
      {pending ? "Removing…" : "Remove schedule"}
    </button>
  );
}

export default function SchedulePanel({
  jobId,
  returnTo,
  scheduledDate,
  windowStart,
  windowEnd,
  action,
}: SchedulePanelProps) {
  const [open, setOpen] = useState(false);
  const hasSchedule = Boolean(scheduledDate);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
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
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="2" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 1v3M11 1v3M1 6h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {hasSchedule ? "Reschedule" : "Schedule"}
      </button>
    );
  }

  return (
    <div
      style={{
        marginTop: "12px",
        padding: "16px",
        borderRadius: "12px",
        border: "1px solid oklch(0.9 0.006 250)",
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "14px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-ibm-plex-mono), monospace",
            fontSize: "11px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "oklch(0.55 0.015 262)",
            fontWeight: 600,
          }}
        >
          {hasSchedule ? "Reschedule" : "Schedule visit"}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: "12px",
            color: "oklch(0.55 0.015 262)",
            fontFamily: "inherit",
            padding: "2px 6px",
          }}
        >
          Cancel
        </button>
      </div>

      <form action={action} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <input type="hidden" name="id" value={jobId} />
        <input type="hidden" name="return_to" value={returnTo} />

        <div>
          <label
            style={{
              display: "block",
              fontFamily: "var(--font-ibm-plex-mono), monospace",
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "oklch(0.62 0.015 262)",
              fontWeight: 600,
              marginBottom: "5px",
            }}
          >
            Date
          </label>
          <input
            type="date"
            name="scheduled_date"
            defaultValue={scheduledDate ?? ""}
            style={{
              width: "100%",
              height: "36px",
              borderRadius: "8px",
              border: "1px solid oklch(0.88 0.006 250)",
              padding: "0 10px",
              fontSize: "13px",
              fontFamily: "inherit",
              color: "oklch(0.27 0.02 262)",
              background: "#fff",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label
              style={{
                display: "block",
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "oklch(0.62 0.015 262)",
                fontWeight: 600,
                marginBottom: "5px",
              }}
            >
              Window start
            </label>
            <input
              type="time"
              name="window_start"
              defaultValue={windowStart ?? ""}
              style={{
                width: "100%",
                height: "36px",
                borderRadius: "8px",
                border: "1px solid oklch(0.88 0.006 250)",
                padding: "0 10px",
                fontSize: "13px",
                fontFamily: "inherit",
                color: "oklch(0.27 0.02 262)",
                background: "#fff",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "oklch(0.62 0.015 262)",
                fontWeight: 600,
                marginBottom: "5px",
              }}
            >
              Window end
            </label>
            <input
              type="time"
              name="window_end"
              defaultValue={windowEnd ?? ""}
              style={{
                width: "100%",
                height: "36px",
                borderRadius: "8px",
                border: "1px solid oklch(0.88 0.006 250)",
                padding: "0 10px",
                fontSize: "13px",
                fontFamily: "inherit",
                color: "oklch(0.27 0.02 262)",
                background: "#fff",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "4px" }}>
          <SaveButton />
        </div>
      </form>

      {hasSchedule && (
        <form action={action} style={{ marginTop: "10px" }}>
          <input type="hidden" name="id" value={jobId} />
          <input type="hidden" name="return_to" value={returnTo} />
          <input type="hidden" name="unschedule" value="1" />
          <UnscheduleButton />
        </form>
      )}
    </div>
  );
}
