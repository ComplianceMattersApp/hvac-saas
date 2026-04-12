"use client";

import { useMemo, useState } from "react";

type CustomerOption = {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
};

type LocationOption = {
  id: string;
  customerId: string;
  displayName: string;
  addressLine1: string | null;
  city: string | null;
  zip: string | null;
};

type Proposed = {
  customerFirstName: string;
  customerLastName: string;
  customerPhone: string;
  customerEmail: string;
  addressLine1: string;
  city: string;
  zip: string;
  locationNickname: string;
};

type PermitMatchRow = {
  id: string;
  title: string;
  jobAddress: string | null;
  city: string | null;
  permitNumber: string | null;
  opsStatus: string | null;
  status: string | null;
  createdAt: string | null;
  customerName: string;
};

type Props = {
  submissionId: string;
  customers: CustomerOption[];
  locations: LocationOption[];
  disabled: boolean;
  proposed: Proposed;
  submitAction: (formData: FormData) => Promise<void>;
  duplicateAction: (formData: FormData) => Promise<void>;
  permitNumber: string | null;
  permitMatches: PermitMatchRow[];
};

// ── Scoring helpers ────────────────────────────────────────────────────────────

function digitsOnly(v: string | null | undefined) {
  return String(v ?? "").replace(/\D/g, "");
}

type MatchReasons = ("name" | "phone" | "email" | "address")[];

function scoreCustomer(
  c: CustomerOption,
  proposed: Proposed,
  addressMatchIds?: Set<string>,
): { score: number; reasons: MatchReasons } {
  let score = 0;
  const reasons: MatchReasons = [];

  const cName = c.displayName.toLowerCase();
  const proposedFirst = proposed.customerFirstName.toLowerCase().trim();
  const proposedLast = proposed.customerLastName.toLowerCase().trim();

  const proposedPhoneDigits = digitsOnly(proposed.customerPhone);
  const cPhoneDigits = digitsOnly(c.phone);

  const proposedEmail = proposed.customerEmail.toLowerCase().trim();
  const cEmail = String(c.email ?? "").toLowerCase().trim();

  // Last name is the strongest name signal
  if (proposedLast && cName.includes(proposedLast)) {
    score += 3;
    reasons.push("name");
  } else if (proposedFirst && cName.includes(proposedFirst)) {
    score += 1;
    // first-name-only is a weak signal — don't badge it
  }

  // Phone: match on last 7 digits to handle formatting differences
  if (
    proposedPhoneDigits.length >= 7 &&
    cPhoneDigits.length >= 7 &&
    cPhoneDigits.slice(-7) === proposedPhoneDigits.slice(-7)
  ) {
    score += 4;
    reasons.push("phone");
  }

  // Email: exact match only
  if (proposedEmail && cEmail && cEmail === proposedEmail) {
    score += 4;
    reasons.push("email");
  }

  // Address: customer owns a location matching the proposed address
  if (addressMatchIds?.has(c.id)) {
    score += 3;
    reasons.push("address");
  }

  return { score, reasons };
}

