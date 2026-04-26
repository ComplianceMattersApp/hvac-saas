import Link from "next/link";
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
    <div className="mx-auto max-w-5xl space-y-6 p-4 text-slate-900 sm:space-y-8 sm:p-6">
      <CustomersSearchHero initialQuery={q} />

      {!hasQuery ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-5 py-8 text-sm leading-6 text-slate-600">
          Enter a search term to begin. This tool is best when you know even one useful fragment, like part of a phone number, a city, or a street name.
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-8 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.22)]">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-950">No customer matches</h2>
            <p className="text-sm leading-6 text-slate-600">
              No matches for “{q}”. Try a broader name fragment, fewer phone digits, or part of the address or city.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Search results</h2>
              <p className="text-sm leading-6 text-slate-600">
                {results.length} match{results.length === 1 ? "" : "es"} for “{q}”.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {results.map((r) => {
              const displayName = String(r.full_name ?? "").trim() || "Unnamed Customer";

              return (
                <Link
                  key={r.customer_id}
                  href={`/customers/${r.customer_id}`}
                  className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.16)] transition-[background-color,box-shadow,transform] hover:bg-slate-50/70 hover:shadow-[0_18px_30px_-24px_rgba(15,23,42,0.2)] active:translate-y-[0.5px]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium text-slate-950">{displayName}</div>
                      <div className="text-sm text-slate-500">
                        {r.phone ?? "No phone"} {r.email ? `• ${r.email}` : ""}
                      </div>
                      <div className="mt-1 text-sm text-slate-700">
                        {r.sample_address ? (
                          <>
                            {r.sample_address}
                            {r.sample_city ? `, ${r.sample_city}` : ""}
                          </>
                        ) : (
                          <span className="text-slate-500">No address on file yet</span>
                        )}
                      </div>
                    </div>

                    <div className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-medium text-slate-700">
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
