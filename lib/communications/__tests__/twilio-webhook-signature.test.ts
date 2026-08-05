import { afterEach, describe, expect, it } from "vitest";
import {
  computeTwilioWebhookSignature,
  resolveTwilioWebhookUrl,
  validateTwilioWebhookSignature,
} from "@/lib/communications/twilio-webhook-signature";

const AUTH_TOKEN = "12345678901234567890123456789012";
const URL_UNDER_TEST = "https://app.example.com/api/sms/twilio/status-callback";

afterEach(() => {
  delete process.env.TWILIO_WEBHOOK_BASE_URL;
});

describe("computeTwilioWebhookSignature", () => {
  it("concatenates url plus alphabetically sorted key/value pairs before signing", () => {
    const unsorted = computeTwilioWebhookSignature({
      authToken: AUTH_TOKEN,
      url: URL_UNDER_TEST,
      params: { MessageStatus: "delivered", MessageSid: "SM123" },
    });
    const sorted = computeTwilioWebhookSignature({
      authToken: AUTH_TOKEN,
      url: URL_UNDER_TEST,
      params: { MessageSid: "SM123", MessageStatus: "delivered" },
    });

    expect(unsorted).toBe(sorted);
    expect(unsorted).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it("produces different signatures for different urls", () => {
    const a = computeTwilioWebhookSignature({
      authToken: AUTH_TOKEN,
      url: URL_UNDER_TEST,
      params: { MessageSid: "SM123" },
    });
    const b = computeTwilioWebhookSignature({
      authToken: AUTH_TOKEN,
      url: "https://other.example.com/api/sms/twilio/status-callback",
      params: { MessageSid: "SM123" },
    });

    expect(a).not.toBe(b);
  });
});

describe("validateTwilioWebhookSignature", () => {
  it("accepts a correctly signed request", () => {
    const params = { MessageSid: "SM123", MessageStatus: "delivered" };
    const signature = computeTwilioWebhookSignature({
      authToken: AUTH_TOKEN,
      url: URL_UNDER_TEST,
      params,
    });

    expect(
      validateTwilioWebhookSignature({
        authToken: AUTH_TOKEN,
        url: URL_UNDER_TEST,
        params,
        signature,
      }),
    ).toBe(true);
  });

  it("rejects a tampered parameter", () => {
    const params = { MessageSid: "SM123", MessageStatus: "delivered" };
    const signature = computeTwilioWebhookSignature({
      authToken: AUTH_TOKEN,
      url: URL_UNDER_TEST,
      params,
    });

    expect(
      validateTwilioWebhookSignature({
        authToken: AUTH_TOKEN,
        url: URL_UNDER_TEST,
        params: { ...params, MessageStatus: "failed" },
        signature,
      }),
    ).toBe(false);
  });

  it("rejects a wrong auth token", () => {
    const params = { MessageSid: "SM123" };
    const signature = computeTwilioWebhookSignature({
      authToken: AUTH_TOKEN,
      url: URL_UNDER_TEST,
      params,
    });

    expect(
      validateTwilioWebhookSignature({
        authToken: "different-token-different-token--",
        url: URL_UNDER_TEST,
        params,
        signature,
      }),
    ).toBe(false);
  });

  it("rejects missing signature or missing token without throwing", () => {
    expect(
      validateTwilioWebhookSignature({
        authToken: AUTH_TOKEN,
        url: URL_UNDER_TEST,
        params: {},
        signature: "",
      }),
    ).toBe(false);

    expect(
      validateTwilioWebhookSignature({
        authToken: "",
        url: URL_UNDER_TEST,
        params: {},
        signature: "abc",
      }),
    ).toBe(false);
  });

  it("rejects signatures of different length without throwing", () => {
    expect(
      validateTwilioWebhookSignature({
        authToken: AUTH_TOKEN,
        url: URL_UNDER_TEST,
        params: {},
        signature: "short",
      }),
    ).toBe(false);
  });
});

describe("resolveTwilioWebhookUrl", () => {
  it("prefers TWILIO_WEBHOOK_BASE_URL and strips trailing slashes", () => {
    process.env.TWILIO_WEBHOOK_BASE_URL = "https://public.example.com/";
    const request = new Request("http://internal-host:3000/api/sms/twilio/inbound?x=1");

    expect(resolveTwilioWebhookUrl(request)).toBe(
      "https://public.example.com/api/sms/twilio/inbound?x=1",
    );
  });

  it("falls back to forwarded host headers when no base url is configured", () => {
    const request = new Request("http://internal-host:3000/api/sms/twilio/inbound", {
      headers: {
        "x-forwarded-host": "app.example.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(resolveTwilioWebhookUrl(request)).toBe(
      "https://app.example.com/api/sms/twilio/inbound",
    );
  });

  it("falls back to the raw request url when nothing else is available", () => {
    const request = new Request("http://localhost:3000/api/sms/twilio/inbound");

    expect(resolveTwilioWebhookUrl(request)).toBe("http://localhost:3000/api/sms/twilio/inbound");
  });
});
