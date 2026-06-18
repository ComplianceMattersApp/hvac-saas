import { NextResponse } from "next/server";
import { requireInternalRole } from "@/lib/auth/internal-user";
import { PRICEBOOK_IMPORT_TEMPLATE_CSV } from "@/lib/business/pricebook-import";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  await requireInternalRole("admin", { supabase });

  return new NextResponse(`${PRICEBOOK_IMPORT_TEMPLATE_CSV}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="services-and-add-ons-template.csv"',
      "cache-control": "no-store",
    },
  });
}
