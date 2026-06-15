import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const waitingQueueSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/waiting/page.tsx"),
  "utf-8",
);

const exceptionsQueueSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/exceptions/page.tsx"),
  "utf-8",
);

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

const todayReadModelSource = readFileSync(
  resolve(__dirname, "../../home/today-read-model.ts"),
  "utf-8",
);

const fieldPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/field/page.tsx"),
  "utf-8",
);

const withoutTechSource = readFileSync(
  resolve(__dirname, "../../../app/ops/queues/without-tech/page.tsx"),
  "utf-8",
);

const calendarViewSource = readFileSync(
  resolve(__dirname, "../../../components/calendar/calendar-view.tsx"),
  "utf-8",
);

const notificationsSource = readFileSync(
  resolve(__dirname, "../../../app/ops/notifications/_components/NotificationListClient.tsx"),
  "utf-8",
);

describe("lifecycle aging slice 1 wiring", () => {
  it("applies lifecycle-aware labels to waiting queue", () => {
    expect(waitingQueueSource).toContain("resolveLifecycleAging");
    expect(waitingQueueSource).not.toContain("Age {ageLabel(job)}");
  });

  it("applies lifecycle-aware labels to exceptions queue", () => {
    expect(exceptionsQueueSource).toContain("resolveLifecycleAging");
    expect(exceptionsQueueSource).toContain("failedEvidenceAt");
  });

  it("applies lifecycle-aware labels to ops workspace cards", () => {
    expect(opsPageSource).toContain("resolveLifecycleDaysAgingLabel");
    expect(opsPageSource).toContain("workspaceAgeTime");
    expect(opsPageSource).toContain("workspaceAgeLabel");
    expect(opsPageSource).toContain("Days Aging:");
    expect(opsPageSource).not.toContain("Age/Time:");
    expect(opsPageSource).not.toContain('?? "-"');
  });

  it("applies lifecycle-aware labels to today follow-up preview", () => {
    expect(todayReadModelSource).toContain("resolveLifecycleAging");
    expect(todayReadModelSource).not.toContain("buildItemAgeDisplay");
    expect(todayReadModelSource).toContain("ageDisplay: lifecycleLabel");
  });

  it("keeps schedule-first and notification surfaces unchanged in this slice", () => {
    expect(fieldPageSource).not.toContain("resolveLifecycleAging");
    expect(withoutTechSource).not.toContain("resolveLifecycleAging");
    expect(calendarViewSource).not.toContain("resolveLifecycleAging");
    expect(notificationsSource).not.toContain("resolveLifecycleAging");
  });
});
