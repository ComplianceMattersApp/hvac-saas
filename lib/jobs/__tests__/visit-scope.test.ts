import { describe, expect, it } from "vitest";

import {
  buildVisitScopeIncludesReadModel,
  buildVisitScopeReadModel,
  hasStructuredVisitScopeItemsJson,
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

  it("preserves optional pricebook metadata, quantity, and expected unit price", () => {
    const sourcePricebookId = "b98cf45f-6452-4ee6-ae94-3da666fd5218";
    const rows = sanitizeVisitScopeItems([
      {
        id: "41b4c6ff-c941-4911-8b5d-c9f196efa733",
        title: "Service Diagnostic",
        details: "Confirm control board behavior",
        kind: "primary",
        source_pricebook_item_id: sourcePricebookId,
        expected_unit_price: "89",
        expected_quantity: "11",
        unit_label: "each",
        item_type: "diagnostic",
        category: "Diagnostic",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_pricebook_item_id: sourcePricebookId,
      expected_unit_price: 89,
      expected_quantity: 11,
      unit_label: "each",
      item_type: "diagnostic",
      category: "Diagnostic",
    });
  });

  it("defaults legacy or invalid quantities to one", () => {
    const rows = sanitizeVisitScopeItems([
      { title: "Legacy", details: null, kind: "primary" },
      { title: "Zero", details: null, kind: "primary", expected_quantity: 0 },
      { title: "Fractional", details: null, kind: "primary", expected_quantity: 2.5 },
    ]);

    expect(rows.map((row) => row.expected_quantity)).toEqual([1, 1, 2.5]);
  });

  it("normalizes malformed expected unit price values safely", () => {
    const rows = sanitizeVisitScopeItems([
      {
        title: "Invalid negative",
        details: null,
        kind: "primary",
        expected_unit_price: -10,
      },
      {
        title: "Invalid text",
        details: null,
        kind: "primary",
        expected_unit_price: "abc",
      },
      {
        title: "Currency format",
        details: null,
        kind: "primary",
        expected_unit_price: "$129.995",
      },
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0].expected_unit_price).toBeNull();
    expect(rows[1].expected_unit_price).toBeNull();
    expect(rows[2].expected_unit_price).toBe(130);
  });

  it("treats prefilled structured service payload as valid", () => {
    const payload = JSON.stringify([
      {
        id: "41b4c6ff-c941-4911-8b5d-c9f196efa733",
        title: "Inspect condenser coil",
        details: "Capture photos and note any corrosion",
        kind: "primary",
        source_pricebook_item_id: "b98cf45f-6452-4ee6-ae94-3da666fd5218",
        expected_unit_price: 129,
        unit_label: "each",
        item_type: "service",
        category: "Maintenance",
      },
    ]);

    expect(hasStructuredVisitScopeItemsJson(payload)).toBe(true);
  });

  it("treats empty or malformed scope payload as invalid", () => {
    expect(hasStructuredVisitScopeItemsJson("[]")).toBe(false);
    expect(hasStructuredVisitScopeItemsJson("not-json")).toBe(false);
  });

  it("builds Includes label from primary work items when multiple items exist", () => {
    const readModel = buildVisitScopeIncludesReadModel("", [
      {
        title: "Duct Cleaning",
        details: null,
        kind: "primary",
      },
      {
        title: "Vent sealing",
        details: null,
        kind: "primary",
      },
      {
        title: "ECC context note",
        details: null,
        kind: "companion_service",
      },
    ]);

    expect(readModel.hasContent).toBe(true);
    expect(readModel.sourceItemCount).toBe(2);
    expect(readModel.label).toBe("Duct Cleaning + 1 more");
  });

  it("falls back to summary when no visit-scope items exist", () => {
    const readModel = buildVisitScopeIncludesReadModel("Diagnostic + Duct Cleaning", []);

    expect(readModel.hasContent).toBe(true);
    expect(readModel.sourceItemCount).toBe(0);
    expect(readModel.label).toBe("Diagnostic + Duct Cleaning");
  });

  it("returns no Includes label when summary and items are empty", () => {
    const readModel = buildVisitScopeIncludesReadModel(null, []);

    expect(readModel.hasContent).toBe(false);
    expect(readModel.label).toBe("");
  });
});
