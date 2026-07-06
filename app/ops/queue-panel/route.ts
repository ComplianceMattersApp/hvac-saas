import { NextRequest, NextResponse } from "next/server";
import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import { normalizeOpsBoardSort } from "@/lib/ops/ops-board-sorting";
import { loadOpsQueuePanelData, type OpsQueuePanelJobBucket } from "@/lib/ops/ops-queue-panel-loader";

const INTERNAL_WORK_CONTRACTOR_FOCUS_ID = "__internal_work";

// Accepts the same URL-facing bucket aliases as /ops?bucket=... (see normalizeOpsBoardFilterBucket
// in app/ops/page.tsx) so the address bar stays consistent between the SSR path and client fetches.
const BUCKET_ALIAS_TO_QUEUE_KEY: Record<string, OpsQueuePanelJobBucket> = {
  pending: "need_to_schedule",
  field_work: "field_work",
  waiting: "waiting",
  exceptions: "exceptions",
  follow_ups: "follow_ups",
  closeout: "closeout",
};

function normalizeBucket(value: string | null): OpsQueuePanelJobBucket | null {
  const normalized = String(value ?? "").trim();
  return BUCKET_ALIAS_TO_QUEUE_KEY[normalized] ?? null;
}

export async function GET(request: NextRequest) {
  const actorContext = await getRequestActorContext();

  if (!actorContext.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (actorContext.kind !== "internal" || !actorContext.internalUser) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const bucket = normalizeBucket(sp.get("bucket"));
  if (!bucket) {
    return NextResponse.json({ error: "Unknown or unsupported bucket" }, { status: 400 });
  }

  const contractorFocusIds = String(sp.get("contractor") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const previewLimit = Math.max(Number(sp.get("previewLimit") ?? 10) || 10, 10);
  const boardSort = normalizeOpsBoardSort(sp.get("sort"));

  const result = await loadOpsQueuePanelData({
    supabase: actorContext.supabase,
    accountOwnerUserId: actorContext.internalUser.account_owner_user_id,
    bucket,
    contractorFocusIds,
    internalWorkContractorFocusId: INTERNAL_WORK_CONTRACTOR_FOCUS_ID,
    boardSort,
    previewLimit,
  });

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
