import Link from "next/link";
import { Mail, MapPin, Phone, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { searchScopedCustomers } from "@/lib/customers/visibility";
import { CustomersSearchHero } from "@/app/customers/_components/CustomersSearchHero";

export default async function CustomersPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const sp = await props.searchParams;
  const q = (sp?.q ?? "").trim();

  let results: Awaited<ReturnType<typeof searchScopedCustomers>>["results"] = [];

  if (q.length > 0) {
    const scoped = await searchScopedCustomers({
      supabase,
      userId: userData.user.id,
      searchText: q,
      resultLimit: 25,
    });

    results = scoped.results;
  }

  const hasQuery = q.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5 bg-slate-50 p-3 text-slate-900 sm:p-6">
      <CustomersSearchHero initialQuery={q} />

      {!hasQuery ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-5 py-8 text-sm leading-6 text-slate-600 shadow-sm shadow-slate-950/5">
          <div className="font-semibold text-slate-950">Search to open a customer record.</div>
          <div className="mt-1">One useful fragment is enough: part of a phone number, city, street, email, or customer name.</div>
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-8 shadow-sm shadow-slate-950/5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-950">No customer matches</h2>
            <p className="text-sm leading-6 text-slate-600">
              No matches for "{q}". Try a broader name fragment, fewer phone digits, or part of the address or city.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Search Results</h2>
              <p className="text-sm leading-6 text-slate-600">
                {results.length} match{results.length === 1 ? "" : "es"} for "{q}".
              </p>
            </div>
            <div className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              Showing up to 25
            </div>
          </div>

          <div className="grid gap-3">
            {results.map((r) => {
              const displayName = String(r.full_name ?? "").trim() || "Unnamed Customer";

              return (
                <Link
                  key={r.customer_id}
                  href={`/customers/${r.customer_id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 transition hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:translate-y-[0.5px]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
                      <div className="mt-2 flex min-w-0 items-center gap-1 text-sm text-slate-700">
                        <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                        {r.sample_address ? (
                          <span className="truncate">
                            {r.sample_address}
                            {r.sample_city ? `, ${r.sample_city}` : ""}
                          </span>
                        ) : (
                          <span className="text-slate-500">No address on file yet</span>
                        )}
                      </div>
                    </div>

                    <div className="w-fit whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-sm font-semibold text-blue-800">
                      {r.locations_count} location
                      {r.locations_count === 1 ? "" : "s"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
