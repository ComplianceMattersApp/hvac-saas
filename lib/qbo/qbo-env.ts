/**
 * QBO environment configuration.
 * All `require*` functions throw if required vars are missing — fail loud, fail early.
 * Mirrors the house pattern of per-service `require*()` guards (see lib/business/platform-billing-stripe.ts).
 */

export function requireQboClientId(): string {
  const v = process.env.QBO_CLIENT_ID?.trim();
  if (!v) throw new Error("QBO_CLIENT_ID is not set");
  return v;
}

export function requireQboClientSecret(): string {
  const v = process.env.QBO_CLIENT_SECRET?.trim();
  if (!v) throw new Error("QBO_CLIENT_SECRET is not set");
  return v;
}

export function requireQboRedirectUri(): string {
  const v = process.env.QBO_REDIRECT_URI?.trim();
  if (!v) throw new Error("QBO_REDIRECT_URI is not set");
  return v;
}

export function requireQboEncryptionKey(): string {
  const v = process.env.QBO_ENCRYPTION_KEY?.trim();
  if (!v) throw new Error("QBO_ENCRYPTION_KEY is not set");
  if (Buffer.from(v, "hex").length !== 32) {
    throw new Error("QBO_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
  }
  return v;
}

export function getQboEnvironment(): "sandbox" | "production" {
  return process.env.QBO_ENVIRONMENT?.trim() === "production" ? "production" : "sandbox";
}

export function getQboBaseUrl(): string {
  return getQboEnvironment() === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export function getQboAvailability(): { available: boolean; missingKeys: string[] } {
  const missing: string[] = [];
  if (!process.env.QBO_CLIENT_ID?.trim()) missing.push("QBO_CLIENT_ID");
  if (!process.env.QBO_CLIENT_SECRET?.trim()) missing.push("QBO_CLIENT_SECRET");
  if (!process.env.QBO_REDIRECT_URI?.trim()) missing.push("QBO_REDIRECT_URI");
  if (!process.env.QBO_ENCRYPTION_KEY?.trim()) missing.push("QBO_ENCRYPTION_KEY");
  return { available: missing.length === 0, missingKeys: missing };
}
