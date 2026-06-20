import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  buildCustomerDirectorySections,
  CUSTOMER_DIRECTORY_NAV_KEYS,
  getCustomerDirectoryAnchorId,
  getCustomerDirectoryLetterKey,
} from "@/lib/customers/directory-sections";
import type { ScopedCustomerSearchResult } from "@/lib/customers/visibility";

const customersPageSource = readFileSync(resolve(__dirname, "../../../app/customers/page.tsx"), "utf8");

function customer(overrides: Partial<ScopedCustomerSearchResult>): ScopedCustomerSearchResult {
  return {
    customer_id: overrides.customer_id ?? "customer-1",
    full_name: overrides.full_name ?? "Ada Lovelace",
    phone: overrides.phone ?? null,
    email: overrides.email ?? null,
    locations_count: overrides.locations_count ?? 0,
    sample_location_id: overrides.sample_location_id ?? null,
    sample_address: overrides.sample_address ?? null,
    sample_city: overrides.sample_city ?? null,
    last_job_date: overrides.last_job_date ?? null,
    open_job_count: overrides.open_job_count ?? 0,
  };
}

describe("customer directory sections", () => {
  it("groups visible customers by starting letter without changing their current sort order", () => {
    const sections = buildCustomerDirectorySections([
      customer({ customer_id: "a-1", full_name: "Ada Lovelace" }),
      customer({ customer_id: "a-2", full_name: "ACME Facilities" }),
      customer({ customer_id: "b-1", full_name: "Betty Smith" }),
    ]);

    expect(sections.map((section) => section.key)).toEqual(["A", "B"]);
    expect(sections[0]?.customers.map((row) => row.customer_id)).toEqual(["a-1", "a-2"]);
    expect(sections[1]?.customers.map((row) => row.customer_id)).toEqual(["b-1"]);
  });

  it("keeps Z-A section order usable when the visible list is already reversed", () => {
    const sections = buildCustomerDirectorySections([
      customer({ customer_id: "z-1", full_name: "Zelda Young" }),
      customer({ customer_id: "m-1", full_name: "Mina Patel" }),
      customer({ customer_id: "a-1", full_name: "Ada Lovelace" }),
    ]);

    expect(sections.map((section) => section.key)).toEqual(["Z", "M", "A"]);
    expect(sections.map((section) => section.anchorId)).toEqual([
      "customers-letter-z",
      "customers-letter-m",
      "customers-letter-a",
    ]);
  });

  it("uses # for numeric or missing names and the first alphanumeric letter after symbols", () => {
    expect(getCustomerDirectoryLetterKey("  123 Cooling")).toBe("#");
    expect(getCustomerDirectoryLetterKey("  - Delta Air")).toBe("D");
    expect(getCustomerDirectoryLetterKey("")).toBe("#");

    const sections = buildCustomerDirectorySections([
      customer({ customer_id: "numeric", full_name: "  123 Cooling" }),
      customer({ customer_id: "symbol", full_name: " & Sons HVAC" }),
      customer({ customer_id: "missing", full_name: "" }),
      customer({ customer_id: "delta", full_name: "Delta Air" }),
    ]);

    expect(sections.map((section) => section.key)).toEqual(["#", "S", "D"]);
    expect(sections[0]?.anchorId).toBe("customers-letter-other");
    expect(sections[0]?.customers.map((row) => row.customer_id)).toEqual(["numeric", "missing"]);
  });

  it("exposes stable nav keys and anchor ids for page links", () => {
    expect(CUSTOMER_DIRECTORY_NAV_KEYS[0]).toBe("#");
    expect(CUSTOMER_DIRECTORY_NAV_KEYS.slice(1)).toEqual("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
    expect(getCustomerDirectoryAnchorId("A")).toBe("customers-letter-a");
    expect(getCustomerDirectoryAnchorId("#")).toBe("customers-letter-other");
  });
});

describe("customer directory page A-Z wiring", () => {
  it("renders letter navigation with active anchors and disabled unavailable letters", () => {
    expect(customersPageSource).toContain('aria-label="Customer directory letter navigation"');
    expect(customersPageSource).toContain("CUSTOMER_DIRECTORY_NAV_KEYS.map");
    expect(customersPageSource).toContain('href={`#${getCustomerDirectoryAnchorId(letter)}`}');
    expect(customersPageSource).toContain("Jump to customers starting with");
    expect(customersPageSource).toContain("No visible customers starting with");
    expect(customersPageSource).toContain("disabled");
    expect(customersPageSource).toContain('aria-disabled="true"');
  });

  it("renders section anchors with scroll offset while preserving row links and export/sort controls", () => {
    expect(customersPageSource).toContain("buildCustomerDirectorySections(results)");
    expect(customersPageSource).toContain("id={section.anchorId}");
    expect(customersPageSource).toContain("scroll-mt-24");
    expect(customersPageSource).toContain("section.customers.map");
    expect(customersPageSource).toContain('href={`/customers/${r.customer_id}`}');
    expect(customersPageSource).toContain("Rows open the customer workspace.");
    expect(customersPageSource).toContain("Export CSV");
    expect(customersPageSource).toContain("sortToggle");
  });
});
