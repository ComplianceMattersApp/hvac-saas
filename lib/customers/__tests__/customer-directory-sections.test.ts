import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  buildCustomerDirectorySections,
  CUSTOMER_DIRECTORY_NAV_KEYS,
  getAvailableCustomerDirectoryLetters,
  getCustomerDirectoryAnchorId,
  getCustomerDirectoryInitialKeyFromLetterKey,
  getCustomerDirectoryLetterKey,
} from "@/lib/customers/directory-sections";
import {
  buildScopedCustomerResults,
  type ScopedCustomerSearchResult,
} from "@/lib/customers/visibility";
import {
  getCustomerDirectoryInitialKey,
  normalizeCustomerDirectoryLetterFilter,
} from "@/lib/customers/directory-initials";

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

  it("returns available letters from only the current visible sections", () => {
    const sections = buildCustomerDirectorySections([
      customer({ customer_id: "w-1", full_name: "Wendy Watts" }),
      customer({ customer_id: "w-2", full_name: "Westside Market" }),
      customer({ customer_id: "b-1", full_name: "Beta Homes" }),
      customer({ customer_id: "numeric", full_name: "123 Cooling" }),
    ]);

    expect(getAvailableCustomerDirectoryLetters(sections)).toEqual(["W", "B", "#"]);
    expect(getAvailableCustomerDirectoryLetters([])).toEqual([]);
  });

  it("uses # for numeric, symbol-leading, or missing names", () => {
    expect(getCustomerDirectoryLetterKey("  123 Cooling")).toBe("#");
    expect(getCustomerDirectoryLetterKey("  - Delta Air")).toBe("#");
    expect(getCustomerDirectoryLetterKey("")).toBe("#");
    expect(getCustomerDirectoryInitialKey("  123 Cooling")).toBe("other");
    expect(getCustomerDirectoryInitialKey("  - Delta Air")).toBe("other");
    expect(getCustomerDirectoryInitialKey("")).toBe("other");

    const sections = buildCustomerDirectorySections([
      customer({ customer_id: "numeric", full_name: "  123 Cooling" }),
      customer({ customer_id: "symbol", full_name: " & Sons HVAC" }),
      customer({ customer_id: "missing", full_name: "" }),
      customer({ customer_id: "delta", full_name: "Delta Air" }),
    ]);

    expect(sections.map((section) => section.key)).toEqual(["#", "D"]);
    expect(sections[0]?.anchorId).toBe("customers-letter-other");
    expect(sections[0]?.customers.map((row) => row.customer_id)).toEqual(["numeric", "symbol", "missing"]);
  });

  it("exposes stable nav keys and anchor ids for page links", () => {
    expect(CUSTOMER_DIRECTORY_NAV_KEYS[0]).toBe("#");
    expect(CUSTOMER_DIRECTORY_NAV_KEYS.slice(1)).toEqual("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
    expect(getCustomerDirectoryAnchorId("A")).toBe("customers-letter-a");
    expect(getCustomerDirectoryAnchorId("#")).toBe("customers-letter-other");
    expect(getCustomerDirectoryInitialKeyFromLetterKey("#")).toBe("other");
    expect(getCustomerDirectoryInitialKeyFromLetterKey("A")).toBe("A");
    expect(normalizeCustomerDirectoryLetterFilter("e")).toBe("E");
    expect(normalizeCustomerDirectoryLetterFilter("other")).toBe("other");
    expect(normalizeCustomerDirectoryLetterFilter("all")).toBe("all");
    expect(normalizeCustomerDirectoryLetterFilter("bad-value")).toBe("all");
  });
});

