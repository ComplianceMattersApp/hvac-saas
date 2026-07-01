"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type PermitFormProps = {
  jobId: string;
  returnTo: string;
  currentPermitNumber: string | null;
  action: (formData: FormData) => Promise<void>;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        height: "34px",
        padding: "0 14px",
        borderRadius: "8px",
        border: "none",
        background: pending ? "oklch(0.7 0.08 255)" : "oklch(0.55 0.17 255)",
        color: "#fff",
        fontSize: "12.5px",
        fontWeight: 600,
        cursor: pending ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        flexShrink: 0,
      }}
    >
      {pending ? "Saving…" : "Save permit"}
    </button>
  );
}

export default function PermitForm({
  jobId,
  returnTo,
  currentPermitNumber,
  action,
}: PermitFormProps) {
  const [open, setOpen] = useState(false);
  const hasPermit = Boolean(currentPermitNumber);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
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
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        {hasPermit ? "Update Permit" : "Add Permit Number"}
      </button>
    );
  }

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "10px",
        border: "1px solid oklch(0.9 0.006 250)",
        background: "#fff",
        marginTop: "4px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-ibm-plex-mono), monospace",
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "oklch(0.55 0.015 262)",
            fontWeight: 600,
          }}
        >
          {hasPermit ? "Update permit" : "Add permit number"}
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

      <form action={action} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <input type="hidden" name="job_id" value={jobId} />
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
            Permit number <span style={{ color: "oklch(0.55 0.14 25)" }}>*</span>
          </label>
          <input
            type="text"
            name="permit_number"
            defaultValue={currentPermitNumber ?? ""}
            required
            placeholder="e.g. 2024-ECC-00123"
            autoFocus
            style={{
              width: "100%",
              height: "34px",
              borderRadius: "7px",
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
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
              Jurisdiction
            </label>
            <input
              type="text"
              name="jurisdiction"
              placeholder="City / county"
              style={{
                width: "100%",
                height: "34px",
                borderRadius: "7px",
                border: "1px solid oklch(0.88 0.006 250)",
                padding: "0 10px",
                fontSize: "12px",
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
              Permit date
            </label>
            <input
              type="date"
              name="permit_date"
              style={{
                width: "100%",
                height: "34px",
                borderRadius: "7px",
                border: "1px solid oklch(0.88 0.006 250)",
                padding: "0 10px",
                fontSize: "12px",
                fontFamily: "inherit",
                color: "oklch(0.27 0.02 262)",
                background: "#fff",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <SaveButton />
      </form>
    </div>
  );
}
