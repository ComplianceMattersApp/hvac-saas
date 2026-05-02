import { describe, expect, it } from "vitest";

import {
  buildEstimateDocumentViewModel,
  ESTIMATE_DOCUMENT_DISCLAIMERS,
  ESTIMATE_REVISION_PLANNING_DEFAULTS,
} from "@/lib/estimates/estimate-document";
import type { EstimateReadResult } from "@/lib/estimates/estimate-read";

function buildEstimateFixture(): EstimateReadResult {
  return {
    id: "est-1",
    account_owner_user_id: "owner-1",
    estimate_number: "EST-20260501-ABC12345",
    customer_id: "cust-1",
    location_id: "loc-1",
    service_case_id: null,
    origin_job_id: null,
    status: "sent",
    title: "Spring rooftop package",
    notes: "Internal proposed package",
    subtotal_cents: 80000,
    total_cents: 80000,
    sent_at: "2026-05-01T12:00:00.000Z",
    approved_at: null,
    declined_at: null,
    expired_at: null,
    cancelled_at: null,
    converted_at: null,
    created_by_user_id: "u-1",
    updated_by_user_id: "u-1",
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-01T12:00:00.000Z",
    line_items: [
      {
        id: "line-1",
        estimate_id: "est-1",
        sort_order: 1,
        source_pricebook_item_id: "pb-1",
        item_name_snapshot: "Rooftop compressor replacement",
        description_snapshot: "Includes labor and startup test",
        item_type_snapshot: "service",
        category_snapshot: "HVAC",
        unit_label_snapshot: "ea",
        quantity: 1,
        unit_price_cents: 65000,
        line_subtotal_cents: 65000,
        created_at: "2026-05-01T10:00:00.000Z",
        updated_at: "2026-05-01T10:00:00.000Z",
      },
      {
        id: "line-2",
        estimate_id: "est-1",
        sort_order: 2,
        source_pricebook_item_id: "pb-2",
        item_name_snapshot: "Permit allowance",
        description_snapshot: null,
        item_type_snapshot: "material",
        category_snapshot: "Permits",
        unit_label_snapshot: "ea",
        quantity: 1,
        unit_price_cents: 15000,
        line_subtotal_cents: 15000,
        created_at: "2026-05-01T10:00:00.000Z",
        updated_at: "2026-05-01T10:00:00.000Z",
      },
    ],
  };
}

describe("buildEstimateDocumentViewModel", () => {
  it("builds stable estimate identity, context, line snapshots, totals, and lifecycle metadata", () => {
    const vm = buildEstimateDocumentViewModel({
      estimate: buildEstimateFixture(),
      customerName: "Atlas Foods",
      locationDisplay: "Main Plant",
    });

    expect(vm.identity).toEqual({
      estimateId: "est-1",
      estimateNumber: "EST-20260501-ABC12345",
      title: "Spring rooftop package",
      status: "sent",
      statusLabel: "Sent",
    });
    expect(vm.context).toEqual({
      customerName: "Atlas Foods",
      locationDisplay: "Main Plant",
    });
    expect(vm.lifecycle).toEqual({
      createdAt: "2026-05-01T10:00:00.000Z",
      sentAt: "2026-05-01T12:00:00.000Z",
      updatedAt: "2026-05-01T12:00:00.000Z",
    });
    expect(vm.totals).toEqual({
      subtotalCents: 80000,
      totalCents: 80000,
    });
    expect(vm.lines).toHaveLength(2);
    expect(vm.lines[0]).toMatchObject({
      id: "line-1",
      sortOrder: 1,
      itemName: "Rooftop compressor replacement",
      itemType: "service",
      quantity: 1,
      unitPriceCents: 65000,
      lineSubtotalCents: 65000,
    });
  });
});

describe("ESTIMATE_DOCUMENT_DISCLAIMERS", () => {
  it("includes required truth-boundary language", () => {
    const joined = ESTIMATE_DOCUMENT_DISCLAIMERS.join(" ").toLowerCase();
    expect(joined).toContain("proposed commercial scope");
    expect(joined).toContain("not customer approval");
    expect(joined).toContain("not invoice issuance");
    expect(joined).toContain("not payment collection");
    expect(joined).toContain("not delivery/read confirmation");
    expect(joined).toContain("invoice/payment remain separate downstream truths");
  });
});

describe("ESTIMATE_REVISION_PLANNING_DEFAULTS", () => {
  it("matches V1I planning defaults", () => {
    expect(ESTIMATE_REVISION_PLANNING_DEFAULTS).toEqual({
      freezeTrigger: "send_attempt_created",
      historyPolicy: "immutable",
      postFreezeEditPolicy: "new_revision_required",
    });
  });
});