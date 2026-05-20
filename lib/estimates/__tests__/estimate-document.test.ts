import { describe, expect, it } from "vitest";

import {
  buildEstimateDocumentViewModel,
  buildEstimateQuoteReadinessChecklist,
  ESTIMATE_DOCUMENT_DISCLAIMERS,
  ESTIMATE_REVISION_PLANNING_DEFAULTS,
} from "@/lib/estimates/estimate-document";
import type { EstimateReadResult } from "@/lib/estimates/estimate-read";

import type { EstimateOptionReadResult } from "@/lib/estimates/estimate-read";

function buildOptionFixture(overrides: Partial<EstimateOptionReadResult> = {}): EstimateOptionReadResult {
  return {
    id: "opt-1",
    estimate_id: "est-1",
    slot_index: 1,
    default_label_key: "good",
    label: "Good",
    sort_order: 1,
    summary: "Entry-level scope",
    notes: "Internal notes only — not for print",
    subtotal_cents: 30000,
    total_cents: 30000,
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
    line_items: [
      {
        id: "optline-1",
        estimate_option_id: "opt-1",
        estimate_id: "est-1",
        sort_order: 1,
        source_pricebook_item_id: null,
        item_name_snapshot: "Coil clean",
        description_snapshot: "Includes coil clean and rinse",
        item_type_snapshot: "service",
        category_snapshot: "HVAC",
        unit_label_snapshot: "ea",
        quantity: 1,
        unit_price_cents: 30000,
        line_subtotal_cents: 30000,
        created_at: "2026-05-01T10:00:00.000Z",
        updated_at: "2026-05-01T10:00:00.000Z",
      },
    ],
    // approvalResponseSchemaReady: true, // Not part of EstimateOptionReadResult
    ...overrides,
  };
}

function buildMultiOptionEstimateFixture(): EstimateReadResult {
  return {
    id: "est-2",
    account_owner_user_id: "owner-1",
    estimate_number: "EST-20260501-XYZ99999",
    customer_id: "cust-1",
    location_id: "loc-1",
    service_case_id: null,
    origin_job_id: null,
    status: "draft",
    title: "Multi-option rooftop proposal",
    notes: null,
    subtotal_cents: 0,
    total_cents: 0,
    sent_at: null,
    approved_at: null,
    declined_at: null,
    expired_at: null,
    cancelled_at: null,
    converted_at: null,
    converted_job_id: null,
    converted_by_user_id: null,
    created_by_user_id: "u-1",
    updated_by_user_id: "u-1",
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
    proposalMode: "multi_option_packages",
    selected_option_id: null,
    selected_option_label_snapshot: null,
    selected_option_total_cents: null,
    response_note: null,
    line_items: [],
    options: [
      buildOptionFixture({ id: "opt-1", slot_index: 1, label: "Good", sort_order: 1, total_cents: 30000 }),
      buildOptionFixture({
        id: "opt-2",
        slot_index: 2,
        default_label_key: "better",
        label: "Better",
        sort_order: 2,
        summary: "Mid-tier scope",
        notes: "Better internal notes",
        subtotal_cents: 50000,
        total_cents: 50000,
        line_items: [
          {
            id: "optline-2",
            estimate_option_id: "opt-2",
            estimate_id: "est-2",
            sort_order: 1,
            source_pricebook_item_id: "pb-10",
            item_name_snapshot: "Coil clean + refrigerant check",
            description_snapshot: null,
            item_type_snapshot: "service",
            category_snapshot: "HVAC",
            unit_label_snapshot: "ea",
            quantity: 1,
            unit_price_cents: 50000,
            line_subtotal_cents: 50000,
            created_at: "2026-05-01T10:00:00.000Z",
            updated_at: "2026-05-01T10:00:00.000Z",
          },
        ],
      }),
      buildOptionFixture({
        id: "opt-3",
        slot_index: 3,
        default_label_key: "best",
        label: "Best",
        sort_order: 3,
        summary: null,
        notes: null,
        subtotal_cents: 0,
        total_cents: 0,
        line_items: [],
      }),
    ],
    approvalResponseSchemaReady: true,
    conversionSchemaReady: true,
  };
}

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
    notes: null,
    subtotal_cents: 80000,
    total_cents: 80000,
    sent_at: "2026-05-01T12:00:00.000Z",
    approved_at: null,
    declined_at: null,
    expired_at: null,
    cancelled_at: null,
    converted_at: null,
    converted_job_id: null,
    converted_by_user_id: null,
    created_by_user_id: "u-1",
    updated_by_user_id: "u-1",
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-01T12:00:00.000Z",
    proposalMode: "single_option_flat",
    selected_option_id: null,
    selected_option_label_snapshot: null,
    selected_option_total_cents: null,
    response_note: null,
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
    options: [],
    approvalResponseSchemaReady: true,
    conversionSchemaReady: true,
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

