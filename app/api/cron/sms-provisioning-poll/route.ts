import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { pollProvisioningRegistrations } from "@/lib/communications/sms-provisioning-poller";

/**
 * Drives in-flight A2P registrations forward every 10 minutes.
 *
 * Brand review is typically minutes; campaign review can run to about two
 * weeks, so this is a patient poll rather than a tight loop. The poller never
 * throws and isolates per registration, so one tenant's misconfigured Twilio
 * account cannot stall everyone else's.
 */
export async function GET(request: Request) {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await pollProvisioningRegistrations({ admin: createAdminClient(), limit: 25 });
  const outcomes = results.reduce<Record<string, number>>(
    (all, result) => ({ ...all, [result.outcome]: (all[result.outcome] ?? 0) + 1 }),
    {},
  );
  return NextResponse.json({ checked: results.length, outcomes });
}
