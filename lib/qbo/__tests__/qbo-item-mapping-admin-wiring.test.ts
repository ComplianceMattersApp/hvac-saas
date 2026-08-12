import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const integrationSection = read("app/ops/admin/company-profile/_components/QboIntegrationSection.tsx");
const companyProfilePage = read("app/ops/admin/company-profile/page.tsx");
const pricebookPage = read("app/ops/admin/pricebook/page.tsx");
const pricebookActions = read("lib/actions/pricebook-actions.ts");
const connectionActions = read("lib/actions/qbo-connection-actions.ts");

describe("account default QuickBooks item admin wiring", () => {
  it("offers the selector only for a live connection, and can clear it", () => {
    expect(integrationSection).toContain('qboConnection?.status === "active"');
    expect(integrationSection).toContain("saveDefaultQboItemFromForm");
    expect(integrationSection).toContain("None (use EveryStep Services)");
  });

  it("disables the selector and its save when the QBO item list could not load", () => {
    expect(integrationSection).toContain("const listUnavailable = catalog.items.length === 0;");
    expect(integrationSection).toContain("disabled={listUnavailable}");
    expect(integrationSection).toContain("{catalog.error");
  });

  it("only fetches the item list for an active connection, and never fails the page on it", () => {
    expect(companyProfilePage).toContain("loadQboItemCatalog");
    expect(companyProfilePage).toContain('qboAvailable && qboConnection?.status === "active"');
    expect(companyProfilePage).toContain("readAccountDefaultQboItem");
  });

  it("submits the item id alone and resolves the cached name server-side", () => {
    expect(integrationSection).toContain("value={item.id}");
    expect(integrationSection).toContain("defaultQboItem?.qboItemId ?? \"\"");
    expect(connectionActions).toContain('parseQboItemIdSelection(formData.get("default_qbo_item"))');
    expect(connectionActions).toContain("resolveQboItemName(await loadQboItemCatalog(");
    expect(connectionActions).toContain("default_qbo_item_id: qboItemId, default_qbo_item_name: qboItemName");
  });

  it("only writes the live connection, and reports nothing saved when no row matched", () => {
    expect(connectionActions).toContain('.eq("status", "active")');
    expect(connectionActions).toContain("if (!data?.id)");
    expect(connectionActions).toContain("qbo_default_item_not_connected");
  });
});

describe("pricebook QuickBooks item mapping wiring", () => {
  it("renders the mapping selector only when QuickBooks is connected", () => {
    expect(pricebookPage).toContain("{qboItemCatalog.connected ? (");
    expect(pricebookPage).toContain("<QboItemMappingField");
    expect(pricebookPage).toContain("None (use the account default)");
  });

  it("reads mappings through the dedicated helper, not the page's catalog SELECT", () => {
    expect(pricebookPage).toContain("readPricebookQboItemMappings");
    expect(pricebookPage).not.toMatch(/select\([\s\S]{0,400}qbo_item_id/);
  });

  it("omits the presence marker when the selector is disabled, so a save cannot clear the mapping", () => {
    expect(pricebookPage).toContain(
      'listUnavailable ? null : <input type="hidden" name="qbo_item_mapping_present" value="1" />',
    );
    expect(pricebookPage).toContain("disabled={listUnavailable}");
  });

  it("saves the mapping in its own statement that tolerates an undeployed column", () => {
    expect(pricebookActions).toContain('normalizeText(params.formData.get("qbo_item_mapping_present")) !== "1"');
    expect(pricebookActions).toContain("qbo_item_id: qboItemId, qbo_item_name: qboItemName");
    expect(pricebookActions).toContain("if (error && !isMissingQboItemMappingColumnError(error))");
  });

  it("submits the item id alone and resolves the cached name server-side", () => {
    expect(pricebookPage).toContain("value={item.id}");
    expect(pricebookPage).toContain('mapping?.qboItemId ?? ""');
    expect(pricebookActions).toContain('parseQboItemIdSelection(params.formData.get("qbo_item"))');
    expect(pricebookActions).toContain("resolveQboItemName(");
  });
});
