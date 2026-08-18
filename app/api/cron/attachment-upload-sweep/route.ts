import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/server";
import { sweepAbandonedAttachmentUploads } from "@/lib/attachments/abandoned-upload-sweep";

/**
 * Daily reclaim of job attachment uploads that were staged but never finalized.
 *
 * Scheduled from vercel.json at 08:00 UTC — before the working day in Pacific,
 * so the sweep is not competing with technicians uploading in the field.
 */
export async function GET(request: Request) {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const result = await sweepAbandonedAttachmentUploads({ admin });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown error" },
      { status: 500 },
    );
  }
}
