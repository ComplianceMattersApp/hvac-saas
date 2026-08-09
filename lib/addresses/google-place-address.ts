import { normalizeCoordinatePair, type CoordinatePair } from "@/lib/routing/coordinates";

export type GoogleAddressComponent = {
  longText?: string | null;
  shortText?: string | null;
  types?: readonly string[] | null;
};

export type SelectedServiceAddress = {
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  suggestedUnit: string;
  /**
   * Present only when the provider supplied geometry for the selection.
   * Manual entry and legacy callers leave these absent; consumers must treat
   * missing coordinates as "not geocoded", never as 0,0.
   */
  latitude?: number | null;
  longitude?: number | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function findComponent(
  components: readonly GoogleAddressComponent[],
  type: string,
): GoogleAddressComponent | undefined {
  return components.find((component) => component.types?.includes(type));
}

function longText(components: readonly GoogleAddressComponent[], type: string): string {
  return clean(findComponent(components, type)?.longText);
}

function shortText(components: readonly GoogleAddressComponent[], type: string): string {
  const component = findComponent(components, type);
  return clean(component?.shortText) || clean(component?.longText);
}

export function parseGoogleAddressComponents(
  components: readonly GoogleAddressComponent[] | null | undefined,
): SelectedServiceAddress {
  const safeComponents = components ?? [];
  const streetNumber = longText(safeComponents, "street_number");
  const route = longText(safeComponents, "route");
  const postalCode = longText(safeComponents, "postal_code");
  const postalSuffix = longText(safeComponents, "postal_code_suffix");

  const city =
    longText(safeComponents, "locality") ||
    longText(safeComponents, "postal_town") ||
    longText(safeComponents, "sublocality_level_1") ||
    longText(safeComponents, "administrative_area_level_2");

  return {
    addressLine1: [streetNumber, route].filter(Boolean).join(" "),
    city,
    state: shortText(safeComponents, "administrative_area_level_1").toUpperCase(),
    zip: postalCode && postalSuffix ? `${postalCode}-${postalSuffix}` : postalCode,
    suggestedUnit: longText(safeComponents, "subpremise"),
  };
}

/**
 * The new Places API exposes `Place.location` as a LatLng whose lat/lng are
 * methods, while serialized payloads carry plain numbers. Accept both.
 */
export type GooglePlaceLocationLike =
  | { lat?: unknown; lng?: unknown }
  | null
  | undefined;

function unwrapLatLngValue(raw: unknown): unknown {
  if (typeof raw === "function") {
    try {
      return (raw as () => unknown)();
    } catch {
      return null;
    }
  }
  return raw;
}

export function parseGooglePlaceLocation(
  location: GooglePlaceLocationLike,
): CoordinatePair | null {
  if (!location || typeof location !== "object") return null;
  return normalizeCoordinatePair(
    unwrapLatLngValue((location as { lat?: unknown }).lat),
    unwrapLatLngValue((location as { lng?: unknown }).lng),
  );
}

export type EditableServiceAddress = SelectedServiceAddress & {
  addressLine2: string;
};

export type ServiceAddressFieldValues = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
};

/**
 * Converts a Google selection into the existing editable form contract.
 * A provider-suggested unit is deliberately kept separate: Address Line 2
 * always remains the user's existing value unless a consuming UI explicitly
 * offers and applies the suggestion.
 */
export function preserveAddressLine2(
  selection: SelectedServiceAddress,
  existingAddressLine2: string,
): EditableServiceAddress {
  return {
    ...selection,
    addressLine2: existingAddressLine2,
  };
}

/** Applies only non-empty selected values to the existing editable fields. */
export function mergeSelectedServiceAddressFields(
  current: ServiceAddressFieldValues,
  selected: SelectedServiceAddress,
): ServiceAddressFieldValues {
  return {
    addressLine1: selected.addressLine1 || current.addressLine1,
    addressLine2: current.addressLine2,
    city: selected.city || current.city,
    state: selected.state || current.state,
    zip: selected.zip || current.zip,
  };
}