function searchText(c: CustomerOption) {
  return [c.displayName, c.phone, c.email]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function matchesQuery(c: CustomerOption, rawQuery: string) {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  const textMatch = searchText(c).includes(q);
  if (textMatch) return true;

  // Phone equivalence matching for typed values like:
  // 2095182383, 209-518-2383, (209) 518-2383, 209 518 2383
  const qDigits = digitsOnly(rawQuery);
  if (!qDigits) return false;

  const customerPhoneDigits = digitsOnly(c.phone);
  return customerPhoneDigits.includes(qDigits);
}

// ── Initial seed query for the search box ────────────────────────────────────

function seedQuery(proposed: Proposed) {
  const phoneDigits = digitsOnly(proposed.customerPhone);
  if (phoneDigits.length >= 7) return phoneDigits.slice(-7);
  if (phoneDigits) return phoneDigits;
  const email = proposed.customerEmail.trim();
  if (email) return email;
  const last = proposed.customerLastName.trim();
  if (last) return last;
  const first = proposed.customerFirstName.trim();
  return first || "";
}

// ── Address normalization helpers ─────────────────────────────────────────────

function normalizeAddr(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(
      /\b(street|avenue|drive|road|lane|boulevard|court|place|circle|highway|parkway)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function houseNumber(addr: string): string {
  const m = addr.match(/^(\d+)/);
  return m ? m[1] : "";
}

/**
 * Returns true when a location's address is likely the same physical property
 * as the proposed address. ZIP must agree (when both present); house number
 * must match exactly; at least one meaningful street-name token must overlap.
 * Intentionally permissive to surface possible duplicates for operator review.
 */
function addressMatchesProposed(loc: LocationOption, proposed: Proposed): boolean {
  const propAddr = normalizeAddr(proposed.addressLine1);
  const locAddr = normalizeAddr(loc.addressLine1);
  if (!propAddr || !locAddr) return false;

  const propZip = digitsOnly(proposed.zip);
  const locZip = digitsOnly(loc.zip);
  // ZIP mismatch is a hard disqualifier when both sides have a ZIP
  if (propZip && locZip && propZip !== locZip) return false;

  const propNum = houseNumber(propAddr);
  const locNum = houseNumber(locAddr);
  if (!propNum || !locNum || propNum !== locNum) return false;

  // At least one non-trivial street-name token must match
  const propTokens = propAddr.replace(/^\d+\s*/, "").split(/\s+/).filter((t) => t.length > 1);
  const locTokens = locAddr.replace(/^\d+\s*/, "").split(/\s+/).filter((t) => t.length > 1);
  if (!propTokens.length || !locTokens.length) return false;

  return propTokens.some((t) => locTokens.includes(t));
}

// ── Component ────────────────────────────────────────────────────────────────

const MAX_RESULTS = 8;

export default function GuidedFinalizationWizard({
  submissionId,
  customers,
  locations,
  disabled,
  proposed,
  submitAction,
  duplicateAction,
  permitNumber,
  permitMatches,
}: Props) {
  // Match-first: search is the entry point, no upfront path choice
  const [query, setQuery] = useState(() => seedQuery(proposed));
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [locationPath, setLocationPath] = useState<null | "existing" | "new">(null);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  // Operator explicitly chose "none match — create new"
  const [goingNew, setGoingNew] = useState(false);
  const [permitInterceptAcknowledged, setPermitInterceptAcknowledged] = useState(false);
  const [selectedDuplicateJobId, setSelectedDuplicateJobId] = useState<string | null>(null);

  // ── Derived finalization mode ───────────────────────────────────────────────
  const finalizationMode =
    goingNew
      ? "new_new"
      : selectedCustomerId && locationPath === "existing"
        ? "existing_existing"
        : selectedCustomerId && locationPath === "new"
          ? "existing_new"
          : null;

  const isReady =
    (finalizationMode === "existing_existing" && !!selectedCustomerId && !!selectedLocationId) ||
    (finalizationMode === "existing_new" && !!selectedCustomerId) ||
    finalizationMode === "new_new";

  // ── Address match detection (cross-customer) ───────────────────────────────────
  const allAddressMatches = useMemo(
    () => locations.filter((l) => addressMatchesProposed(l, proposed)),
    [locations, proposed],
  );

  const addressMatchCustomerIds = useMemo(
    () => new Set(allAddressMatches.map((l) => l.customerId)),
    [allAddressMatches],
  );

  // ── Scored + filtered customer list ──────────────────────────────────────────
  const rankedCustomers = useMemo(() => {
    const filtered = customers.filter((c) => matchesQuery(c, query));
    return filtered
      .map((c) => ({ ...c, ...scoreCustomer(c, proposed, addressMatchCustomerIds) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);
  }, [customers, query, proposed, addressMatchCustomerIds]);

  const totalFiltered = useMemo(() => {
    return customers.filter((c) => matchesQuery(c, query)).length;
  }, [customers, query]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const locationOptions = useMemo(() => {
    if (!selectedCustomerId) return [];
    return locations.filter((l) => l.customerId === selectedCustomerId);
  }, [locations, selectedCustomerId]);

  const selectedLocation = useMemo(
    () => locationOptions.find((l) => l.id === selectedLocationId) ?? null,
    [locationOptions, selectedLocationId],
  );

  const bestMatch = rankedCustomers.length > 0 ? rankedCustomers[0] : null;

  const bestMatchBasis = useMemo(() => {
    if (!bestMatch || bestMatch.score <= 0 || bestMatch.reasons.length === 0) return "";
    if (bestMatch.reasons.length === 1) return `Best match based on ${bestMatch.reasons[0]}.`;
    const last = bestMatch.reasons[bestMatch.reasons.length - 1];
    const initial = bestMatch.reasons.slice(0, -1);
    return `Best match based on ${initial.join(", ")} and ${last}.`;
  }, [bestMatch]);
  // ── Address match summaries ───────────────────────────────────────────────
  const addressMatchSummary = useMemo(() => {
    const matched = customers.filter((c) => addressMatchCustomerIds.has(c.id));
    if (matched.length === 0) return "";
    if (matched.length === 1) return matched[0].displayName;
    const last = matched[matched.length - 1].displayName;
    const initial = matched.slice(0, -1).map((c) => c.displayName);
    return `${initial.join(", ")} and ${last}`;
  }, [customers, addressMatchCustomerIds]);

  const crossCustomerAddressMatches = useMemo(
    () => allAddressMatches.filter((l) => l.customerId !== selectedCustomerId),
    [allAddressMatches, selectedCustomerId],
  );

  const crossCustomerMatchNames = useMemo(() => {
    const names = [
      ...new Set(
        crossCustomerAddressMatches.map((l) => {
          const c = customers.find((cu) => cu.id === l.customerId);
          return c?.displayName ?? "another customer";
        }),
      ),
    ];
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    const last = names[names.length - 1];
    const initial = names.slice(0, -1);
    return `${initial.join(", ")} and ${last}`;
  }, [crossCustomerAddressMatches, customers]);
  // ── Reset helpers ───────────────────────────────────────────────────────────
  function resetCustomer() {
    setSelectedCustomerId("");
    setLocationPath(null);
    setSelectedLocationId("");
    setGoingNew(false);
    setQuery(seedQuery(proposed));
  }

  function resetLocation() {
    setLocationPath(null);
    setSelectedLocationId("");
  }

  // ── Disabled state ──────────────────────────────────────────────────────────
  if (disabled) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">
          This proposal has already been reviewed and cannot be modified.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── PERMIT INTERCEPT AND DUPLICATE RESOLUTION (outside main form) ─── */}
      {permitNumber && permitMatches.length > 0 && !permitInterceptAcknowledged ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm space-y-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0 text-base" aria-hidden="true">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-amber-900">Permit number already on file</p>
              <p className="mt-0.5 text-xs text-amber-800">
                Permit{" "}
                <span className="font-mono font-semibold">{permitNumber}</span> is already linked
                to{" "}
                {permitMatches.length === 1
                  ? "an existing job"
                  : `${permitMatches.length} existing jobs`}
                . Review before finalizing.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {permitMatches.map((match) => (
              <div
                key={match.id}
                className={[
                  "rounded-xl border bg-white px-3 py-2.5",
                  selectedDuplicateJobId === match.id
                    ? "border-rose-300 ring-1 ring-rose-200"
                    : "border-amber-200",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{match.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {[match.jobAddress, match.city].filter(Boolean).join(", ") || "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {match.customerName}
                      {" · "}
                      {match.opsStatus?.replace(/_/g, " ") || match.status || "—"}
                    </p>
                  </div>
                  <a
                    href={`/jobs/${match.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-900 hover:bg-slate-50"
                  >
                    Open →
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDuplicateJobId(
                        selectedDuplicateJobId === match.id ? null : match.id,
                      )
                    }
                    className={[
                      "mt-1 rounded-lg border px-2.5 py-1 text-xs font-medium",
                      selectedDuplicateJobId === match.id
                        ? "border-rose-400 bg-rose-100 text-rose-800"
                        : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
                    ].join(" ")}
                  >
                    {selectedDuplicateJobId === match.id ? "✓ Selected" : "Mark as duplicate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-amber-200 pt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-amber-700">
              If this is a duplicate, open the existing job instead of creating a new one.
            </p>
            <button
              type="button"
              onClick={() => setPermitInterceptAcknowledged(true)}
              className="shrink-0 text-xs font-semibold text-amber-800 underline hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
            >
              Continue anyway
            </button>
          </div>
          {selectedDuplicateJobId ? (
            <form action={duplicateAction} className="border-t border-amber-200 pt-3 space-y-3">
              <input type="hidden" name="submission_id" value={submissionId} />
              <input type="hidden" name="duplicate_job_id" value={selectedDuplicateJobId} />
              <div>
                <p className="text-xs font-semibold text-rose-800">
                  Mark as duplicate of:{" "}
                  <span className="italic">
                    {permitMatches.find((m) => m.id === selectedDuplicateJobId)?.title}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-rose-700">
                  The proposal will be closed without creating a new job.
                </p>
              </div>
              <textarea
                name="review_note"
                placeholder="Optional note for this decision…"
                className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs"
                rows={2}
              />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-1"
                >
                  Confirm — mark as duplicate
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDuplicateJobId(null)}
                  className="text-xs text-slate-500 underline hover:text-slate-700"
                >
                  ← Cancel
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
      {permitNumber && permitMatches.length > 0 && permitInterceptAcknowledged ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="shrink-0 text-xs text-amber-500" aria-hidden="true">⚠</span>
          <p className="text-xs text-amber-800">
            Permit{" "}
            <span className="font-mono font-semibold">{permitNumber}</span> is already on file
            — proceeding with awareness.
          </p>
        </div>
      ) : null}

      <form action={submitAction} className="space-y-3">
      {/* Hidden form contract fields */}
      <input type="hidden" name="submission_id" value={submissionId} />
      {finalizationMode ? (
        <input type="hidden" name="finalization_mode" value={finalizationMode} />
      ) : null}
      {selectedCustomerId && !goingNew ? (
        <input type="hidden" name="existing_customer_id" value={selectedCustomerId} />
      ) : null}
      {finalizationMode === "existing_existing" && selectedLocationId ? (
        <input type="hidden" name="existing_location_id" value={selectedLocationId} />
      ) : null}

      {/* ── MATCH-FIRST: Customer search (shown until customer is resolved) ── */}
      {!selectedCustomerId && !goingNew ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          {allAddressMatches.length > 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <span className="mt-px shrink-0 text-sm text-amber-500" aria-hidden="true">⚠️</span>
              <div>
                <p className="text-xs font-semibold text-amber-900">Address already on file</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  This address is linked to{" "}
                  <span className="font-semibold">{addressMatchSummary}</span>. Review the
                  highlighted customer{addressMatchCustomerIds.size > 1 ? "s" : ""} below before
                  creating new records.
                </p>
              </div>
            </div>
          ) : null}
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Find matching customer</h3>
            <p className="mt-1 text-xs text-slate-500">
              Search pre-filled from proposal. Select a match, or scroll down to create new.
            </p>
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
              htmlFor="wizard_customer_query"
            >
              Search
            </label>
            <input
              id="wizard_customer_query"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, phone, or email…"
              autoComplete="off"
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Scored match results */}
          {rankedCustomers.length > 0 ? (
            <div className="space-y-1.5">
              {rankedCustomers.map((c, index) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId(c.id);
                    setGoingNew(false);
                    setLocationPath(null);
                    setSelectedLocationId("");
                  }}
                  className={[
                    "w-full rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900",
                    index === 0 && c.score > 0
                      ? "border-slate-400 bg-slate-100 shadow-sm hover:border-slate-800 hover:bg-white active:scale-[0.99]"
                      : c.score > 0
                        ? "border-slate-300 bg-slate-50 hover:border-slate-800 hover:bg-white active:scale-[0.99]"
                      : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99]",
                  ].join(" ")}
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-slate-900">{c.displayName}</span>
                    {index === 0 && c.score > 0 ? (
                      <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        best match
                      </span>
                    ) : null}
                    {c.reasons.includes("name") ? (
                      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                        name
                      </span>
                    ) : null}
                    {c.reasons.includes("phone") ? (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        phone
                      </span>
                    ) : null}
                    {c.reasons.includes("email") ? (
                      <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-700">
                        email
                      </span>
                    ) : null}
                    {c.reasons.includes("address") ? (
                      <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                        address
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {c.phone || "No phone"}
                    {c.phone && c.email ? " · " : ""}
                    {c.email || ""}
                  </span>
                </button>
              ))}
              {totalFiltered > MAX_RESULTS ? (
                <p className="pl-1 text-xs text-slate-400">
                  Showing {MAX_RESULTS} of {totalFiltered} — refine search to narrow results
                </p>
              ) : null}
              {bestMatchBasis ? (
                <p className="pl-1 text-xs text-slate-500">{bestMatchBasis}</p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-500">
              No customers match that search.
            </div>
          )}

          {/* Escape hatch: create new */}
          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => {
                setGoingNew(true);
                setSelectedCustomerId("");
                setLocationPath(null);
                setSelectedLocationId("");
              }}
              className="group w-full rounded-xl border-2 border-slate-300 bg-slate-50 px-4 py-3 text-left text-sm shadow-sm transition-all hover:border-slate-600 hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-400 bg-white text-[12px] font-bold text-slate-700">+</span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">Create new customer from this proposal</span>
                    <span className="mt-0.5 block text-xs text-slate-600">No good existing customer match found</span>
                  </span>
                </span>
                <span className="mt-0.5 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500 transition-colors group-hover:text-slate-700">continue</span>
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {/* ── CUSTOMER CONFIRMED: locked header ─────────────────────────── */}
      {selectedCustomerId && !goingNew ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</p>
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">✓ matched</span>
              </div>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{selectedCustomer?.displayName}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {selectedCustomer?.phone || "No phone"}
                {selectedCustomer?.phone && selectedCustomer?.email ? " · " : ""}
                {selectedCustomer?.email || ""}
              </p>
            </div>
            <button
              type="button"
              onClick={resetCustomer}
              className="shrink-0 text-xs text-slate-400 underline hover:text-slate-700"
            >
              ← Different customer
            </button>
          </div>
        </div>
      ) : null}

      {/* ── GOING NEW: locked header ───────────────────────────────────── */}
      {goingNew ? (
        <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</p>
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">new</span>
              </div>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">New customer</p>
              <p className="mt-0.5 text-xs text-slate-500">Will be created from proposal details below</p>
            </div>
            <button
              type="button"
              onClick={resetCustomer}
              className="shrink-0 text-xs text-slate-400 underline hover:text-slate-700"
            >
              ← Search again
            </button>
          </div>
        </div>
      ) : null}

      {/* ── LOCATION CHOICE (after existing customer confirmed) ─────────── */}
      {selectedCustomerId && !goingNew && locationPath === null ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Does the proposed address match an existing location?
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Select a match from the list, or create a new location from the proposal.
            </p>
          </div>

          {crossCustomerAddressMatches.length > 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <span className="mt-px shrink-0 text-sm text-amber-500" aria-hidden="true">⚠️</span>
              <div>
                <p className="text-xs font-semibold text-amber-900">Same address under a different customer</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  This address is already on file under{" "}
                  <span className="font-semibold">{crossCustomerMatchNames}</span>. If this is the
                  same household, go back and use that customer instead.
                </p>
              </div>
            </div>
          ) : null}

          {locationOptions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Existing locations on file
              </p>
              {locationOptions.map((location) => (
                <button
                  key={location.id}
                  type="button"
                  onClick={() => {
                    setSelectedLocationId(location.id);
                    setLocationPath("existing");
                  }}
                  className="group w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-left text-sm transition-all hover:border-slate-800 hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span>
                      <span className="block font-semibold text-slate-900">{location.addressLine1 || location.displayName}</span>
                      <span className="mt-0.5 block text-xs text-slate-600">
                        {location.city || "City not set"}
                        {location.zip ? `, ${location.zip}` : ""}
                      </span>
                      {location.addressLine1 && location.addressLine1 !== location.displayName ? (
                        <span className="mt-0.5 block text-[11px] text-slate-500">{location.displayName}</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 shrink-0 text-slate-400 transition-colors group-hover:text-slate-700">→</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              This customer has no existing locations on file.
            </div>
          )}

          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setLocationPath("new")}
              className="w-full rounded-xl border-2 border-slate-300 bg-slate-50 px-4 py-3 text-left text-sm transition-all hover:border-slate-700 hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <span className="block font-semibold text-slate-900">Create new location from proposed address</span>
              <span className="mt-0.5 block text-xs text-slate-600">
                Use this when none of the existing locations match
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {/* ── EXISTING LOCATION confirmed ───────────────────────────────── */}
      {selectedCustomerId && !goingNew && locationPath === "existing" ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p>
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">✓ matched</span>
              </div>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {selectedLocation?.addressLine1 || selectedLocation?.displayName}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {selectedLocation?.city || "City not set"}
                {selectedLocation?.zip ? `, ${selectedLocation.zip}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={resetLocation}
              className="shrink-0 text-xs text-slate-400 underline hover:text-slate-700"
            >
              ← Change
            </button>
          </div>
        </div>
      ) : null}

      {/* ── NEW LOCATION fields (existing customer + new location) ─────── */}
      {selectedCustomerId && !goingNew && locationPath === "new" ? (
        <div className="rounded-2xl border border-slate-300 bg-slate-50 p-5 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p>
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">new</span>
              </div>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                New location for {selectedCustomer?.displayName}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Pre-filled from proposal. Edit if needed.</p>
            </div>
            <button
              type="button"
              onClick={resetLocation}
              className="shrink-0 text-xs text-slate-400 underline hover:text-slate-700"
            >
              ← Change
            </button>
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
              htmlFor="wizard_en_location_nickname"
            >
              Nickname (optional)
            </label>
            <input
              id="wizard_en_location_nickname"
              name="new_location_nickname"
              defaultValue={proposed.locationNickname}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
              htmlFor="wizard_en_address_line1"
            >
              Address
            </label>
            <input
              id="wizard_en_address_line1"
              name="new_address_line1"
              defaultValue={proposed.addressLine1}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                htmlFor="wizard_en_city"
              >
                City
              </label>
              <input
                id="wizard_en_city"
                name="new_city"
                defaultValue={proposed.city}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                htmlFor="wizard_en_zip"
              >
                ZIP
              </label>
              <input
                id="wizard_en_zip"
                name="new_zip"
                defaultValue={proposed.zip}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* ── NEW CUSTOMER + LOCATION fields ────────────────────────────── */}
      {goingNew ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          {allAddressMatches.length > 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <span className="mt-px shrink-0 text-sm text-amber-500" aria-hidden="true">⚠️</span>
              <div>
                <p className="text-xs font-semibold text-amber-900">Address already on file</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  This address is on file under{" "}
                  <span className="font-semibold">{addressMatchSummary}</span>. Consider using
                  that customer instead of creating a new record.
                </p>
              </div>
            </div>
          ) : null}
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Confirm new customer details</h3>
            <p className="mt-1 text-xs text-slate-500">Pre-filled from proposal. Edit if needed.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                htmlFor="wizard_nn_first_name"
              >
                First name
              </label>
              <input
                id="wizard_nn_first_name"
                name="new_customer_first_name"
                defaultValue={proposed.customerFirstName}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                htmlFor="wizard_nn_last_name"
              >
                Last name
              </label>
              <input
                id="wizard_nn_last_name"
                name="new_customer_last_name"
                defaultValue={proposed.customerLastName}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                htmlFor="wizard_nn_phone"
              >
                Phone
              </label>
              <input
                id="wizard_nn_phone"
                name="new_customer_phone"
                defaultValue={proposed.customerPhone}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                htmlFor="wizard_nn_email"
              >
                Email
              </label>
              <input
                id="wizard_nn_email"
                name="new_customer_email"
                defaultValue={proposed.customerEmail}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">New location</p>
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                htmlFor="wizard_nn_location_nickname"
              >
                Nickname (optional)
              </label>
              <input
                id="wizard_nn_location_nickname"
                name="new_location_nickname"
                defaultValue={proposed.locationNickname}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                htmlFor="wizard_nn_address_line1"
              >
                Address
              </label>
              <input
                id="wizard_nn_address_line1"
                name="new_address_line1"
                defaultValue={proposed.addressLine1}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                  htmlFor="wizard_nn_city"
                >
                  City
                </label>
                <input
                  id="wizard_nn_city"
                  name="new_city"
                  defaultValue={proposed.city}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
                  htmlFor="wizard_nn_zip"
                >
                  ZIP
                </label>
                <input
                  id="wizard_nn_zip"
                  name="new_zip"
                  defaultValue={proposed.zip}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── FINALIZE (shown when path is fully resolved) ───────────────── */}
      {isReady ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Ready to finalize</p>
            <p className="mt-1 text-xs text-slate-600">
              Add an optional note, then confirm to create the job and close this proposal.
            </p>
          </div>
          <textarea
            name="review_note"
            placeholder="Optional note for this decision…"
            className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
            rows={2}
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            Finalize proposal →
          </button>
        </div>
      ) : null}
      </form>
    </div>
  );
}
