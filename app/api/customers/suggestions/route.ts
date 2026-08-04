import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchScopedCustomerSuggestions } from "@/lib/customers/visibility";
import { searchScopedInvoiceSuggestions } from "@/lib/invoices/invoice-suggestions";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return NextResponse.json({ suggestions: [], invoices: [], invoiceMatchKind: null });
  }

  const [scoped, invoices] = await Promise.all([
    searchScopedCustomerSuggestions({
      supabase,
      userId: userData.user.id,
      searchText: q,
      resultLimit: 6,
    }),
    // Invoice lookup is additive to the customer typeahead: a failure there must
    // never take down the search box people use all day to find customers.
    searchScopedInvoiceSuggestions({
      supabase,
      userId: userData.user.id,
      searchText: q,
      resultLimit: 5,
    }).catch(() => ({ results: [], matchedBy: null })),
  ]);

  return NextResponse.json({
    suggestions: scoped.results,
    invoices: invoices.results,
    invoiceMatchKind: invoices.matchedBy,
  });
}
