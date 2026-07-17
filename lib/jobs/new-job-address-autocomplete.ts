import type { SelectedServiceAddress } from "@/lib/addresses/google-place-address";

export type NewJobServiceAddressFields = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
};

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
  return {
    addressLine1: selected.addressLine1 || current.addressLine1,
    addressLine2: current.addressLine2,
    city: selected.city || current.city,
    state: selected.state || current.state,
    zip: selected.zip || current.zip,
  };
}
