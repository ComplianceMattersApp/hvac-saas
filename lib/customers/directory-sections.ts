import type { ScopedCustomerSearchResult } from "@/lib/customers/visibility";
import {
  CUSTOMER_DIRECTORY_LETTER_VALUES,
  getCustomerDirectoryInitialKey,
  type CustomerDirectoryInitialKey,
} from "@/lib/customers/directory-initials";

export const CUSTOMER_DIRECTORY_NAV_KEYS = [
  "#",
  ...CUSTOMER_DIRECTORY_LETTER_VALUES,
] as const;

export type CustomerDirectoryLetterKey = (typeof CUSTOMER_DIRECTORY_NAV_KEYS)[number];

export type CustomerDirectorySection = {
  key: CustomerDirectoryLetterKey;
  anchorId: string;
  customers: ScopedCustomerSearchResult[];
};

export function getCustomerDirectoryLetterKey(displayName: unknown): CustomerDirectoryLetterKey {
  const key = getCustomerDirectoryInitialKey(displayName);
  return key === "other" ? "#" : (key as CustomerDirectoryLetterKey);
}

export function getCustomerDirectoryInitialKeyFromLetterKey(letterKey: CustomerDirectoryLetterKey): CustomerDirectoryInitialKey {
  return letterKey === "#" ? "other" : letterKey;
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
