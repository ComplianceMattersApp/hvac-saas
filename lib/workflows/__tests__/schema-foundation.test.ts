import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260530180000_workflow_presets_slice_b_foundation.sql",
);

function migrationSql() {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("workflow presets slice B schema foundation", () => {
  it("adds required workflow tables and milestone statuses", () => {
    const sql = migrationSql();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.workflow_preset_templates");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.workflow_instances");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.workflow_instance_milestones");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.workflow_instance_job_links");

    expect(sql).toContain("'planned'");
    expect(sql).toContain("'ready'");
    expect(sql).toContain("'in_progress'");
    expect(sql).toContain("'completed'");
    expect(sql).toContain("'skipped'");
    expect(sql).toContain("'blocked'");
    expect(sql).toContain("'waiting'");
    expect(sql).toContain("'needs_attention'");
    expect(sql).toContain("'superseded'");
  });

  it("keeps source-of-truth boundaries by avoiding workflow_instance_events and job status writes", () => {
    const sql = migrationSql().toLowerCase();

    expect(sql).not.toContain("workflow_instance_events");
    expect(sql).not.toContain("update public.jobs set ops_status");
    expect(sql).not.toContain("update public.jobs set status");
    expect(sql).not.toContain("insert into public.job_events");
  });
});