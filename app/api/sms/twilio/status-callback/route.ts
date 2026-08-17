import { NextResponse } from "next/server";
import { processTwilioStatusCallback } from "@/lib/communications/twilio-status-callback-processor";
import {
  resolveTwilioWebhookUrl,
  validateTwilioWebhookSignature,
} from "@/lib/communications/twilio-webhook-signature";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveTwilioAccountForMessageSid } from "@/lib/communications/sms-account-resolution";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const signature = request.headers.get("x-twilio-signature") ?? "";
  const url = resolveTwilioWebhookUrl(request);

  const admin = createAdminClient();
  // Find the delivery row this callback refers to, and use ITS account's token:
  // a subaccount signs its own message callbacks. Unknown MessageSid falls back
  // to the platform token, which is correct for the pre-subaccount setup.
  //
  // As on the inbound route, MessageSid only SELECTS the key — the signature
  // check below is still what establishes trust.
  const account = await resolveTwilioAccountForMessageSid({
    admin,
    messageSid: String(params.MessageSid ?? params.SmsSid ?? ""),
  });
  if (!account) {
    return NextResponse.json({ error: "Twilio webhook is not configured." }, { status: 503 });
  }

  if (!validateTwilioWebhookSignature({ authToken: account.authToken, url, params, signature })) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  try {
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
