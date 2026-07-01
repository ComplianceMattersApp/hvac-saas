"use client";

import { useState } from "react";
import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";

type ServerAction = (formData: FormData) => void | Promise<void>;

type ModeId = "on_hold" | "waiting_on_part" | "waiting_on_approval" | "waiting_on_info";

const MODES: Array<{
  id: ModeId;
  label: string;
  desc: string;
  placeholder: string | null;
  interruptState: string;
  waitingStateType?: string;
}> = [
  {
    id: "on_hold",
    label: "On Hold",
    desc: "Admin hold — office decides next step.",
    placeholder: "Why on hold? e.g. pending supervisor decision…",
    interruptState: "on_hold",
  },
  {
    id: "waiting_on_part",
    label: "Waiting on Part",
    desc: "Material needed — enables ordered → arrived tracking.",
    placeholder: null,
    interruptState: "waiting",
    waitingStateType: "waiting_on_part",
  },
  {
    id: "waiting_on_approval",
    label: "Waiting on Approval",
    desc: "Customer or stakeholder approval required.",
    placeholder: null,
    interruptState: "waiting",
    waitingStateType: "waiting_on_customer_approval",
  },
  {
    id: "waiting_on_info",
    label: "Waiting on Info",
    desc: "Need more information before work can continue.",
    placeholder: null,
    interruptState: "waiting",
    waitingStateType: "waiting_on_information",
  },
];

export default function InterruptionHub({
  jobId,
  returnTo,
  action,
}: {
  jobId: string;
  returnTo: string;
  action: ServerAction;
}) {
  const [mode, setMode] = useState<ModeId | null>(null);
  const [reason, setReason] = useState("");

  const handleToggle = (m: ModeId) => {
    if (mode === m) {
      setMode(null);
    } else {
      setMode(m);
      setReason("");
    }
  };

  const sel = MODES.find((m) => m.id === mode) ?? null;

  return (
    <div>
      {/* 2×2 mode selector */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px" }}>
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => handleToggle(m.id)}
              style={{
                textAlign: "left",
                padding: "11px 13px",
                borderRadius: "9px",
                border: `1px solid ${active ? "oklch(0.72 0.15 70)" : "oklch(0.91 0.006 250)"}`,
                background: active ? "oklch(0.97 0.03 75)" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all .1s",
              }}
            >
              <span
                style={{
                  display: "block",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  color: active ? "oklch(0.5 0.12 65)" : "oklch(0.32 0.02 262)",
                }}
              >
                {m.label}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: "11px",
                  color: "oklch(0.58 0.015 262)",
                  marginTop: "2px",
                  lineHeight: 1.35,
                }}
              >
                {m.desc}
              </span>
            </button>
          );
        })}
      </div>

      {/* confirmation form — appears below grid when a mode is selected */}
      {sel ? (
        <form
          action={action}
          style={{
            marginTop: "10px",
            padding: "13px 14px",
            borderRadius: "9px",
            background: "oklch(0.97 0.03 75)",
            border: "1px solid oklch(0.88 0.1 70)",
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="return_to" value={returnTo} />
          <input type="hidden" name="interrupt_state" value={sel.interruptState} />
          {sel.waitingStateType ? (
            <input type="hidden" name="waiting_state_type" value={sel.waitingStateType} />
          ) : null}
          {/* on_hold: status_reason carries user text (or default fallback) */}
          {sel.interruptState === "on_hold" ? (
            <input type="hidden" name="status_reason" value={reason.trim() || "On hold — office decision needed."} />
          ) : null}

          {sel.placeholder ? (
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={sel.placeholder}
              style={{
                flex: 1,
                height: "32px",
                borderRadius: "7px",
                border: "1px solid oklch(0.88 0.1 70)",
                padding: "0 10px",
                fontSize: "12.5px",
                fontFamily: "inherit",
                color: "oklch(0.33 0.02 262)",
                background: "#fff",
                minWidth: 0,
              } as React.CSSProperties}
            />
          ) : (
            <span
              style={{
                flex: 1,
                fontSize: "12.5px",
                fontWeight: 500,
                color: "oklch(0.5 0.12 65)",
              }}
            >
              {sel.label} — confirm to place.
            </span>
          )}

          <ImmediateSubmitButton
            pendingText="Saving…"
            className=""
            style={{
              height: "32px",
              padding: "0 16px",
              borderRadius: "7px",
              border: "none",
              background: "oklch(0.55 0.15 70)",
              color: "#fff",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              flexShrink: 0,
            } as React.CSSProperties}
          >
            Place Hold
          </ImmediateSubmitButton>
        </form>
      ) : null}
    </div>
  );
}
