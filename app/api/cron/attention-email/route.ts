import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { deliverAttentionSnapshotEmail } from "@/lib/reports/attention-email-delivery";

export async function GET(request: Request) {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("internal_users").select("account_owner_user_id").eq("is_active", true).in("role", ["owner", "admin", "billing"]);
  if (error) return NextResponse.json({ error: "Unable to enumerate accounts" }, { status: 500 });
  const owners = [...new Set((data ?? []).map((row: any) => String(row.account_owner_user_id ?? "").trim()).filter(Boolean))];
  const appUrl = String(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  const results = [];
  for (const accountOwnerUserId of owners) results.push(await deliverAttentionSnapshotEmail({ admin, accountOwnerUserId, appUrl }));
  return NextResponse.json({ checked: owners.length, sent: results.filter(result => result.sent).length });
}
