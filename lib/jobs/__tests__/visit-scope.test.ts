import { describe, expect, it } from "vitest";

import {
  buildVisitScopeReadModel,
  isVisitScopeItemId,
  parseVisitScopeItemsJson,
  sanitizeVisitScopeItems,
} from "@/lib/jobs/visit-scope";

describe("visit scope durable item ids", () => {
  it("assigns a durable UUID id to new items missing id", () => {
    const rows = sanitizeVisitScopeItems([
      {
        title: "Diagnose no cooling",
        details: "Primary service focus",
        kind: "primary",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBeTruthy();
    expect(isVisitScopeItemId(rows[0].id)).toBe(true);
  });

  it("preserves valid existing ids through parse/sanitize flow", () => {
    const existingId = "3fce53ea-faf6-44f9-a83b-d3fb3d9507e2";
    const rows = parseVisitScopeItemsJson(
      JSON.stringify([
        {
          id: existingId,
          title: "Inspect compressor",
          details: "Check amp draw",
          kind: "primary",
        },
      ]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(existingId);
  });

  it("keeps legacy rows without ids readable", () => {
    const readModel = buildVisitScopeReadModel("Legacy summary", [
      {
        title: "Legacy title",
        details: null,
        kind: "primary",
      },
    ]);

    expect(readModel.hasContent).toBe(true);
    expect(readModel.items).toHaveLength(1);
    expect(readModel.items[0].title).toBe("Legacy title");
    expect(isVisitScopeItemId(readModel.items[0].id)).toBe(true);
  });

  it("handles malformed ids safely by replacing with generated UUID", () => {
    const rows = sanitizeVisitScopeItems([
      {
        id: "not-a-uuid",
        title: "Verify airflow",
        details: null,
        kind: "primary",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe("not-a-uuid");
    expect(isVisitScopeItemId(rows[0].id)).toBe(true);
  });

  it("preserves companion service linkage fields", () => {
    const id = "9dbabf3e-9e81-44da-95cb-f0cf1a9fba38";
    const rows = sanitizeVisitScopeItems([
      {
        id,
        title: "Filter replacement",
        details: "Add follow-up service item",
        kind: "companion_service",
        promoted_service_job_id: "job-123",
        promoted_at: "2026-04-28T10:20:30.000Z",
        promoted_by_user_id: "user-123",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      kind: "companion_service",
      promoted_service_job_id: "job-123",
      promoted_at: "2026-04-28T10:20:30.000Z",
      promoted_by_user_id: "user-123",
    });
  });
});
