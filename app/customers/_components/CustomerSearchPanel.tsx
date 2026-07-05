"use client";

import { ArrowRight, Mail, MapPin, Phone, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SectionEyebrow } from "@/components/ui/SectionEyebrow";
import type { CustomerDirectorySort } from "@/lib/customers/visibility";
import type { CustomerDirectoryLetterFilter } from "@/lib/customers/directory-initials";

type CustomerSuggestion = {
  customer_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  locations_count: number;
  sample_location_id: string | null;
  sample_address: string | null;
  sample_city: string | null;
};

function detectSearchIntent(query: string) {
  const trimmed = query.trim();
  const digits = trimmed.replace(/\D/g, "");
  const lower = trimmed.toLowerCase();

  if (!trimmed) {
    return {
      title: "Try a name, phone digits, email, street, or city",
      helper: "Start with whatever fragment you have. Customer search works well even when you only know part of the record.",
    };
  }

  if (trimmed.includes("@")) {
    return {
      title: "Looks like an email search",
      helper: "Search will match customer email text exactly the same way as any other customer-visible scoped query.",
    };
  }

  if (digits.length >= 2 && digits.length >= Math.max(trimmed.length - 2, 2)) {
    return {
      title: "Looks like a phone-digit search",
      helper: "Useful when you only know part of a phone number. Try a short fragment like 209 or a longer portion of the full number.",
    };
  }

  if (/\b(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive|ct|court|way)\b/i.test(lower)) {
    return {
      title: "Looks like a street or address search",
      helper: "Search checks saved customer location addresses, so street fragments are often enough to find the right record.",
    };
  }

  if (trimmed.includes(" ")) {
    return {
      title: "Looks like a name or address fragment",
      helper: "Multi-word searches often work best for full customer names or address fragments like Main St.",
    };
  }

  return {
    title: "Looks like a name or city search",
    helper: "Short text searches are great for customer names, cities, or memorable address fragments.",
  };
}

function customerSearchHref(params: { q?: string; sort: CustomerDirectorySort; letter: CustomerDirectoryLetterFilter }) {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.letter !== "all") searchParams.set("letter", params.letter);
  if (params.sort !== "az") searchParams.set("sort", params.sort);
  const query = searchParams.toString();
  return query ? `/customers?${query}` : "/customers";
}

export function CustomerSearchPanel({
  initialQuery,
  initialSort,
  initialLetter,
}: {
  initialQuery: string;
  initialSort: CustomerDirectorySort;
  initialLetter: CustomerDirectoryLetterFilter;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const suggestionsCacheRef = useRef<Map<string, CustomerSuggestion[]>>(new Map());
  const activeRequestIdRef = useRef(0);
  const searchIntent = detectSearchIntent(query);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const cachedSuggestions = suggestionsCacheRef.current.get(trimmed);
    if (cachedSuggestions) {
      setSuggestions(cachedSuggestions);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;

    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/customers/suggestions?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          setSuggestions([]);
          return;
        }

        const payload = (await response.json()) as { suggestions?: CustomerSuggestion[] };
        const nextSuggestions = payload.suggestions ?? [];
        suggestionsCacheRef.current.set(trimmed, nextSuggestions);

        if (activeRequestIdRef.current === requestId) {
          setSuggestions(nextSuggestions);
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          if (activeRequestIdRef.current === requestId) {
            setSuggestions([]);
          }
        }
      } finally {
        if (activeRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    }, 120);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  const showSuggestions = query.trim().length >= 2;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.36)] sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <div className="space-y-1">
            <SectionEyebrow>Customer Directory</SectionEyebrow>
            <h1 className="text-2xl font-semibold tracking-tight text-navy">Find a Customer</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Search scoped customer records by the details operators actually have on hand: name, phone, email, street, or city.
            </p>
          </div>

          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" action="/customers" method="get">
            {initialLetter !== "all" ? <input type="hidden" name="letter" value={initialLetter} /> : null}
            {initialSort !== "az" ? <input type="hidden" name="sort" value={initialSort} /> : null}
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                ref={inputRef}
                name="q"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, phone, email, street, or city"
                className="min-h-12 w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-4 text-base text-slate-900 shadow-sm shadow-slate-950/5 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:translate-y-[0.5px]"
            >
              Search
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>

          {initialQuery ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <Link
                href={customerSearchHref({ sort: initialSort, letter: initialLetter })}
                className="font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
              >
                Clear search
              </Link>
              <Link
                href="/customers"
                className="font-semibold text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
              >
                Clear all filters
              </Link>
            </div>
          ) : null}

          {showSuggestions ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-950/5">
              <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/85 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <SectionEyebrow className="mb-0">Live Suggestions</SectionEyebrow>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {loading ? "Looking for matches..." : `Matches for "${query.trim()}"`}
                  </div>
                </div>
                <div className="text-xs text-slate-500">Press Enter for full results</div>
              </div>

              {loading ? (
                <div className="px-4 py-4 text-sm text-slate-600">Searching scoped customers...</div>
              ) : suggestions.length === 0 ? (
                <div className="px-4 py-4 text-sm leading-6 text-slate-600">
                  No quick suggestions yet. Press Search to run the full lookup for "{query.trim()}".
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {suggestions.map((suggestion) => {
                    const displayName = String(suggestion.full_name ?? "").trim() || "Unnamed Customer";
                    const addressLine = suggestion.sample_address
                      ? `${suggestion.sample_address}${suggestion.sample_city ? `, ${suggestion.sample_city}` : ""}`
                      : "No address on file yet";

                    return (
                      <Link
                        key={suggestion.customer_id}
                        href={`/customers/${suggestion.customer_id}`}
                        className="flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                            <UserRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                            <span className="truncate">{displayName}</span>
                          </div>
                          <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{suggestion.phone ?? "No phone"}</span>
                            </span>
                            {suggestion.email ? (
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{suggestion.email}</span>
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex min-w-0 items-center gap-1 truncate text-xs text-slate-600">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                            <span className="truncate">{addressLine}</span>
                          </div>
                        </div>

                        <div className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {suggestion.locations_count} location{suggestion.locations_count === 1 ? "" : "s"}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/85 p-4">
          <SectionEyebrow>Search Guidance</SectionEyebrow>
          <div className="mt-2 text-sm font-semibold text-navy">{searchIntent.title}</div>
          <p className="mt-1 text-sm leading-6 text-slate-600">{searchIntent.helper}</p>
          <div className="mt-4 grid gap-2 text-xs text-slate-600">
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">Phone fragments work well, even with only a few digits.</div>
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">Street and city searches check saved customer locations.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
