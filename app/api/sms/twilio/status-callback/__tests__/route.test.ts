import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeTwilioWebhookSignature } from "@/lib/communications/twilio-webhook-signature";

const processTwilioStatusCallbackMock = vi.fn();
const createAdminClientMock = vi.fn(() => ({ from: vi.fn() }));

vi.mock("@/lib/communications/twilio-status-callback-processor", () => ({
  processTwilioStatusCallback: (...args: unknown[]) => processTwilioStatusCallbackMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

const AUTH_TOKEN = "test-auth-token";
const WEBHOOK_URL = "https://app.example.com/api/sms/twilio/status-callback";

function buildRequest(params: Record<string, string>, options: { signature?: string } = {}) {
  const body = new URLSearchParams(params).toString();
  const signature =
    options.signature ??
    computeTwilioWebhookSignature({ authToken: AUTH_TOKEN, url: WEBHOOK_URL, params });

  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": signature,
    },
    body,
  });
}

async function postStatusCallback(request: Request) {
  const { POST } = await import("@/app/api/sms/twilio/status-callback/route");
  return POST(request);
}

describe("POST /api/sms/twilio/status-callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TWILIO_AUTH_TOKEN", AUTH_TOKEN);
    vi.stubEnv("TWILIO_WEBHOOK_BASE_URL", "");
    processTwilioStatusCallbackMock.mockResolvedValue({ outcome: "applied" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 when TWILIO_AUTH_TOKEN is not configured", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");

    const response = await postStatusCallback(
      buildRequest({ MessageSid: "SM123", MessageStatus: "delivered" }),
    );

    expect(response.status).toBe(503);
    expect(processTwilioStatusCallbackMock).not.toHaveBeenCalled();
  });

  it("rejects a request with an invalid signature and never touches the processor", async () => {
    const response = await postStatusCallback(
      buildRequest(
        { MessageSid: "SM123", MessageStatus: "delivered" },
        { signature: "bogus-signature" },
      ),
    );

    expect(response.status).toBe(403);
    expect(processTwilioStatusCallbackMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("acknowledges a validly signed callback with the processor outcome", async () => {
    const params = { MessageSid: "SM123", MessageStatus: "delivered", To: "+15551230000" };

    const response = await postStatusCallback(buildRequest(params));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, outcome: "applied" });
    expect(processTwilioStatusCallbackMock).toHaveBeenCalledTimes(1);
    expect(processTwilioStatusCallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ params }),
    );
  });

  it("still returns 200 for unknown MessageSid outcomes so Twilio does not retry", async () => {
    processTwilioStatusCallbackMock.mockResolvedValue({ outcome: "unknown_message_sid" });

    const response = await postStatusCallback(
      buildRequest({ MessageSid: "SM-unknown", MessageStatus: "failed" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      outcome: "unknown_message_sid",
    });
  });

  it("returns 500 when the processor throws so Twilio retries", async () => {
    processTwilioStatusCallbackMock.mockRejectedValue(new Error("db down"));

    const response = await postStatusCallback(
      buildRequest({ MessageSid: "SM123", MessageStatus: "delivered" }),
    );

    expect(response.status).toBe(500);
  });
});
