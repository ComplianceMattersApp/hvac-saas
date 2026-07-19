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
  type PlacePredictionSelectEventLike,
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
      const placePrediction = (event as PlacePredictionSelectEventLike).placePrediction;
      if (!placePrediction) return;

      try {
        const place = placePrediction.toPlace();
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
      autocomplete.addEventListener("gmp-select", handleSelection);
      hostRef.current.replaceChildren(autocomplete);
      setState("ready");
    });

    return () => {
      cancelled = true;
      autocomplete?.removeEventListener("gmp-select", handleSelection);
      autocomplete?.remove();
    };
  }, [label]);

  return (
    <div
      className={`rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 shadow-sm ${className}`}
      data-address-autocomplete-assistant="google"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="text-sm font-semibold text-slate-900">Find address automatically</div>
        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Recommended
        </span>
      </div>
      <p className="mb-2 text-xs leading-5 text-slate-600">{label}</p>
      <div
        ref={hostRef}
        className={state === "ready" ? "bg-white" : "hidden"}
      />
      <p className="mt-2 text-xs text-slate-600" aria-live="polite">
        {state === "loading"
          ? "Loading address suggestions…"
          : state === "unavailable"
            ? "Automatic search is unavailable. Enter the address manually below."
            : "Choose a suggestion to fill the address fields, then review them below."}
      </p>
      <div className="mt-3 flex items-center gap-2" aria-hidden="true">
        <span className="h-px flex-1 bg-blue-200" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Or enter manually below
        </span>
        <span className="h-px flex-1 bg-blue-200" />
      </div>
    </div>
  );
}
