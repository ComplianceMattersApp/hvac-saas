import { describe, expect, it } from "vitest";

import {
  buildLatestCustomerAttemptByJob,
  formatRecentAttemptDateTime,
  resolveRecentAttemptDisplay,
} from "@/lib/ops/recent-attempt-display";

describe("recent attempt display", () => {
  it("keeps only the latest attempt per job", () => {
    const latest = buildLatestCustomerAttemptByJob([
      { job_id: "job-1", created_at: "2026-05-18T16:30:00.000Z" },
      { job_id: "job-1", created_at: "2026-05-18T20:30:00.000Z" },
      { job_id: "job-2", created_at: "2026-05-18T19:00:00.000Z" },
    ]);

    expect(latest.get("job-1")).toBe("2026-05-18T20:30:00.000Z");
    expect(latest.get("job-2")).toBe("2026-05-18T19:00:00.000Z");
  });

  it("formats attempt timestamps as MM-DD-YYYY h:mm A in LA time", () => {
    const formatted = formatRecentAttemptDateTime("2026-05-18T20:30:00.000Z");
    expect(formatted).toBe("05-18-2026 1:30 PM");
  });

  it("returns fallback when attempt timestamp is missing", () => {
    expect(resolveRecentAttemptDisplay(null)).toBe("No attempts logged");
  });
});
