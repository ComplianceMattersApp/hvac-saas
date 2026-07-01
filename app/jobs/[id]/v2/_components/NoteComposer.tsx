"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type NoteComposerProps = {
  jobId: string;
  returnTo: string;
  internalAction: (formData: FormData) => Promise<void>;
  publicAction: (formData: FormData) => Promise<void>;
};

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        height: "42px",
        padding: "0 20px",
        borderRadius: "10px",
        border: "none",
        background: pending ? "oklch(0.5 0.08 262)" : "oklch(0.27 0.02 262)",
        color: "#fff",
        fontSize: "13px",
        fontWeight: 600,
        cursor: pending ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export default function NoteComposer({
  jobId,
  returnTo,
  internalAction,
  publicAction,
}: NoteComposerProps) {
  const [mode, setMode] = useState<"internal" | "shared">("internal");
  const [note, setNote] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isInternal = mode === "internal";
  const action = isInternal ? internalAction : publicAction;

  return (
    <form
      action={action}
      onSubmit={() => {
        setNote("");
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="tab" value="info" />
      {!isInternal && <input type="hidden" name="note_scope" value="shared" />}

      <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
        <textarea
          ref={textareaRef}
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={isInternal ? "Add an internal note…" : "Add a shared note for the customer…"}
          rows={1}
          style={{
            flex: 1,
            minHeight: "42px",
            padding: "10px 14px",
            border: "1px solid oklch(0.91 0.006 250)",
            borderRadius: "10px",
            fontSize: "13px",
            color: "oklch(0.33 0.02 262)",
            fontFamily: "inherit",
            resize: "vertical",
            outline: "none",
            lineHeight: 1.5,
            background: "#fff",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "oklch(0.7 0.05 255)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "oklch(0.91 0.006 250)";
          }}
        />

        <div
          style={{
            display: "flex",
            padding: "3px",
            borderRadius: "9px",
            background: "oklch(0.96 0.004 250)",
            border: "1px solid oklch(0.92 0.006 250)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setMode("internal")}
            style={{
              padding: "6px 12px",
              borderRadius: "7px",
              fontSize: "12px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              background: isInternal ? "#fff" : "transparent",
              color: isInternal ? "oklch(0.4 0.13 255)" : "oklch(0.55 0.015 262)",
              boxShadow: isInternal ? "0 1px 1px rgba(0,0,0,0.04)" : "none",
              transition: "background 0.1s, color 0.1s",
            }}
          >
            Internal
          </button>
          <button
            type="button"
            onClick={() => setMode("shared")}
            style={{
              padding: "6px 12px",
              borderRadius: "7px",
              fontSize: "12px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              background: !isInternal ? "#fff" : "transparent",
              color: !isInternal ? "oklch(0.4 0.13 255)" : "oklch(0.55 0.015 262)",
              boxShadow: !isInternal ? "0 1px 1px rgba(0,0,0,0.04)" : "none",
              transition: "background 0.1s, color 0.1s",
            }}
          >
            Shared
          </button>
        </div>

        <SaveButton label="Save" />
      </div>
    </form>
  );
}
