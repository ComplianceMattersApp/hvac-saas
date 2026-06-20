import Link from "next/link";
import { ArrowDownAZ, ArrowDownZA, BriefcaseBusiness, CalendarDays, Download, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInternalUser } from "@/lib/auth/internal-user";
import {
  type CustomerDirectorySort,
  listScopedCustomerDirectory,
} from "@/lib/customers/visibility";
import { CustomerSearchPanel } from "@/app/customers/_components/CustomerSearchPanel";
import {
  buildCustomerDirectorySections,
  CUSTOMER_DIRECTORY_NAV_KEYS,
  getAvailableCustomerDirectoryLetters,
  getCustomerDirectoryAnchorId,
} from "@/lib/customers/directory-sections";
import { formatDateOnlyDisplay, formatTimestampDateDisplayLA } from "@/lib/utils/schedule-la";

const DEFAULT_DIRECTORY_LIMIT = 100;
const SEARCH_DIRECTORY_LIMIT = 25;

function normalizeSort(value: unknown): CustomerDirectorySort {
  return String(value ?? "").trim().toLowerCase() === "za" ? "za" : "az";
}

function customerDirectoryHref(params: { q?: string; sort: CustomerDirectorySort }) {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.sort !== "az") searchParams.set("sort", params.sort);
  const query = searchParams.toString();
  return query ? `/customers?${query}` : "/customers";
}

function customerExportHref(params: { q?: string; sort: CustomerDirectorySort }) {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.sort !== "az") searchParams.set("sort", params.sort);
  const query = searchParams.toString();
  return query ? `/customers/export?${query}` : "/customers/export";
}

function formatDirectoryDate(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "No jobs yet";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDateOnlyDisplay(raw);
  return formatTimestampDateDisplayLA(raw) || raw;
}

export default async function CustomersPage(props: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const sp = await props.searchParams;
  const q = (sp?.q ?? "").trim();
  const sort = normalizeSort(sp?.sort);
  const hasQuery = q.length > 0;
  const resultLimit = hasQuery ? SEARCH_DIRECTORY_LIMIT : DEFAULT_DIRECTORY_LIMIT;

  const [scoped, internalUser] = await Promise.all([
    listScopedCustomerDirectory({
      supabase,
      userId: userData.user.id,
      searchText: q,
      resultLimit,
      sortDirection: sort,
    }),
    getInternalUser({ supabase, userId: userData.user.id }).catch(() => null),
  ]);

  const results = scoped.results;
  const canExportCustomers =
    internalUser?.is_active === true &&
    (internalUser.role === "admin" || internalUser.role === "office");
  const sortToggle = sort === "az" ? "za" : "az";
  const directorySections = buildCustomerDirectorySections(results);
  const availableDirectoryLetters = getAvailableCustomerDirectoryLetters(directorySections);
  const activeDirectoryLetters = new Set(availableDirectoryLetters);

  return (
    <div className="mx-auto max-w-6xl space-y-5 bg-slate-50 p-3 text-slate-900 sm:p-6">
      <CustomerSearchPanel initialQuery={q} />

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {hasQuery ? "Filtered Directory" : "Alphabetical Directory"}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
              {hasQuery ? `Customers matching "${q}"` : "Customers A-Z"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {results.length} customer{results.length === 1 ? "" : "s"} visible
              {hasQuery ? ` for this search` : ""}. Rows open the customer workspace.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={customerDirectoryHref({ q, sort: sortToggle })}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              {sort === "az" ? (
                <ArrowDownZA className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ArrowDownAZ className="h-4 w-4" aria-hidden="true" />
              )}
              {sort === "az" ? "Z-A" : "A-Z"}
            </Link>
            {canExportCustomers ? (
              <Link
                href={customerExportHref({ q, sort })}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export CSV
              </Link>
            ) : null}
          </div>
        </div>

        {results.length > 0 ? (
          <nav
            aria-label="Customer directory letter navigation"
            className="sticky top-16 z-20 border-b border-slate-200 bg-white/95 px-4 py-2 shadow-sm shadow-slate-950/5 backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:px-5 lg:top-20"
          >
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:hidden">
              {availableDirectoryLetters.map((letter) => (
                <a
                  key={letter}
                  href={`#${getCustomerDirectoryAnchorId(letter)}`}
                  aria-label={`Jump to customers starting with ${letter === "#" ? "a number or symbol" : letter}`}
                  className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  {letter}
                </a>
              ))}
            </div>

            <div className="-mx-1 hidden gap-1 px-1 sm:flex sm:flex-wrap">
              {CUSTOMER_DIRECTORY_NAV_KEYS.map((letter) => {
                const isActive = activeDirectoryLetters.has(letter);
                const chipClass = isActive
                  ? "border-slate-300 bg-white text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-100"
                  : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400";

                return isActive ? (
                  <a
                    key={letter}
                    href={`#${getCustomerDirectoryAnchorId(letter)}`}
                    aria-label={`Jump to customers starting with ${letter === "#" ? "a number or symbol" : letter}`}
                    className={`inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-md border px-2 text-sm font-semibold transition ${chipClass}`}
                  >
                    {letter}
                  </a>
                ) : (
                  <button
                    key={letter}
                    type="button"
                    disabled
                    aria-disabled="true"
                    aria-label={`No visible customers starting with ${letter === "#" ? "a number or symbol" : letter}`}
                    className={`inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-md border px-2 text-sm font-semibold ${chipClass}`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          </nav>
        ) : null}

        {results.length === 0 ? (
          <div className="px-5 py-8">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-950">
                {hasQuery ? "No customer matches" : "No customers visible yet"}
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                {hasQuery
                  ? `No matches for "${q}". Try a broader name fragment, fewer phone digits, or part of the address or city.`
                  : "Customer records will appear here as soon as they are visible in your account scope."}
              </p>
            </div>
          </div>
        ) : (
          <div>
            {directorySections.map((section, sectionIndex) => (
              <section
                key={section.key}
                id={section.anchorId}
                aria-labelledby={`${section.anchorId}-heading`}
                className="scroll-mt-32 lg:scroll-mt-36"
              >
                <div className={`${sectionIndex === 0 ? "" : "border-t border-slate-200"} bg-white px-4 py-3 sm:px-5`}>
                  <h3
                    id={`${section.anchorId}-heading`}
                    className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500"
                  >
                    {section.key}
                  </h3>
                </div>
                <div className="divide-y divide-slate-200 border-t border-slate-100">
                  {section.customers.map((r) => {
                    const displayName = String(r.full_name ?? "").trim() || "Unnamed Customer";
                    const addressLine = r.sample_address
                      ? `${r.sample_address}${r.sample_city ? `, ${r.sample_city}` : ""}`
                      : "No address on file yet";

                    return (
                      <Link
                        key={r.customer_id}
                        href={`/customers/${r.customer_id}`}
                        className="grid gap-3 px-4 py-4 transition-colors hover:bg-slate-50 sm:px-5 lg:grid-cols-[minmax(260px,1.4fr)_minmax(220px,1fr)_minmax(220px,0.9fr)] lg:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-semibold text-slate-950">
                            <UserRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                            <span className="truncate">{displayName}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{r.phone ?? "No phone"}</span>
                            </span>
                            {r.email ? (
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{r.email}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                          <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                          <span className="truncate">{addressLine}</span>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            {r.locations_count} location{r.locations_count === 1 ? "" : "s"}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                            <BriefcaseBusiness className="h-3.5 w-3.5" aria-hidden="true" />
                            {r.open_job_count} open
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                            {formatDirectoryDate(r.last_job_date)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
