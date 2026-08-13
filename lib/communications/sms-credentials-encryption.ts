/**
 * App-layer AES-256-GCM encryption for Twilio subaccount auth tokens.
 *
 * Same construction and storage format as lib/qbo/qbo-encryption.ts
 * (`iv:tag:ciphertext`, all hex; tampering fails on auth-tag verification),
 * under its own key so an SMS key rotation never touches accounting tokens and
 * vice versa.
 *
 * Server-only. Never import from client code.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits, recommended for GCM
const KEY_ENV = "SMS_CREDENTIALS_ENCRYPTION_KEY";

export function requireSmsCredentialsEncryptionKey(): string {
  const value = process.env[KEY_ENV]?.trim();
  if (!value) throw new Error(`${KEY_ENV} is not set`);
  if (Buffer.from(value, "hex").length !== 32) {
    throw new Error(`${KEY_ENV} must be 32 bytes (64 hex chars)`);
  }
  return value;
}

/** True when the key is present and usable — lets callers degrade instead of throwing. */
export function hasSmsCredentialsEncryptionKey(): boolean {
  try {
    requireSmsCredentialsEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSmsCredential(plaintext: string): string {
  const key = Buffer.from(requireSmsCredentialsEncryptionKey(), "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSmsCredential(encrypted: string): string {
  const key = Buffer.from(requireSmsCredentialsEncryptionKey(), "hex");
  const [ivHex, tagHex, ciphertextHex] = String(encrypted ?? "").split(":");
  if (!ivHex || !tagHex || !ciphertextHex) {
    throw new Error("Invalid encrypted credential format");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return (
    decipher.update(Buffer.from(ciphertextHex, "hex")).toString("utf8") + decipher.final("utf8")
  );
}

export { KEY_ENV as SMS_CREDENTIALS_ENCRYPTION_KEY_ENV };
