import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeTwilioWebhookSignature } from "@/lib/communications/twilio-webhook-signature";

const processTwilioInboundMessageMock = vi.fn();
const createAdminClientMock = vi.fn(() => ({ from: vi.fn() }));

vi.mock("@/lib/communications/twilio-inbound-processor", () => ({
  processTwilioInboundMessage: (...args: unknown[]) => processTwilioInboundMessageMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

const AUTH_TOKEN = "test-auth-token";
const WEBHOOK_URL = "https://app.example.com/api/sms/twilio/inbound";

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

async function postInbound(request: Request) {
  const { POST } = await import("@/app/api/sms/twilio/inbound/route");
  return POST(request);
}

describe("POST /api/sms/twilio/inbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TWILIO_AUTH_TOKEN", AUTH_TOKEN);
    vi.stubEnv("TWILIO_WEBHOOK_BASE_URL", "");
    processTwilioInboundMessageMock.mockResolvedValue({ outcome: "processed" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 when TWILIO_AUTH_TOKEN is not configured", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");

    const response = await postInbound(buildRequest({ From: "+15551230000", Body: "STOP" }));

    expect(response.status).toBe(503);
    expect(processTwilioInboundMessageMock).not.toHaveBeenCalled();
  });

  it("rejects a request with an invalid signature and never touches the processor", async () => {
    const response = await postInbound(
      buildRequest({ From: "+15551230000", Body: "STOP" }, { signature: "bogus-signature" }),
    );

    expect(response.status).toBe(403);
    expect(processTwilioInboundMessageMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects a correctly signed body whose params were tampered in transit", async () => {
    const signedParams = { From: "+15551230000", Body: "STOP" };
    const tamperedBody = new URLSearchParams({ From: "+15559999999", Body: "STOP" }).toString();

    const request = new Request(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": computeTwilioWebhookSignature({
          authToken: AUTH_TOKEN,
          url: WEBHOOK_URL,
          params: signedParams,
        }),
      },
      body: tamperedBody,
    });

    const response = await postInbound(request);

    expect(response.status).toBe(403);
    expect(processTwilioInboundMessageMock).not.toHaveBeenCalled();
  });

  it("processes a validly signed request and acknowledges with empty TwiML", async () => {
    const params = { From: "+15551230000", To: "+15550001111", Body: "STOP", MessageSid: "SM123" };

    const response = await postInbound(buildRequest(params));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/xml");
    const text = await response.text();
    expect(text).toContain("<Response></Response>");

    expect(processTwilioInboundMessageMock).toHaveBeenCalledTimes(1);
    expect(processTwilioInboundMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ params }),
    );
  });

  it("returns 500 when the processor throws so Twilio retries", async () => {
    processTwilioInboundMessageMock.mockRejectedValue(new Error("db down"));

    const response = await postInbound(buildRequest({ From: "+15551230000", Body: "HELP" }));

    expect(response.status).toBe(500);
  });

  it("validates against TWILIO_WEBHOOK_BASE_URL when the request arrives on an internal host", async () => {
    vi.stubEnv("TWILIO_WEBHOOK_BASE_URL", "https://app.example.com");

    const params = { From: "+15551230000", Body: "YES" };
    const body = new URLSearchParams(params).toString();
    // Twilio signed the public URL; the app receives the request on an internal host.
    const request = new Request("http://internal-host:3000/api/sms/twilio/inbound", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": computeTwilioWebhookSignature({
          authToken: AUTH_TOKEN,
          url: WEBHOOK_URL,
          params,
        }),
      },
      body,
    });

    const response = await postInbound(request);

    expect(response.status).toBe(200);
    expect(processTwilioInboundMessageMock).toHaveBeenCalledTimes(1);
  });
});
