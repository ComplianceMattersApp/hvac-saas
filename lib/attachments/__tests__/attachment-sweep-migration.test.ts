import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("attachment sweep migration", () => {
  it("grants the cron service role access without reopening the RPC publicly", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../../supabase/migrations/20260818020000_grant_attachment_sweep_to_service_role.sql",
      ),
      "utf8",
    );

    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.sweep_abandoned_attachment_uploads\(interval, integer\)\s+TO service_role;/i,
    );
    expect(migration).not.toMatch(/TO\s+(PUBLIC|anon|authenticated)/i);
  });
});
