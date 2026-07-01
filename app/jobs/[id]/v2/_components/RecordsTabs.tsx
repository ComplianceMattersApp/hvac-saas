"use client";

import { useState } from "react";

const ACCENT = "oklch(0.55 0.17 255)";

export type RecordTab = {
  id: string;
  label: string;
  count: string;
  content: React.ReactNode;
};

export default function RecordsTabs({ tabs }: { tabs: RecordTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "timeline");

  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "2px",
          borderBottom: "1px solid oklch(0.93 0.005 250)",
          overflowX: "auto",
        }}
      >
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "9px 14px 11px",
                marginBottom: "-1px",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "13px",
                fontWeight: 600,
                whiteSpace: "nowrap",
                color: isActive ? "oklch(0.27 0.02 262)" : "oklch(0.55 0.015 262)",
                borderBottom: `2px solid ${isActive ? ACCENT : "transparent"}`,
              }}
            >
              {t.label}
              <span
                style={{
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: "5px",
                  background: isActive ? "oklch(0.96 0.025 255)" : "oklch(0.96 0.004 250)",
                  color: isActive ? "oklch(0.5 0.13 255)" : "oklch(0.6 0.015 262)",
                }}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ paddingTop: "16px" }}>{activeTab?.content}</div>
    </div>
  );
}
