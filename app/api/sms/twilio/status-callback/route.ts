import { NextResponse } from "next/server";
import { processTwilioStatusCallback } from "@/lib/communications/twilio-status-callback-processor";
import {
  resolveTwilioWebhookUrl,
  validateTwilioWebhookSignature,
} from "@/lib/communications/twilio-webhook-signature";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: "Twilio webhook is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const signature = request.headers.get("x-twilio-signature") ?? "";
  const url = resolveTwilioWebhookUrl(request);

  if (!validateTwilioWebhookSignature({ authToken, url, params, signature })) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  try {
    const admin = createAdminClient();
    const result = await processTwilioStatusCallback({ admin, params });
    // Always 200 for verified requests (including unknown MessageSid) so Twilio
    // does not retry callbacks we can never apply.
    return NextResponse.json({ received: true, outcome: result.outcome });
  } catch (error) {
    console.error("[TWILIO_STATUS_CALLBACK_FAILED]", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return NextResponse.json({ error: "Callback processing failed." }, { status: 500 });
  }
}
