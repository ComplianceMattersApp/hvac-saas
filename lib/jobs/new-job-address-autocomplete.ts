import {
  mergeSelectedServiceAddressFields,
  type SelectedServiceAddress,
  type ServiceAddressFieldValues,
} from "@/lib/addresses/google-place-address";

export type NewJobServiceAddressFields = ServiceAddressFieldValues;

export function shouldShowInternalAddressAutocomplete(input: {
  isInternalMode: boolean;
  createNewCustomer: boolean;
  selectedCustomerId: string;
  locationMode: "existing" | "new" | null;
}): boolean {
  if (!input.isInternalMode) return false;
  if (input.createNewCustomer) return true;
  return Boolean(input.selectedCustomerId && input.locationMode === "new");
}

/** Populate only non-empty provider values and preserve Address Line 2. */
export function mergeSelectedServiceAddress(
  current: NewJobServiceAddressFields,
  selected: SelectedServiceAddress,
): NewJobServiceAddressFields {
  return mergeSelectedServiceAddressFields(current, selected);
}
