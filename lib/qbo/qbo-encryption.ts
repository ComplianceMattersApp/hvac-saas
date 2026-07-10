import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { requireQboEncryptionKey } from "./qbo-env";

/**
 * App-layer AES-256-GCM encryption for QBO OAuth tokens.
 * Storage format is `iv:tag:ciphertext`, all hex. Tampering fails on auth-tag verification.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits, recommended for GCM

export function encryptToken(plaintext: string): string {
  const key = Buffer.from(requireQboEncryptionKey(), "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(encrypted: string): string {
  const key = Buffer.from(requireQboEncryptionKey(), "hex");
  const [ivHex, tagHex, ciphertextHex] = encrypted.split(":");
  if (!ivHex || !tagHex || !ciphertextHex) {
    throw new Error("Invalid encrypted token format");
  }
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}
