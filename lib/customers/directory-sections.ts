import type { ScopedCustomerSearchResult } from "@/lib/customers/visibility";

export const CUSTOMER_DIRECTORY_NAV_KEYS = [
  "#",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
] as const;

export type CustomerDirectoryLetterKey = (typeof CUSTOMER_DIRECTORY_NAV_KEYS)[number];

export type CustomerDirectorySection = {
  key: CustomerDirectoryLetterKey;
  anchorId: string;
  customers: ScopedCustomerSearchResult[];
};

export function getCustomerDirectoryLetterKey(displayName: unknown): CustomerDirectoryLetterKey {
  const trimmed = String(displayName ?? "").trim();
  const firstAlphanumeric = trimmed.match(/[A-Za-z0-9]/)?.[0] ?? "";
  const upper = firstAlphanumeric.toUpperCase();
  return /^[A-Z]$/.test(upper) ? (upper as CustomerDirectoryLetterKey) : "#";
}

export function getCustomerDirectoryAnchorId(letterKey: CustomerDirectoryLetterKey) {
  return letterKey === "#" ? "customers-letter-other" : `customers-letter-${letterKey.toLowerCase()}`;
}

export function buildCustomerDirectorySections(
  customers: ScopedCustomerSearchResult[],
): CustomerDirectorySection[] {
  const sections: CustomerDirectorySection[] = [];
  const sectionsByKey = new Map<CustomerDirectoryLetterKey, CustomerDirectorySection>();

  for (const customer of customers) {
    const key = getCustomerDirectoryLetterKey(customer.full_name);
    let section = sectionsByKey.get(key);
    if (!section) {
      section = {
        key,
        anchorId: getCustomerDirectoryAnchorId(key),
        customers: [],
      };
      sectionsByKey.set(key, section);
      sections.push(section);
    }
    section.customers.push(customer);
  }

  return sections;
}

export function getAvailableCustomerDirectoryLetters(
  sections: CustomerDirectorySection[],
): CustomerDirectoryLetterKey[] {
  return sections.map((section) => section.key);
}
