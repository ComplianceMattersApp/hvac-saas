import { NextRequest, NextResponse } from "next/server";

import { resolveDualContextAccess } from "@/lib/auth/dual-context-access";
import { createClient } from "@/lib/supabase/server";
import { loadTodayFieldConditionsForCoordinates } from "@/lib/home/today-field-conditions";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const access = await resolveDualContextAccess({ supabase });
  if (!access.hasActiveAppAccess) {
    return NextResponse.json({ conditions: null }, { status: 401 });
  }

  const latitude = request.nextUrl.searchParams.get("lat");
  const longitude = request.nextUrl.searchParams.get("lon");

  const conditions = await loadTodayFieldConditionsForCoordinates({
    latitude,
    longitude,
    locationLabel: "Near you",
  });

  return NextResponse.json({ conditions });
}