describe("buildEstimateQuoteReadinessChecklist", () => {
  it("marks all checklist rows ready for a well-formed internal estimate", () => {
    const documentView = buildEstimateDocumentViewModel({
      estimate: buildEstimateFixture(),
      customerName: "Atlas Foods",
      locationDisplay: "Main Plant",
    });

    const checklist = buildEstimateQuoteReadinessChecklist({
      documentView,
      scopeSummary: "Replace rooftop package and startup.",
      customerEmail: "ops@atlasfoods.com",
      isEmailSendEnabled: false,
    });

    expect(checklist.attentionCount).toBe(0);
    expect(checklist.readyCount).toBe(7);
    expect(checklist.items).toHaveLength(7);
    expect(checklist.items.find((item) => item.key === "recipient_email")?.status).toBe("ready");
    expect(checklist.items.find((item) => item.key === "internal_manual_boundary")?.detail.toLowerCase()).toContain("email send is disabled");
  });

  it("surfaces attention for missing context, lines, zero total, and recipient email", () => {
    const estimate = buildEstimateFixture();
    estimate.title = "";
    estimate.total_cents = 0;
    estimate.subtotal_cents = 0;
    estimate.line_items = [];
    const documentView = buildEstimateDocumentViewModel({
      estimate,
      customerName: null,
      locationDisplay: null,
    });

    const checklist = buildEstimateQuoteReadinessChecklist({
      documentView,
      scopeSummary: null,
      customerEmail: null,
      isEmailSendEnabled: true,
    });

    expect(checklist.attentionCount).toBe(5);
    expect(checklist.readyCount).toBe(2);
    expect(checklist.items.find((item) => item.key === "customer_location_context")?.status).toBe("attention");
    expect(checklist.items.find((item) => item.key === "title_scope_summary")?.status).toBe("attention");
    expect(checklist.items.find((item) => item.key === "line_items")?.status).toBe("attention");
    expect(checklist.items.find((item) => item.key === "total_amount")?.status).toBe("attention");
    expect(checklist.items.find((item) => item.key === "recipient_email")?.status).toBe("attention");
    expect(checklist.items.find((item) => item.key === "internal_manual_boundary")?.status).toBe("ready");
  });
});

describe("buildEstimateDocumentViewModel � proposalMode", () => {
  it("single_option_flat estimate has proposalMode 'single_option_flat' and empty options array", () => {
    const vm = buildEstimateDocumentViewModel({
      estimate: buildEstimateFixture(),
    });
    expect(vm.proposalMode).toBe("single_option_flat");
    expect(vm.options).toEqual([]);
  });

  it("multi_option_packages estimate has proposalMode 'multi_option_packages' and mapped options", () => {
    const vm = buildEstimateDocumentViewModel({
      estimate: buildMultiOptionEstimateFixture(),
    });
    expect(vm.proposalMode).toBe("multi_option_packages");
    expect(vm.options).toHaveLength(3);
  });

  it("options are mapped in sort order with correct shape", () => {
    const vm = buildEstimateDocumentViewModel({
      estimate: buildMultiOptionEstimateFixture(),
    });
    expect(vm.options[0]).toMatchObject({
      id: "opt-1",
      slotIndex: 1,
      label: "Good",
      summary: "Entry-level scope",
      subtotalCents: 30000,
      totalCents: 30000,
    });
    expect(vm.options[1]).toMatchObject({
      id: "opt-2",
      slotIndex: 2,
      label: "Better",
      summary: "Mid-tier scope",
      subtotalCents: 50000,
      totalCents: 50000,
    });
  });

  it("option notes are excluded from view model", () => {
    const vm = buildEstimateDocumentViewModel({
      estimate: buildMultiOptionEstimateFixture(),
    });
    for (const opt of vm.options) {
      expect(opt).not.toHaveProperty("notes");
    }
  });

  it("option summary is included when present and null when absent", () => {
    const vm = buildEstimateDocumentViewModel({
      estimate: buildMultiOptionEstimateFixture(),
    });
    expect(vm.options[0].summary).toBe("Entry-level scope");
    expect(vm.options[2].summary).toBeNull();
  });

  it("option line items are mapped with correct shape including descriptions", () => {
    const vm = buildEstimateDocumentViewModel({
      estimate: buildMultiOptionEstimateFixture(),
    });
    const goodLines = vm.options[0].lines;
    expect(goodLines).toHaveLength(1);
    expect(goodLines[0]).toMatchObject({
      id: "optline-1",
      sortOrder: 1,
      itemName: "Coil clean",
      description: "Includes coil clean and rinse",
      itemType: "service",
      quantity: 1,
      unitPriceCents: 30000,
      lineSubtotalCents: 30000,
    });
  });

  it("option with null description is represented safely", () => {
    const vm = buildEstimateDocumentViewModel({
      estimate: buildMultiOptionEstimateFixture(),
    });
    const betterLines = vm.options[1].lines;
    expect(betterLines[0].description).toBeNull();
  });

  it("empty option renders with empty lines array", () => {
    const vm = buildEstimateDocumentViewModel({
      estimate: buildMultiOptionEstimateFixture(),
    });
    const bestOption = vm.options[2];
    expect(bestOption.label).toBe("Best");
    expect(bestOption.lines).toHaveLength(0);
    expect(bestOption.totalCents).toBe(0);
  });

  it("parent estimate totals are not derived from option totals in the view model", () => {
    const vm = buildEstimateDocumentViewModel({
      estimate: buildMultiOptionEstimateFixture(),
    });
    expect(vm.totals.totalCents).toBe(0);
    expect(vm.totals.subtotalCents).toBe(0);
    expect(vm.options[0].totalCents).toBe(30000);
    expect(vm.options[1].totalCents).toBe(50000);
  });

  it("flat estimate lines are preserved unchanged for single_option_flat", () => {
    const vm = buildEstimateDocumentViewModel({
      estimate: buildEstimateFixture(),
      customerName: "Atlas Foods",
    });
    expect(vm.lines).toHaveLength(2);
    expect(vm.lines[0].itemName).toBe("Rooftop compressor replacement");
    expect(vm.lines[1].itemName).toBe("Permit allowance");
  });

  it("multi_option estimate has empty flat lines array", () => {
    const vm = buildEstimateDocumentViewModel({
      estimate: buildMultiOptionEstimateFixture(),
    });
    expect(vm.lines).toHaveLength(0);
  });
});