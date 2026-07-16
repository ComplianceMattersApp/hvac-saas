import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const actions = readFileSync(resolve(__dirname, "../qbo-sync-actions.ts"), "utf8");
const sync = readFileSync(resolve(__dirname, "../../qbo/qbo-payment-sync.ts"), "utf8");

describe("QBO payment retry persistence", () => {
  it("keeps admin authorization and uses service scope only after authorization", () => {
    expect(actions).toContain('requireInternalRole("admin"');
    expect(actions).toContain("supabase: createAdminClient()");
    expect(actions).toContain("syncAttentionPaymentToQboFromForm");
  });

  it("does not silently ignore payment sync status write failures", () => {
    expect(sync).toContain("Failed to persist QBO payment sync status");
  });
});
