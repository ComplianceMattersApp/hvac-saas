import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type SearchResult = {
  customer_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  locations_count: number;
  sample_location_id: string | null;
  sample_address: string | null;
  sample_city: string | null;
};

export default async function CustomersPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  // ✅ Next.js requires unwrapping searchParams
  const sp = await props.searchParams;
  const q = (sp?.q ?? "").trim();

  let results: SearchResult[] = [];

  if (q.length > 0) {
    const { data, error } = await supabase.rpc("search_customers", {
      search_text: q,
      result_limit: 25,
    });

    if (error) throw error;

    results = (data ?? []) as SearchResult[];
  }

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-sm text-muted-foreground">
          Search by name, phone, address, or city.
        </p>
      </div>

      <form className="flex gap-2" action="/customers" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Start typing… (ex: Stockton, Eddie, 209…) "
          className="w-full rounded-md border px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-md bg-black text-white px-4 py-2"
        >
          Search
        </button>
      </form>

      {q.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Enter a search term to begin.
        </div>
      ) : results.length === 0 ? (
        <div className="text-sm">No matches for “{q}”.</div>
      ) : (
        <div className="grid gap-3">
          {results.map((r) => (
            <Link
              key={r.customer_id}
              href={`/customers/${r.customer_id}`}
              className="block rounded-lg border p-4 hover:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">
                    {r.full_name ?? "Unnamed Customer"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {r.phone ?? "No phone"} {r.email ? `• ${r.email}` : ""}
                  </div>
                  <div className="text-sm mt-1">
                    {r.sample_address ? (
                      <>
                        {r.sample_address}
                        {r.sample_city ? `, ${r.sample_city}` : ""}
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        No address on file yet
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-sm text-muted-foreground whitespace-nowrap">
                  {r.locations_count} location
                  {r.locations_count === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
