import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchScopedCustomerSuggestions } from "@/lib/customers/visibility";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const scoped = await searchScopedCustomerSuggestions({
    supabase,
    userId: userData.user.id,
    searchText: q,
    resultLimit: 6,
  });

  return NextResponse.json({ suggestions: scoped.results });
}