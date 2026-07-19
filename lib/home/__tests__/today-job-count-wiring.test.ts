import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../today-read-model.ts"),
  "utf8",
);

describe("Today scheduled-job count wiring", () => {
  it("counts the same incomplete jobs rendered by Today’s Work", () => {
    const scheduledCountStart = source.indexOf(
      'base(q)\n        .eq("scheduled_date", today)',
    );

    expect(scheduledCountStart).toBeGreaterThan(-1);

    const scheduledCountQuery = source.slice(
      scheduledCountStart,
      scheduledCountStart + 800,
    );

    expect(scheduledCountQuery).toContain('.neq("status", "cancelled")');
    expect(scheduledCountQuery).toContain(
      '.or("field_complete.eq.false,field_complete.is.null")',
    );
  });
});
