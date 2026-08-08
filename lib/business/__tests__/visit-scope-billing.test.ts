import { describe, expect, it } from "vitest";
import {
  buildInvoiceFamilyBillingView,
  buildUnlinkedInvoiceCharges,
  buildVisitScopeBilledLineMap,
  formatAddOnInvoiceLabel,
  resolveVisitScopeItemPriceDisplay,
} from "@/lib/business/visit-scope-billing";

const WORK_ITEM_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_WORK_ITEM_ID = "22222222-2222-4222-8222-222222222222";

describe("buildVisitScopeBilledLineMap", () => {
  it("keys visit-scope charges by the Work Item they were imported from", () => {
    const map = buildVisitScopeBilledLineMap([
      {
        source_kind: "visit_scope",
        source_visit_scope_item_id: WORK_ITEM_ID,
        quantity: 10,
        unit_price: 55,
        line_subtotal: 550,
      },
    ]);

    expect(map[WORK_ITEM_ID]).toEqual({
      quantity: 10,
      unitPriceCents: 5500,
      lineSubtotalCents: 55000,
    });
  });

  it("ignores manual and pricebook charges, which have no Work Item to reconcile against", () => {
    const map = buildVisitScopeBilledLineMap([
      { source_kind: "manual", source_visit_scope_item_id: null, quantity: 1, unit_price: 90, line_subtotal: 90 },
      { source_kind: "pricebook", source_visit_scope_item_id: null, quantity: 2, unit_price: 40, line_subtotal: 80 },
    ]);

    expect(map).toEqual({});
  });

  it("tolerates a missing line item list", () => {
    expect(buildVisitScopeBilledLineMap(null)).toEqual({});
    expect(buildVisitScopeBilledLineMap(undefined)).toEqual({});
  });
});

// Reconstructed from prod job ee6d5d4f… / invoice #2181: a pricebook-sourced Work
// Item saved with unit_price 0, imported and then edited to 8 x $45 on the invoice,
// alongside a $125 pricebook charge added directly to the invoice.
describe("prod invoice #2181 regression", () => {
  const WORK_ITEM = {
    id: "95221d64-3342-4280-a5d2-b07bdd6a6d91",
    title: "Air Duct Cleaning",
    expected_unit_price: 0,
    expected_quantity: 1,
  };
  const LINE_ITEMS = [
    {
      source_kind: "visit_scope",
      source_visit_scope_item_id: WORK_ITEM.id,
      source_job_id: "ee6d5d4f-468c-4ad0-bef6-cb6230332167",
      item_name_snapshot: "Air Duct Cleaning",
      quantity: 8,
      unit_price: 45,
      line_subtotal: 360,
    },
    {
      source_kind: "pricebook",
      source_visit_scope_item_id: null,
      source_job_id: "ee6d5d4f-468c-4ad0-bef6-cb6230332167",
      item_name_snapshot: "Anti-microbial Treatment & Filter Replacement",
      quantity: 1,
      unit_price: 125,
      line_subtotal: 125,
    },
  ];

  it("reports the billed charge instead of the Work Item's stored $0.00", () => {
    const display = resolveVisitScopeItemPriceDisplay({
      itemId: WORK_ITEM.id,
      expectedUnitPrice: WORK_ITEM.expected_unit_price,
      expectedQuantity: WORK_ITEM.expected_quantity,
      billedLines: buildVisitScopeBilledLineMap(LINE_ITEMS),
    });

    expect(display.state).toBe("billed");
    expect(display.amountText).toBe("$360.00");
    expect(display.mathText).toBe("8 × $45.00 = $360.00");
  });

  it("never renders a stored zero price as $0.00", () => {
    const display = resolveVisitScopeItemPriceDisplay({
      itemId: WORK_ITEM.id,
      expectedUnitPrice: 0,
      expectedQuantity: 1,
      billedLines: {},
    });

    expect(display.state).toBe("none");
    expect(display.amountText).toBeNull();
  });

  it("lists the work rows and the invoice-only charge to the invoice total", () => {
    const billed = buildVisitScopeBilledLineMap(LINE_ITEMS);
    const unlinked = buildUnlinkedInvoiceCharges({
      lineItems: LINE_ITEMS,
      jobId: "ee6d5d4f-468c-4ad0-bef6-cb6230332167",
    });

    expect(unlinked.map((charge) => charge.amountText)).toEqual(["$125.00"]);

    const rowTotalCents =
      billed[WORK_ITEM.id].lineSubtotalCents + 125_00;
    expect(rowTotalCents).toBe(485_00);
  });
});

