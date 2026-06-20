"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type CustomerSuggestion = {
  customer_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  locations_count: number;
  sample_address: string | null;
  sample_city: string | null;
};

type Props = {
  compact?: boolean;
  onNavigate?: () => void;
};

function secondaryLine(suggestion: CustomerSuggestion) {
  const location = [suggestion.sample_address, suggestion.sample_city].filter(Boolean).join(", ");
  if (location) return location;
  if (suggestion.email) return suggestion.email;
  if (suggestion.phone) return suggestion.phone;
  return suggestion.locations_count > 0 ? `${suggestion.locations_count} locations` : "Customer record";
}

export default function HeaderCustomerSearch({ compact = false, onNavigate }: Props) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const trimmedQuery = query.trim();
  const showPanel = focused && trimmedQuery.length >= 2;

  useEffect(() => {
    setFocused(false);
    setQuery("");
    setSuggestions([]);
  }, [pathname]);

  useEffect(() => {
    if (!showPanel) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/customers/suggestions?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setSuggestions([]);
          return;
        }
        const payload = (await response.json()) as { suggestions?: CustomerSuggestion[] };
        setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
      } catch (error) {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [showPanel, trimmedQuery]);

  useEffect(() => {
    if (!focused) return;

    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setFocused(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFocused(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [focused]);

  const emptyLabel = useMemo(() => {
    if (loading) return "Searching...";
    return trimmedQuery.length >= 2 ? "No customers found" : "Search customers";
  }, [loading, trimmedQuery.length]);

  function handleNavigate() {
    setFocused(false);
    onNavigate?.();
  }

  return (
    <div ref={rootRef} className={["relative", compact ? "w-full" : "w-full max-w-sm xl:max-w-md"].join(" ")}>
      <label className="sr-only" htmlFor={compact ? "mobile-customer-search" : "header-customer-search"}>
        Search customers
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          id={compact ? "mobile-customer-search" : "header-customer-search"}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search customers"
          autoComplete="off"
          className={[
            "h-9 w-full rounded-lg border border-slate-200 bg-slate-50/80 pl-9 pr-3 text-sm font-medium text-slate-950 outline-none transition-colors placeholder:text-slate-400",
            "focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200/80",
          ].join(" ")}
        />
      </div>

      {showPanel ? (
        <div
          className={[
            "absolute z-50 mt-2 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_20px_42px_-26px_rgba(15,23,42,0.42)]",
            compact ? "left-0 right-0" : "left-0 right-0",
          ].join(" ")}
        >
          {suggestions.length > 0 ? (
            <div className="max-h-80 overflow-y-auto p-1">
              {suggestions.map((suggestion) => (
                <Link
                  key={suggestion.customer_id}
                  href={`/customers/${suggestion.customer_id}`}
                  onClick={handleNavigate}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-950">
                      {suggestion.full_name || "Unnamed customer"}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{secondaryLine(suggestion)}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-sm font-medium text-slate-500">{emptyLabel}</div>
          )}
          <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-2">
            <Link
              href={`/customers?q=${encodeURIComponent(trimmedQuery)}`}
              onClick={handleNavigate}
              className="text-xs font-semibold text-slate-700 hover:text-slate-950"
            >
              Open customers search
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
