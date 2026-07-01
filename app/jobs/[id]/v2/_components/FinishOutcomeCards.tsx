"use client";

import { useState } from "react";
import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";

type ServerAction = (formData: FormData) => void | Promise<void>;

type OutcomeDef = {
  id: "done" | "parts" | "approval" | "unable";
  label: string;
  desc: string;
  tone: string;
  heading: string;
  detail: string;
  cta: string;
};

const OUTCOMES: OutcomeDef[] = [
  {
    id: "done",
    label: "Work Completed",
    desc: "Ready for closeout & billing.",
    tone: "oklch(0.58 0.13 150)",
    heading: "Routes to closeout",
    detail: "Job stays with you for invoice & certs review before it can close.",
    cta: "Complete Visit",
  },
  {
    id: "parts",
    label: "Parts Needed",
    desc: "Flag a return, tie to next visit.",
    tone: "oklch(0.66 0.14 68)",
    heading: "Routes to office · waiting on part",
    detail: "A return visit is suggested to dispatch. Mark part ordered → arrived to release.",
    cta: "Submit & Flag Return",
  },
  {
    id: "approval",
    label: "Approval Needed",
    desc: "Customer must approve to continue.",
    tone: "oklch(0.66 0.14 68)",
    heading: "Routes to office · waiting on approval",
    detail: "Office follows up with the customer. Job releases when approval is received.",
    cta: "Submit for Approval",
  },
  {
    id: "unable",
    label: "Unable to Complete",
    desc: "Needs an office decision.",
    tone: "oklch(0.58 0.18 25)",
    heading: "Routes to office · waiting on information",
    detail: "No return is auto-created. Dispatch decides the next step from the queue.",
    cta: "Submit Outcome",
  },
];

const NOTE_FIELD: Partial<Record<OutcomeDef["id"], string>> = {
  parts: "parts_note",
  approval: "approval_note",
  unable: "unable_note",
};

const NOTE_DEFAULT: Partial<Record<OutcomeDef["id"], string>> = {
  parts: "Parts needed — flagged from field.",
  approval: "Approval needed — flagged from field.",
  unable: "Unable to complete — flagged from field.",
};

const NOTE_PLACEHOLDER: Partial<Record<OutcomeDef["id"], string>> = {
  parts: "Which part? e.g. blower motor, capacitor…",
  approval: "Whose approval? e.g. homeowner, HOA, property manager…",
  unable: "Why unable? e.g. no access, needs permit, needs electrical work…",
};

const CARD_BORDER = "oklch(0.92 0.006 250)";

function colorMixWithWhite(oklchColor: string, percent: number) {
  return `color-mix(in oklch, ${oklchColor} ${percent}%, white)`;
}

type FinishOutcomeCardsProps = {
  jobId: string;
  returnTo: string;
  completeAction: ServerAction;
  partsAction: ServerAction;
  approvalAction: ServerAction;
  unableAction: ServerAction;
};

export default function FinishOutcomeCards({
  jobId,
  returnTo,
  completeAction,
  partsAction,
  approvalAction,
  unableAction,
}: FinishOutcomeCardsProps) {
  const [selected, setSelected] = useState<OutcomeDef["id"] | null>(null);
  const [noteText, setNoteText] = useState("");

  const actionMap: Record<OutcomeDef["id"], ServerAction> = {
    done: completeAction,
    parts: partsAction,
    approval: approvalAction,
    unable: unableAction,
  };

  const handleSelect = (id: OutcomeDef["id"]) => {
    if (selected === id) {
      setSelected(null);
    } else {
      setSelected(id);
      setNoteText("");
    }
  };

  const sel = OUTCOMES.find((o) => o.id === selected) ?? null;
  const noteField = sel ? NOTE_FIELD[sel.id] : undefined;
  const noteDefault = sel ? NOTE_DEFAULT[sel.id] : undefined;
  const notePlaceholder = sel ? NOTE_PLACEHOLDER[sel.id] : undefined;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px" }}>
        {OUTCOMES.map((o) => {
          const isSelected = selected === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => handleSelect(o.id)}
              style={{
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "14px",
                borderRadius: "11px",
                fontFamily: "inherit",
                transition: "all .12s",
                background: isSelected ? colorMixWithWhite(o.tone, 9) : "#fff",
                border: `1px solid ${isSelected ? o.tone : CARD_BORDER}`,
                boxShadow: isSelected ? `0 0 0 1px ${o.tone}` : "none",
              }}
            >
              <span
                style={{
                  width: "9px",
                  height: "9px",
                  borderRadius: "50%",
                  background: o.tone,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: "13.5px",
                  fontWeight: 700,
                  color: "oklch(0.27 0.02 262)",
                  marginTop: "8px",
                }}
              >
                {o.label}
              </span>
              <span
                style={{
                  fontSize: "11.5px",
                  lineHeight: 1.4,
                  color: "oklch(0.5 0.015 262)",
                  marginTop: "4px",
                }}
              >
                {o.desc}
              </span>
            </button>
          );
        })}
      </div>

      {sel ? (
        <form
          action={actionMap[sel.id]}
          style={{
            marginTop: "14px",
            padding: "14px 16px",
            borderRadius: "11px",
            background: colorMixWithWhite(sel.tone, 7),
            border: `1px solid ${colorMixWithWhite(sel.tone, 35)}`,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="return_to" value={returnTo} />

          {/* Note field: hidden carries the value (typed text or fallback constant) */}
          {noteField && noteDefault ? (
            <input
              type="hidden"
              name={noteField}
              value={noteText.trim() || noteDefault}
            />
          ) : null}

          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: "10px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: sel.tone,
                }}
              >
                {sel.heading}
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "oklch(0.35 0.02 262)",
                  marginTop: "4px",
                }}
              >
                {sel.detail}
              </div>
            </div>

            <ImmediateSubmitButton
              pendingText="Submitting..."
              className=""
              style={{
                height: "40px",
                padding: "0 20px",
                borderRadius: "10px",
                border: "none",
                background: sel.tone,
                color: "#fff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {sel.cta}
            </ImmediateSubmitButton>
          </div>

          {/* Optional free-text note for non-complete outcomes */}
          {notePlaceholder ? (
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={notePlaceholder}
              style={{
                width: "100%",
                height: "32px",
                borderRadius: "7px",
                border: `1px solid ${colorMixWithWhite(sel.tone, 50)}`,
                padding: "0 10px",
                fontSize: "12.5px",
                fontFamily: "inherit",
                color: "oklch(0.33 0.02 262)",
                background: "#fff",
                boxSizing: "border-box",
              }}
            />
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
