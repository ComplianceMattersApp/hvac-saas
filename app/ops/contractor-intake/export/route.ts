import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import {
  CONTRACTOR_INTAKE_QUEUE_EXPORT_LIMIT,
  buildContractorIntakeQueueCsv,
  listPendingContractorIntakeQueueRows,
} from "@/lib/ops/contractor-intake-queue";

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
      const redirectTarget = await resolveInternalAccessErrorRedirectPath({
        supabase,
        user,
        fallbackPath: "/ops",
      });
      return NextResponse.redirect(new URL(redirectTarget, request.url));
    }

    throw error;
  }

  const contractorId = String(request.nextUrl.searchParams.get("contractor") ?? "").trim() || null;
  const admin = createAdminClient();
  const rows = await listPendingContractorIntakeQueueRows({
    supabase: admin,
    accountOwnerUserId: internalUser.account_owner_user_id,
    contractorId,
    limit: CONTRACTOR_INTAKE_QUEUE_EXPORT_LIMIT,
  });

  const today = new Date().toISOString().slice(0, 10);
  const csv = `\uFEFF${buildContractorIntakeQueueCsv(rows)}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contractor-intake-queue-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