describe("buildUnlinkedInvoiceCharges", () => {
  const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const OTHER_JOB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  // Mirrors prod invoice #2181: one imported Work Item plus a pricebook charge
  // added while building the invoice, which no Work Item accounts for.
  const LINE_ITEMS = [
    {
      source_kind: "visit_scope",
      source_visit_scope_item_id: WORK_ITEM_ID,
      source_job_id: JOB_ID,
      item_name_snapshot: "Air Duct Cleaning",
      quantity: 8,
      unit_price: 45,
      line_subtotal: 360,
    },
    {
      source_kind: "pricebook",
      source_visit_scope_item_id: null,
      source_job_id: JOB_ID,
      item_name_snapshot: "Anti-microbial Treatment & Filter Replacement",
      quantity: 1,
      unit_price: 125,
      line_subtotal: 125,
    },
  ];

  it("returns only charges no Work Item accounts for", () => {
    const charges = buildUnlinkedInvoiceCharges({ lineItems: LINE_ITEMS, jobId: JOB_ID });

    expect(charges).toEqual([
      {
        title: "Anti-microbial Treatment & Filter Replacement",
        amountText: "$125.00",
        mathText: null,
        sourceLabel: "Added on the invoice",
      },
    ]);
  });

  it("shows the quantity math for a multi-quantity charge", () => {
    const charges = buildUnlinkedInvoiceCharges({
      lineItems: [{ ...LINE_ITEMS[1], quantity: 3, line_subtotal: 375 }],
      jobId: JOB_ID,
    });

    expect(charges[0].mathText).toBe("3 × $125.00 = $375.00");
    expect(charges[0].amountText).toBe("$375.00");
  });

  it("excludes other jobs' charges on a consolidated invoice", () => {
    const charges = buildUnlinkedInvoiceCharges({
      lineItems: [{ ...LINE_ITEMS[1], source_job_id: OTHER_JOB_ID }],
      jobId: JOB_ID,
      isConsolidated: true,
    });

    expect(charges).toEqual([]);
  });

  it("keeps this job's charges on a consolidated invoice", () => {
    const charges = buildUnlinkedInvoiceCharges({
      lineItems: LINE_ITEMS,
      jobId: JOB_ID,
      isConsolidated: true,
    });

    expect(charges).toHaveLength(1);
    expect(charges[0].title).toBe("Anti-microbial Treatment & Filter Replacement");
  });

  it("treats a visit_scope line that lost its source id as unlinked", () => {
    const charges = buildUnlinkedInvoiceCharges({
      lineItems: [{ ...LINE_ITEMS[0], source_visit_scope_item_id: null }],
      jobId: JOB_ID,
    });

    expect(charges).toHaveLength(1);
    expect(charges[0].amountText).toBe("$360.00");
  });

  it("skips untitled lines and tolerates a missing list", () => {
    expect(
      buildUnlinkedInvoiceCharges({
        lineItems: [{ ...LINE_ITEMS[1], item_name_snapshot: "  " }],
        jobId: JOB_ID,
      }),
    ).toEqual([]);
    expect(buildUnlinkedInvoiceCharges({ lineItems: null, jobId: JOB_ID })).toEqual([]);
  });
});

describe("buildInvoiceFamilyBillingView", () => {
  const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const LATER_WORK_ITEM_ID = "33333333-3333-4333-8333-333333333333";

  const PRIMARY_LINES = [
    {
      source_kind: "visit_scope",
      source_visit_scope_item_id: WORK_ITEM_ID,
      source_job_id: JOB_ID,
      item_name_snapshot: "Air Duct Cleaning",
      quantity: 8,
      unit_price: 45,
      line_subtotal: 360,
    },
  ];

  const ADD_ON = {
    invoice_display_number: "2190",
    line_items: [
      {
        source_kind: "visit_scope",
        source_visit_scope_item_id: LATER_WORK_ITEM_ID,
        source_job_id: JOB_ID,
        item_name_snapshot: "Blower Motor Replacement",
        quantity: 1,
        unit_price: 480,
        line_subtotal: 480,
      },
      {
        source_kind: "manual",
        source_visit_scope_item_id: null,
        source_job_id: JOB_ID,
        item_name_snapshot: "After-hours trip fee",
        quantity: 1,
        unit_price: 95,
        line_subtotal: 95,
      },
    ],
  };

  it("marks a Work Item billed on an add-on as billed, not an estimate", () => {
    const view = buildInvoiceFamilyBillingView({
      jobId: JOB_ID,
      primaryLineItems: PRIMARY_LINES,
      addOnInvoices: [ADD_ON],
    });

    const display = resolveVisitScopeItemPriceDisplay({
      itemId: LATER_WORK_ITEM_ID,
      expectedUnitPrice: 0,
      billedLines: view.billedLines,
    });

    expect(display.state).toBe("billed");
    expect(display.amountText).toBe("$480.00");
  });

  it("keeps primary billing intact when add-ons exist", () => {
    const view = buildInvoiceFamilyBillingView({
      jobId: JOB_ID,
      primaryLineItems: PRIMARY_LINES,
      addOnInvoices: [ADD_ON],
    });

    expect(view.billedLines[WORK_ITEM_ID].lineSubtotalCents).toBe(36000);
  });

  it("labels each unlinked charge with the invoice it lives on", () => {
    const view = buildInvoiceFamilyBillingView({
      jobId: JOB_ID,
      primaryLineItems: [
        ...PRIMARY_LINES,
        {
          source_kind: "pricebook",
          source_visit_scope_item_id: null,
          source_job_id: JOB_ID,
          item_name_snapshot: "Filter",
          quantity: 1,
          unit_price: 40,
          line_subtotal: 40,
        },
      ],
      addOnInvoices: [ADD_ON],
    });

    expect(view.unlinkedCharges.map((charge) => [charge.title, charge.sourceLabel])).toEqual([
      ["Filter", "Added on the invoice"],
      ["After-hours trip fee", "Add-on invoice #2190"],
    ]);
  });

  it("lets a later add-on supersede an earlier charge for the same Work Item", () => {
    const view = buildInvoiceFamilyBillingView({
      jobId: JOB_ID,
      primaryLineItems: PRIMARY_LINES,
      addOnInvoices: [
        {
          invoice_display_number: "2190",
          line_items: [{ ...PRIMARY_LINES[0], quantity: 10, line_subtotal: 450 }],
        },
      ],
    });

    expect(view.billedLines[WORK_ITEM_ID].lineSubtotalCents).toBe(45000);
  });

  it("behaves like the primary-only view when there are no add-ons", () => {
    const view = buildInvoiceFamilyBillingView({
      jobId: JOB_ID,
      primaryLineItems: PRIMARY_LINES,
      addOnInvoices: [],
    });

    expect(view.billedLines).toEqual(buildVisitScopeBilledLineMap(PRIMARY_LINES));
    expect(view.unlinkedCharges).toEqual([]);
  });

  it("names an add-on with no display number generically", () => {
    expect(formatAddOnInvoiceLabel(null)).toBe("Add-on invoice");
    expect(formatAddOnInvoiceLabel("2190")).toBe("Add-on invoice #2190");
  });
});

