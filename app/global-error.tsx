"use client";

import { useEffect, useState } from "react";
import { isSessionInvalidError } from "@/lib/auth/session-error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [sessionInvalid] = useState(() => isSessionInvalidError(error));

  useEffect(() => {
    if (!sessionInvalid) return;

    const next = window.location.pathname || "/";
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
  }, [sessionInvalid]);

  return (
    <html lang="en">
      <body>
        <div style={{ maxWidth: "48rem", margin: "0 auto", padding: "4rem 1rem" }}>
          {sessionInvalid ? (
            <div
              style={{
                borderRadius: "0.5rem",
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                padding: "1.5rem",
                color: "#334155",
              }}
            >
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#0f172a" }}>
                Your session has expired.
              </h2>
              <p style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
                Redirecting you to log in again...
              </p>
            </div>
          ) : (
            <div
              style={{
                borderRadius: "0.5rem",
                border: "1px solid #fde68a",
                background: "#fffbeb",
                padding: "1.5rem",
                color: "#78350f",
              }}
            >
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Something went wrong.</h2>
              <p style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
                We hit an unexpected error loading the app. Please try again, or head back home if it keeps
                happening.
              </p>
              <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => reset()}
                  style={{
                    borderRadius: "0.5rem",
                    border: "1px solid #fde68a",
                    background: "#ffffff",
                    padding: "0.5rem 0.75rem",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Try again
                </button>
                <a
                  href="/"
                  style={{
                    borderRadius: "0.5rem",
                    border: "1px solid #fde68a",
                    background: "#ffffff",
                    padding: "0.5rem 0.75rem",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  Back home
                </a>
              </div>
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
