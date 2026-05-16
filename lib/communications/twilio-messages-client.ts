/**
 * Twilio Messages REST API client — server-only.
 *
 * Never import this module from browser/client code.
 * Credentials are read from server env vars only.
 * Do NOT expose Account SID, Auth Token, or raw provider refs in errors or logs.
 */

export type TwilioSandboxMessageParams = {
  to: string;
  body: string;
  messagingServiceSid: string;
};

export type TwilioSandboxMessageResult = {
  messageSid: string;
  status: string;
};

export class TwilioMessageError extends Error {
  public readonly code: number | string | null;
  public readonly twilioStatus: string | null;

  constructor(params: {
    code: number | string | null;
    twilioStatus: string | null;
    message: string;
  }) {
    super(params.message);
    this.name = "TwilioMessageError";
    this.code = params.code;
    this.twilioStatus = params.twilioStatus;
  }
}

export async function sendTwilioSandboxMessage(
  params: TwilioSandboxMessageParams,
): Promise<TwilioSandboxMessageResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new TwilioMessageError({
      code: null,
      twilioStatus: null,
      message: "Twilio credentials are not configured",
    });
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const requestBody = new URLSearchParams({
    To: params.to,
    Body: params.body,
    MessagingServiceSid: params.messagingServiceSid,
  });

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: requestBody.toString(),
    });
  } catch (fetchError) {
    throw new TwilioMessageError({
      code: null,
      twilioStatus: null,
      message: "Twilio API request failed",
    });
  }

  let json: Record<string, unknown>;
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new TwilioMessageError({
      code: null,
      twilioStatus: null,
      message: "Twilio API response could not be parsed",
    });
  }

  if (!response.ok) {
    const code = json?.code != null ? (json.code as number | string) : null;
    const twilioStatus =
      typeof json?.status === "string" || typeof json?.status === "number"
        ? String(json.status)
        : null;
    // Sanitize: only include provider-supplied message string, never credentials
    const rawMessage = typeof json?.message === "string" ? json.message : null;
    const safeMessage = rawMessage
      ? rawMessage.replace(/AC[a-f0-9]{32}/gi, "[redacted]").slice(0, 200)
      : "Twilio API error";

    throw new TwilioMessageError({
      code,
      twilioStatus,
      message: safeMessage,
    });
  }

  const messageSid = typeof json.sid === "string" ? json.sid : "";
  const status = typeof json.status === "string" ? json.status : "";

  return { messageSid, status };
}
