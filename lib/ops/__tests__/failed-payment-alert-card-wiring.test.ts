import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

describe("/ops failed payment alert card wiring", () => {
  it("does not expose retry action from the alert card", () => {
    expect(opsPageSource).not.toContain("Retry saved card");
    expect(opsPageSource).not.toContain("retryFailedScheduledAutopayAttemptFromForm");
  });
});
