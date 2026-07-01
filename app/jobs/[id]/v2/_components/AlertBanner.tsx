"use client";

import { useState } from "react";

export default function AlertBanner({ message }: { message: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      style={{
        marginTop: "20px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "11px 16px",
        borderRadius: "11px",
        background: "oklch(0.97 0.03 150)",
        border: "1px solid oklch(0.89 0.05 150)",
      }}
    >
      <span
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: "oklch(0.6 0.14 150)",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          fontSize: "13px",
          fontWeight: 500,
          color: "oklch(0.4 0.05 150)",
        }}
      >
        {message}
      </span>
      <button
        onClick={() => setDismissed(true)}
        style={{
          border: "none",
          background: "none",
          cursor: "pointer",
          fontFamily: "var(--font-ibm-plex-mono), monospace",
          fontSize: "11px",
          fontWeight: 600,
          color: "oklch(0.5 0.04 150)",
          padding: 0,
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
