import { describe, expect, it, vi } from "vitest";
import {
  PRICEBOOK_IMPORT_TEMPLATE_CSV,
  buildPricebookImportPreview,
  importPricebookRows,
  normalizePricebookImportName,
  parsePricebookImportCsv,
  type PricebookImportStore,
} from "@/lib/business/pricebook-import";

function makeStore(params?: {
  existingNames?: string[];
  insertError?: string | null;
}): PricebookImportStore & { insertMock: ReturnType<typeof vi.fn> } {
  const insertMock = vi.fn(async () => ({
    error: params?.insertError ? { message: params.insertError } : null,
  }));

  return {
    insertMock,
    listExistingPricebookItems: vi.fn(async () => ({
      data: (params?.existingNames ?? []).map((item_name) => ({ item_name })),
      error: null,
    })),
    insertPricebookItems: insertMock,
  };
}

describe("pricebook CSV import", () => {
  it("accepts friendly headers and example template rows", () => {
    const parsed = parsePricebookImportCsv(PRICEBOOK_IMPORT_TEMPLATE_CSV);

    expect(parsed.errors).toEqual([]);
    expect(parsed.missingHeaders).toEqual([]);
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows[0]["Service Name"]).toBe("General Cleaning");
  });

  it("normalizes names for duplicate detection", () => {
    expect(normalizePricebookImportName("  Deep   Cleaning ")).toBe("deep cleaning");
  });

  it("maps friendly values into existing Pricebook insert payloads", async () => {
    const store = makeStore();
    const csv = [
      "Service Name,Category,Kind,Unit,Price,Active,Description",
      "Deep Cleaning,Cleaning,Service,Job,1,Yes,Deep clean",
      "Extra Labor Hour,Labor,Labor,Hour,75.00,Y,Extra time",
      "Supplies,Supplies,Material,Item,1,True,Consumables",
      "After-Hours Service,Add-on,Fee,Room,1,0,Deferred",
      "Floor Work,Floor Care,Service,Sq Ft,1,No,Square footage convention",
    ].join("\n");

    const preview = await buildPricebookImportPreview({
      csv,
      accountOwnerUserId: "owner-1",
      store,
    });

    expect(preview.needsReview).toEqual([]);
    expect(preview.readyToAdd.map((row) => row.insertRow)).toEqual([
      expect.objectContaining({ item_type: "service", unit_label: "job", is_active: true }),
      expect.objectContaining({ item_type: "service", unit_label: "hr", is_active: true }),
      expect.objectContaining({ item_type: "material", unit_label: "each", is_active: true }),
      expect.objectContaining({ item_type: "adjustment", unit_label: "each", is_active: false }),
      expect.objectContaining({ item_type: "service", unit_label: "flat", is_active: false }),
    ]);
  });

  it("parses comma-formatted prices", async () => {
    const store = makeStore();
    const csv = [
      "Service Name,Category,Kind,Unit,Price,Active,Description",
      '"Large Job",Cleaning,Service,Job,"1,250.00",Yes,Large job',
    ].join("\n");

    const preview = await buildPricebookImportPreview({ csv, accountOwnerUserId: "owner-1", store });

    expect(preview.readyToAdd[0].price).toBe(1250);
  });

  it("classifies existing account items as Already exists", async () => {
    const store = makeStore({ existingNames: ["General Cleaning"] });

    const preview = await buildPricebookImportPreview({
      csv: PRICEBOOK_IMPORT_TEMPLATE_CSV,
      accountOwnerUserId: "owner-1",
      store,
    });

    expect(preview.alreadyExists).toHaveLength(1);
    expect(preview.alreadyExists[0].serviceName).toBe("General Cleaning");
    expect(preview.readyToAdd).toHaveLength(3);
  });

  it("flags validation failures as Needs review", async () => {
    const store = makeStore();
    const csv = [
      "Service Name,Category,Kind,Unit,Price,Active,Description",
      ",Cleaning,Service,Job,0,Yes,Missing name",
      "Bad Kind,Cleaning,Other,Job,0,Yes,Bad kind",
      "Bad Unit,Cleaning,Service,Minute,0,Yes,Bad unit",
      "Bad Price,Cleaning,Service,Job,-1,Yes,Bad price",
      "Bad Active,Cleaning,Service,Job,0,Maybe,Bad active",
      "Formula Name,Cleaning,Service,Job,0,Yes,=IMPORT()",
    ].join("\n");

    const preview = await buildPricebookImportPreview({ csv, accountOwnerUserId: "owner-1", store });

    expect(preview.readyToAdd).toHaveLength(0);
    expect(preview.needsReview.map((row) => row.reason)).toEqual([
      "Missing Service Name.",
      "Unsupported Kind.",
      "Unsupported Unit.",
      "Invalid Price.",
      "Invalid Active value.",
      "Remove formula-like text from this row.",
    ]);
  });

  it("flags missing required headers", () => {
    const parsed = parsePricebookImportCsv("Service Name,Kind\nGeneral Cleaning,Service");

    expect(parsed.missingHeaders).toEqual(["Category", "Unit", "Price", "Active", "Description"]);
  });

  it("flags duplicate service names within the file", async () => {
    const store = makeStore();
    const csv = [
      "Service Name,Category,Kind,Unit,Price,Active,Description",
      "General Cleaning,Cleaning,Service,Job,0,Yes,One",
      " general   cleaning ,Cleaning,Service,Job,0,Yes,Two",
    ].join("\n");

    const preview = await buildPricebookImportPreview({ csv, accountOwnerUserId: "owner-1", store });

    expect(preview.readyToAdd).toHaveLength(1);
    expect(preview.needsReview[0].reason).toBe("Already exists in this file.");
  });

  it("confirm import inserts only ready rows and re-checks duplicates", async () => {
    const store = makeStore({ existingNames: ["General Cleaning"] });

    const result = await importPricebookRows({
      csv: PRICEBOOK_IMPORT_TEMPLATE_CSV,
      accountOwnerUserId: "owner-1",
      store,
    });

    expect(result.added).toBe(3);
    expect(result.skippedExisting).toBe(1);
    expect(result.needsReview).toBe(0);
    expect(store.insertMock).toHaveBeenCalledTimes(1);
    expect(store.insertMock.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        account_owner_user_id: "owner-1",
        item_name: "After-Hours Service",
        is_starter: false,
        seed_key: null,
      }),
      expect.objectContaining({ item_name: "Extra Labor Hour", is_starter: false, seed_key: null }),
      expect.objectContaining({ item_name: "Supplies / Consumables", is_starter: false, seed_key: null }),
    ]);
  });

  it("does not write when every row needs review or already exists", async () => {
    const store = makeStore({ existingNames: ["General Cleaning"] });

    const result = await importPricebookRows({
      csv: [
        "Service Name,Category,Kind,Unit,Price,Active,Description",
        "General Cleaning,Cleaning,Service,Job,0,Yes,Existing",
        "Bad,Cleaning,Other,Job,0,Yes,Bad",
      ].join("\n"),
      accountOwnerUserId: "owner-1",
      store,
    });

    expect(result.added).toBe(0);
    expect(result.skippedExisting).toBe(1);
    expect(result.needsReview).toBe(1);
    expect(store.insertMock).not.toHaveBeenCalled();
  });
});
