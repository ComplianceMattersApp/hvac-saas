/**
 * Twilio webhook request signature validation — server-only.
 *
 * Twilio signs every webhook request with HMAC-SHA1 over the exact public URL
 * it requested plus the alphabetically sorted POST parameters, keyed by the
 * account Auth Token, base64 encoded, and sends it as `X-Twilio-Signature`.
 * Reference: https://www.twilio.com/docs/usage/security#validating-requests
 *
 * Never import this module from browser/client code.
 */

import { createHmac, timingSafeEqual } from "crypto";

export type TwilioWebhookSignatureParams = {
  authToken: string;
  /** The exact public URL Twilio requested, including any query string. */
  url: string;
  /** Decoded POST body parameters (application/x-www-form-urlencoded). */
  params: Record<string, string>;
  /** Value of the X-Twilio-Signature request header. */
  signature: string;
};

export function computeTwilioWebhookSignature(params: {
  authToken: string;
  url: string;
  params: Record<string, string>;
}): string {
  const sortedKeys = Object.keys(params.params).sort();
  let payload = params.url;
  for (const key of sortedKeys) {
    payload += key + params.params[key];
  }

  return createHmac("sha1", params.authToken).update(payload, "utf8").digest("base64");
}

export function validateTwilioWebhookSignature(params: TwilioWebhookSignatureParams): boolean {
  const authToken = String(params.authToken ?? "");
  const signature = String(params.signature ?? "").trim();

  if (!authToken || !signature) {
    return false;
  }

  const expected = computeTwilioWebhookSignature({
    authToken,
    url: params.url,
    params: params.params,
  });

  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Resolve the canonical public URL for a Twilio webhook route.
 *
 * Signature validation must use the URL exactly as Twilio requested it. Behind
 * Vercel/proxies the incoming `request.url` host can differ from the public
 * host, so a canonical base URL is preferred via TWILIO_WEBHOOK_BASE_URL
 * (e.g. https://app.example.com — no trailing slash). Falls back to the
 * forwarded proto/host headers, then to the raw request URL.
 */
export function resolveTwilioWebhookUrl(request: Request): string {
  const requestUrl = new URL(request.url);
  const pathWithQuery = requestUrl.pathname + requestUrl.search;

  const configuredBase = String(process.env.TWILIO_WEBHOOK_BASE_URL ?? "").trim();
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, "") + pathWithQuery;
  }

  const forwardedHost = String(request.headers.get("x-forwarded-host") ?? "").trim();
  if (forwardedHost) {
    const forwardedProto =
      String(request.headers.get("x-forwarded-proto") ?? "").trim() || "https";
    return `${forwardedProto}://${forwardedHost}${pathWithQuery}`;
  }

  return request.url;
}