describe("customer directory starts-with filtering", () => {
  const customers = [
    { id: "ada", full_name: "Ada Lovelace", phone: "555-1000", email: "ada@example.com" },
    { id: "acme", full_name: "ACME Facilities", phone: "555-2000", email: "ops@acme.test" },
    { id: "betty", full_name: "Betty Smith", phone: "555-3000", email: "betty@example.com" },
    { id: "numeric", full_name: "123 Cooling", phone: "555-4000", email: "dispatch@example.com" },
    { id: "symbol", full_name: "& Sons HVAC", phone: "555-5000", email: "sons@example.com" },
    { id: "missing", full_name: "", first_name: "", last_name: "", phone: "555-6000", email: "missing@example.com" },
  ];

  const locations = [
    { id: "loc-ada", customer_id: "ada", address_line1: "10 Market St", city: "Stockton", created_at: "2026-01-01" },
    { id: "loc-acme", customer_id: "acme", address_line1: "20 Elm St", city: "Lodi", created_at: "2026-01-02" },
    { id: "loc-betty", customer_id: "betty", address_line1: "30 East Ave", city: "Stockton", created_at: "2026-01-03" },
    { id: "loc-numeric", customer_id: "numeric", address_line1: "40 Number Rd", city: "Manteca", created_at: "2026-01-04" },
  ];

  const jobs = [
    { customer_id: "ada", location_id: "loc-ada", status: "open", ops_status: "scheduled", scheduled_date: "2026-02-01" },
    { customer_id: "betty", location_id: "loc-betty", status: "open", ops_status: "scheduled", scheduled_date: "2026-02-02" },
  ];

  it("filters A-Z by normalized customer display label before final limit", () => {
    const directory = buildScopedCustomerResults({
      customers,
      locations,
      jobs,
      letterFilter: "A",
      resultLimit: 1,
      sortDirection: "az",
    });

    expect(directory.totalCount).toBe(2);
    expect(directory.results.map((row) => row.customer_id)).toEqual(["acme"]);
  });

  it("letter=other catches numeric, symbol, and blank display labels", () => {
    const directory = buildScopedCustomerResults({
      customers,
      locations,
      jobs,
      letterFilter: "other",
      resultLimit: 10,
      sortDirection: "az",
    });

    expect(directory.results.map((row) => row.customer_id).sort()).toEqual(["missing", "numeric", "symbol"]);
  });

  it("letter=all or missing letter shows all customers", () => {
    const all = buildScopedCustomerResults({ customers, locations, jobs, letterFilter: "all", resultLimit: 10 });
    const missing = buildScopedCustomerResults({ customers, locations, jobs, resultLimit: 10 });

    expect(all.totalCount).toBe(customers.length);
    expect(missing.totalCount).toBe(customers.length);
  });

  it("combines broad search and starts-with as an AND filter", () => {
    const directory = buildScopedCustomerResults({
      customers,
      locations,
      jobs,
      searchText: "stockton",
      letterFilter: "B",
      resultLimit: 10,
    });

    expect(directory.results.map((row) => row.customer_id)).toEqual(["betty"]);
  });
});

describe("customer directory page A-Z wiring", () => {
  it("renders sticky starts-with filter links with one URL-backed active state", () => {
    expect(customersPageSource).toContain('aria-label="Customer directory starts-with filter"');
    expect(customersPageSource).toContain("sticky top-16 z-20");
    expect(customersPageSource).toContain("bg-white/95");
    expect(customersPageSource).toContain("Starts with");
    expect(customersPageSource).toContain("CUSTOMER_DIRECTORY_NAV_KEYS.map");
    expect(customersPageSource).toContain("customerDirectoryHref({ q, sort, letter: filter })");
    expect(customersPageSource).toContain('aria-current={selected ? "page" : undefined}');
    expect(customersPageSource).not.toContain('href={`#${getCustomerDirectoryAnchorId(letter)}`}');
    expect(customersPageSource).not.toContain("activeDirectoryLetters");
  });

  it("renders mobile navigation as horizontal URL-backed filter chips", () => {
    expect(customersPageSource).toContain("sm:hidden");
    expect(customersPageSource).toContain("hidden gap-1 px-1 sm:flex sm:flex-wrap");
    expect(customersPageSource).toContain("inline-flex h-10 min-w-10");
    expect(customersPageSource).toContain("Clear all");
  });

  it("preserves letter in search, sort, export, rows, and section rendering", () => {
    expect(customersPageSource).toContain("buildCustomerDirectorySections(results)");
    expect(customersPageSource).toContain("id={section.anchorId}");
    expect(customersPageSource).toContain("scroll-mt-32 lg:scroll-mt-36");
    expect(customersPageSource).toContain("section.customers.map");
    expect(customersPageSource).toContain('href={`/customers/${r.customer_id}`}');
    expect(customersPageSource).toContain("Rows open the customer workspace.");
    expect(customersPageSource).toContain("Export CSV");
    expect(customersPageSource).toContain("sortToggle");
    expect(customersPageSource).toContain("letterFilter: letter");
    expect(customersPageSource).toContain("initialLetter={letter}");
    expect(customersPageSource).toContain("customerExportHref({ q, sort, letter })");
  });
});
