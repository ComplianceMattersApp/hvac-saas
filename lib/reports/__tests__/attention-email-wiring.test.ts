import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const delivery = readFileSync(resolve(__dirname, "../attention-email-delivery.ts"), "utf8");
const route = readFileSync(resolve(__dirname, "../../../app/api/cron/attention-email/route.ts"), "utf8");
const migration = readFileSync(resolve(__dirname, "../../../supabase/migrations/20260716160000_attention_email_deliveries.sql"), "utf8");
const vercel = readFileSync(resolve(__dirname, "../../../vercel.json"), "utf8");

describe("Needs Attention email alerts", () => {
  it("uses a durable tenant-scoped snapshot claim to prevent duplicate email", () => {
    expect(delivery).toContain('createHash("sha256")');
    expect(delivery).toContain("snapshot_fingerprint");
    expect(migration).toContain("UNIQUE (account_owner_user_id, snapshot_fingerprint)");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  });
  it("sends only when attention exists and links to the hub", () => {
    expect(delivery).toContain("model.summaries.total <= 0");
    expect(delivery).toContain("/reports/attention");
    expect(delivery).toContain("sendEmail");
  });
  it("protects the hourly scanner with CRON_SECRET", () => {
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("Bearer ${secret}");
    expect(vercel).toContain('"0 * * * *"');
  });
});
