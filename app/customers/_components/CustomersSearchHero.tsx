"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
      helper: "Pick a seeded example below or start typing whatever fragment you have. The search works well even when you only know part of the record.",
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
      helper: "This is useful when you only know part of a phone number. You can search with a short digit fragment like 209 or a longer portion of the full number.",
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

export function CustomersSearchHero({ initialQuery }: { initialQuery: string }) {
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
    <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_58%,rgba(239,246,255,0.72))] p-6 shadow-[0_24px_52px_-34px_rgba(15,23,42,0.28)]">
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Customer Search</p>
          <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">Search Customers</h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Find customer records quickly across the account without leaving your operational flow. Use this page when you need a fast path into customer details, saved locations, or existing contact history.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white/88 p-4 shadow-[0_14px_32px_-26px_rgba(15,23,42,0.18)] sm:p-5">
          <div className="space-y-2">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">Search by the details operators actually remember</h2>
            <p className="text-sm leading-6 text-slate-600">
              Search by customer name, email, phone number, address, or city.
            </p>
            <p className="text-xs leading-5 text-slate-500">
              Start with whatever fragment you have. Suggestions below use real scoped customer matches as you type.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <form className="flex flex-col gap-3 sm:flex-row" action="/customers" method="get">
              <input
                ref={inputRef}
                name="q"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Start with a customer name, phone digits, email, street, or city"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.28)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(15,23,42,0.45)] transition-[background-color,box-shadow,transform] hover:bg-slate-800 hover:shadow-[0_20px_30px_-18px_rgba(15,23,42,0.5)] active:translate-y-[0.5px]"
              >
                Search
              </button>
            </form>

            {showSuggestions ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_28px_-24px_rgba(15,23,42,0.16)]">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/85 px-4 py-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Live customer suggestions</div>
                    <div className="mt-1 text-sm font-medium text-slate-900">
                      {loading ? "Looking for matches..." : `Matches for “${query.trim()}”`}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">Press Enter to search all results</div>
                </div>

                {loading ? (
                  <div className="px-4 py-4 text-sm text-slate-600">Searching scoped customers...</div>
                ) : suggestions.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-slate-600">
                    No quick suggestions yet. Press Search to run the full lookup for “{query.trim()}”.
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
                            <div className="text-sm font-semibold text-slate-950">{displayName}</div>
                            <div className="truncate text-xs text-slate-500">
                              {suggestion.phone ?? "No phone"}
                              {suggestion.email ? ` • ${suggestion.email}` : ""}
                            </div>
                            <div className="truncate text-xs text-slate-600">{addressLine}</div>
                          </div>

                          <div className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
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

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Live guidance</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{searchIntent.title}</div>
            <p className="mt-1 text-sm leading-6 text-slate-600">{searchIntent.helper}</p>
          </div>
        </div>
      </div>
    </div>
  );
}