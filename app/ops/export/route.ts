import { NextRequest, NextResponse } from "next/server";
import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import {
  buildOpsQueueExport,
  normalizeOpsExportMode,
  normalizeOpsExportQueue,
  opsExportQueueLabel,
} from "@/lib/ops/ops-queue-export";

function filenamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "queue";
}

export async function GET(request: NextRequest) {
  const actorContext = await getRequestActorContext();

  if (!actorContext.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (actorContext.kind === "contractor") {
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  if (actorContext.kind !== "internal" || !actorContext.internalUser) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const sp = request.nextUrl.searchParams;
  const mode = normalizeOpsExportMode(sp.get("mode"));
  const queueKey = normalizeOpsExportQueue(sp.get("queue"), sp.get("bucket"));
  const contractorId = String(sp.get("contractorId") ?? sp.get("contractor") ?? "").trim() || null;

  const result = await buildOpsQueueExport({
    supabase: actorContext.supabase,
    accountOwnerUserId: actorContext.internalUser.account_owner_user_id,
    mode,
    queueKey,
    contractorId,
    reason: sp.get("reason"),
    sort: sp.get("sort"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  const today = new Date().toISOString().slice(0, 10);
  const modePart = mode === "contractor_safe" ? "contractor-safe" : "internal";
  const queuePart = filenamePart(opsExportQueueLabel(queueKey));

  return new NextResponse(`\uFEFF${result.csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ops-${queuePart}-${modePart}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