describe("resolveVisitScopeItemPriceDisplay", () => {
  it("reports the billed charge, not the job's frozen capture price", () => {
    const display = resolveVisitScopeItemPriceDisplay({
      itemId: WORK_ITEM_ID,
      expectedUnitPrice: 55,
      expectedQuantity: 1,
      billedLines: {
        [WORK_ITEM_ID]: { quantity: 10, unitPriceCents: 5500, lineSubtotalCents: 55000 },
      },
    });

    expect(display.state).toBe("billed");
    expect(display.badgeLabel).toBe("Billed");
    expect(display.amountText).toBe("$550.00");
    expect(display.mathText).toBe("10 × $55.00 = $550.00");
  });

  it("omits the math line for a single-quantity billed charge", () => {
    const display = resolveVisitScopeItemPriceDisplay({
      itemId: WORK_ITEM_ID,
      expectedUnitPrice: 55,
      billedLines: {
        [WORK_ITEM_ID]: { quantity: 1, unitPriceCents: 5500, lineSubtotalCents: 5500 },
      },
    });

    expect(display.state).toBe("billed");
    expect(display.amountText).toBe("$55.00");
    expect(display.mathText).toBeNull();
  });

  it("marks an un-billed price as an estimate so it never reads as a total", () => {
    const display = resolveVisitScopeItemPriceDisplay({
      itemId: OTHER_WORK_ITEM_ID,
      expectedUnitPrice: 55,
      expectedQuantity: 1,
      billedLines: {
        [WORK_ITEM_ID]: { quantity: 10, unitPriceCents: 5500, lineSubtotalCents: 55000 },
      },
    });

    expect(display.state).toBe("estimate");
    expect(display.badgeLabel).toBeNull();
    expect(display.amountText).toBe("Est. $55.00");
  });

  it("extends an un-billed estimate by its captured quantity", () => {
    const display = resolveVisitScopeItemPriceDisplay({
      itemId: OTHER_WORK_ITEM_ID,
      expectedUnitPrice: 55,
      expectedQuantity: 10,
      billedLines: {},
    });

    expect(display.amountText).toBe("Est. $550.00");
    expect(display.mathText).toBe("10 × $55.00 = $550.00");
  });

  it("renders fractional quantities without dropping precision", () => {
    const display = resolveVisitScopeItemPriceDisplay({
      itemId: OTHER_WORK_ITEM_ID,
      expectedUnitPrice: 100,
      expectedQuantity: 2.5,
      billedLines: {},
    });

    expect(display.mathText).toBe("2.50 × $100.00 = $250.00");
    expect(display.amountText).toBe("Est. $250.00");
  });

  it("shows nothing when the Work Item was never priced", () => {
    const display = resolveVisitScopeItemPriceDisplay({
      itemId: OTHER_WORK_ITEM_ID,
      expectedUnitPrice: null,
      billedLines: {},
    });

    expect(display.state).toBe("none");
    expect(display.amountText).toBeNull();
  });

  it("falls back to the estimate when the item carries no id to match on", () => {
    const display = resolveVisitScopeItemPriceDisplay({
      itemId: undefined,
      expectedUnitPrice: 55,
      billedLines: {
        [WORK_ITEM_ID]: { quantity: 10, unitPriceCents: 5500, lineSubtotalCents: 55000 },
      },
    });

    expect(display.state).toBe("estimate");
    expect(display.amountText).toBe("Est. $55.00");
  });
});
