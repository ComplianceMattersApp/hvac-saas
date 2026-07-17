"use client";

import { useEffect, useRef, useState } from "react";
import {
  parseGoogleAddressComponents,
  type GoogleAddressComponent,
  type SelectedServiceAddress,
} from "@/lib/addresses/google-place-address";
import {
  loadGooglePlacesLibrary,
  type PlaceAutocompleteElementLike,
  type PlaceSelectEventLike,
} from "@/lib/google-maps/load-places-library";

type AssistantState = "loading" | "ready" | "unavailable";

export type GoogleAddressAutocompleteProps = {
  onAddressSelected: (address: SelectedServiceAddress) => void;
  label?: string;
  className?: string;
};

export default function GoogleAddressAutocomplete({
  onAddressSelected,
  label = "Search for a service address",
  className = "",
}: GoogleAddressAutocompleteProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onAddressSelected);
  const [state, setState] = useState<AssistantState>("loading");

  useEffect(() => {
    callbackRef.current = onAddressSelected;
  }, [onAddressSelected]);

  useEffect(() => {
    let cancelled = false;
    let autocomplete: PlaceAutocompleteElementLike | null = null;

    const handleSelection = async (event: Event) => {
      const place = (event as PlaceSelectEventLike).place;
      if (!place) return;

      try {
        await place.fetchFields({ fields: ["addressComponents"] });
        if (cancelled) return;
        callbackRef.current(
          parseGoogleAddressComponents(
            place.addressComponents as readonly GoogleAddressComponent[] | null | undefined,
          ),
        );
      } catch {
        if (!cancelled) setState("unavailable");
      }
    };

    void loadGooglePlacesLibrary().then((result) => {
      if (cancelled) return;
      if (result.status !== "available" || !hostRef.current) {
        setState("unavailable");
        return;
      }

      autocomplete = new result.library.PlaceAutocompleteElement();
      autocomplete.includedRegionCodes = ["us"];
      autocomplete.includedPrimaryTypes = ["street_address", "premise", "subpremise"];
      autocomplete.placeholder = "Start typing a U.S. street address";
      autocomplete.setAttribute("aria-label", label);
      autocomplete.addEventListener("gmp-placeselect", handleSelection);
      hostRef.current.replaceChildren(autocomplete);
      setState("ready");
    });

    return () => {
      cancelled = true;
      autocomplete?.removeEventListener("gmp-placeselect", handleSelection);
      autocomplete?.remove();
    };
  }, [label]);

  return (
    <div className={className} data-address-autocomplete-assistant="google">
      <div className="text-sm font-medium text-slate-700">{label}</div>
      <div ref={hostRef} className={state === "ready" ? "mt-1" : "hidden"} />
      <p className="mt-1 text-xs text-slate-500" aria-live="polite">
        {state === "loading"
          ? "Loading address suggestions…"
          : state === "unavailable"
            ? "Address suggestions are unavailable. Enter the address manually."
            : "Choose a suggestion, then review and edit the address fields below."}
      </p>
    </div>
  );
}
