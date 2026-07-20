import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260719120000_ai_global_usage_budget.sql"),
  "utf8",
).toLowerCase();

describe("global AI usage budget schema", () => {
  it("defaults to a global $25 monthly cap and records feature/account attribution", () => {
    expect(migration).toContain("default 25000000");
    expect(migration).toContain("create table if not exists public.ai_usage_events");
    expect(migration).toContain("account_owner_user_id uuid null");
    expect(migration).toContain("feature_key in ('estimate_coach', 'trainer', 'future_internal_assistant')");
  });

  it("atomically reserves under a locked singleton and settles only within the reservation", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("v_committed + p_estimated_cost_microusd > v_settings.monthly_limit_microusd");
    expect(migration).toContain("p_actual_cost_microusd > v_reserved");
    expect(migration).toContain("monthly_cap_reached");
  });

  it("keeps tables and budget RPCs service-role only", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.ai_usage_events from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.reserve_ai_usage_budget");
    expect(migration).toContain("to service_role");
    expect(migration).not.toContain("create policy");
  });
});
