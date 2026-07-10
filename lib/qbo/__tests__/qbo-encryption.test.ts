import { beforeEach, describe, expect, it } from "vitest";

import { decryptToken, encryptToken } from "@/lib/qbo/qbo-encryption";

const KEY_A = "a".repeat(64); // 32 bytes hex
const KEY_B = "b".repeat(64);

beforeEach(() => {
  process.env.QBO_ENCRYPTION_KEY = KEY_A;
});

describe("qbo-encryption", () => {
  it("round-trips encrypt -> decrypt", () => {
    const plain = "refresh-token-value-123";
    const encrypted = encryptToken(plain);
    expect(encrypted).not.toContain(plain);
    expect(encrypted.split(":")).toHaveLength(3);
    expect(decryptToken(encrypted)).toBe(plain);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encryptToken("secret");
    const [iv, tag, ciphertext] = encrypted.split(":");
    const flipped = ciphertext.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    expect(() => decryptToken(`${iv}:${tag}:${flipped}`)).toThrow();
  });

  it("throws when decrypting with a different key", () => {
    const encrypted = encryptToken("secret");
    process.env.QBO_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptToken(encrypted)).toThrow();
  });

  it("throws on malformed input", () => {
    expect(() => decryptToken("not-valid")).toThrow("Invalid encrypted token format");
  });

  it("rejects a non-32-byte key", () => {
    process.env.QBO_ENCRYPTION_KEY = "abcd";
    expect(() => encryptToken("x")).toThrow("QBO_ENCRYPTION_KEY must be 32 bytes");
  });
});
