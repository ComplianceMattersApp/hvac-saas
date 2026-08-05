import { NextResponse } from "next/server";
import { processTwilioInboundMessage } from "@/lib/communications/twilio-inbound-processor";
import {
  resolveTwilioWebhookUrl,
  validateTwilioWebhookSignature,
} from "@/lib/communications/twilio-webhook-signature";
import { createAdminClient } from "@/lib/supabase/server";

// Empty TwiML: acknowledge without replying. STOP/HELP auto-replies are the
// provider's (Advanced Opt-Out) responsibility — replying here would double-text.
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twimlResponse(status = 200) {
  return new NextResponse(EMPTY_TWIML, {
    status,
    headers: { "Content-Type": "text/xml" },
  });
}

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
    const result = await processTwilioInboundMessage({ admin, params });

    if (result.outcome === "start_received_no_auto_lift") {
      // Local suppression is not lifted automatically; surfacing this in logs
      // lets an admin lift it deliberately from the suppression record.
      console.info("[TWILIO_INBOUND_START_RECEIVED]", {
        accountOwnerUserId: result.accountOwnerUserId,
      });
    }

    return twimlResponse();
  } catch (error) {
    console.error("[TWILIO_INBOUND_FAILED]", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return NextResponse.json({ error: "Inbound processing failed." }, { status: 500 });
  }
}
