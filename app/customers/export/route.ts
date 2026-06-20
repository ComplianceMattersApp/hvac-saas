import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
import {
  type CustomerDirectorySort,
  buildCustomerDirectoryCsv,
  listScopedCustomerDirectory,
} from "@/lib/customers/visibility";

const DEFAULT_DIRECTORY_EXPORT_LIMIT = 100;
const SEARCH_DIRECTORY_EXPORT_LIMIT = 25;

function normalizeSort(value: unknown): CustomerDirectorySort {
  return String(value ?? "").trim().toLowerCase() === "za" ? "za" : "az";
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let internalUser: Awaited<ReturnType<typeof requireInternalRole>>["internalUser"];
  try {
    ({ internalUser } = await requireInternalRole(["admin", "office"], {
      supabase,
      userId: user.id,
    }));
  } catch (error) {
    if (isInternalAccessError(error)) {
      return NextResponse.redirect(new URL("/customers", request.url));
    }
    throw error;
  }

  const q = String(request.nextUrl.searchParams.get("q") ?? "").trim();
  const sort = normalizeSort(request.nextUrl.searchParams.get("sort"));
  const resultLimit = q ? SEARCH_DIRECTORY_EXPORT_LIMIT : DEFAULT_DIRECTORY_EXPORT_LIMIT;
  const admin = createAdminClient();
  const scoped = await listScopedCustomerDirectory({
    supabase: admin,
    userId: user.id,
    searchText: q,
    sortDirection: sort,
    resultLimit,
    accountOwnerUserId: internalUser.account_owner_user_id,
  });

  const today = new Date().toISOString().slice(0, 10);
  const csv = `\uFEFF${buildCustomerDirectoryCsv(scoped.results)}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customer-directory-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
