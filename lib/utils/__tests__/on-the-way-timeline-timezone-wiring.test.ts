import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("On the way timeline timestamp display", () => {
  it("uses the shared app timezone formatter for timeline event timestamps", () => {
    const source = readFileSync(
      join(process.cwd(), "app/jobs/[id]/_components/DeferredTimelineBody.tsx"),
      "utf8",
    );

    expect(source).toContain('formatTimestampDateTimeDisplayLA(String(e.created_at))');
    expect(source).toContain('on_my_way: "Technician marked On the Way"');
    expect(source).not.toMatch(/function\s+formatDateTimeLAFromIso/);
    expect(source).not.toMatch(/new Intl\.DateTimeFormat\("en-US",[\s\S]*timeZone:\s*"America\/Los_Angeles"/);
  });
});
