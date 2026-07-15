import { describe, expect, it } from "vitest";
import {
  hasExactDuplicateChargeSet,
  internalInvoiceChargeFingerprint,
} from "@/lib/business/internal-invoice-duplicate-risk";
import type { InternalInvoiceLineItemRecord } from "@/lib/business/internal-invoice";

function line(overrides: Partial<InternalInvoiceLineItemRecord> = {}): InternalInvoiceLineItemRecord {
  return {
    id: "line-1",
    invoice_id: "invoice-1",
    sort_order: 0,
    source_kind: "pricebook",
    source_pricebook_item_id: "duct-cleaning",
    source_visit_scope_item_id: null,
    item_name_snapshot: "Duct Cleaning",
    description_snapshot: null,
    item_type_snapshot: "service",
    category_snapshot: null,
    unit_label_snapshot: null,
    quantity: 1,
    unit_price: 720,
    line_subtotal: 720,
    created_by_user_id: "user-1",
    updated_by_user_id: "user-1",
    created_at: "2026-07-14T00:00:00.000Z",
    updated_at: "2026-07-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("internal invoice duplicate risk", () => {
  it("uses the pricebook identity and financial shape for a charge fingerprint", () => {
    expect(internalInvoiceChargeFingerprint(line())).toBe("duct-cleaning|1.00|720.00|720.00");
  });

  it("matches the same complete charge set regardless of line order", () => {
    const first = line();
    const second = line({ id: "line-2", source_pricebook_item_id: "test", item_name_snapshot: "ECC Test", unit_price: 250, line_subtotal: 250 });
    expect(hasExactDuplicateChargeSet([first, second], [{ ...second, invoice_id: "invoice-2" }, { ...first, invoice_id: "invoice-2" }])).toBe(true);
  });

  it("does not flag partial overlap or a changed quantity", () => {
    const first = line();
    const second = line({ id: "line-2", source_pricebook_item_id: "test", item_name_snapshot: "ECC Test", unit_price: 250, line_subtotal: 250 });
    expect(hasExactDuplicateChargeSet([first, second], [first])).toBe(false);
    expect(hasExactDuplicateChargeSet([first], [line({ quantity: 2, line_subtotal: 1440 })])).toBe(false);
  });

  it("falls back to a normalized name for manual charges", () => {
    const current = line({ source_pricebook_item_id: null, source_kind: "manual", item_name_snapshot: " Duct   Cleaning " });
    const candidate = line({ source_pricebook_item_id: null, source_kind: "manual", item_name_snapshot: "duct cleaning", invoice_id: "invoice-2" });
    expect(hasExactDuplicateChargeSet([current], [candidate])).toBe(true);
  });
});
