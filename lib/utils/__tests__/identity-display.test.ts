import { describe, expect, it } from "vitest";
import { formatPersonDisplayName, formatPersonNamePart } from "@/lib/utils/identity-display";

describe("person display formatting", () => {
  it("capitalizes lowercase first and last name parts for display", () => {
    expect(formatPersonDisplayName({ firstName: "jane", lastName: "doe" })).toBe("Jane Doe");
  });

  it("normalizes all-caps names without changing mixed-case names", () => {
    expect(formatPersonNamePart("JOHN")).toBe("John");
    expect(formatPersonNamePart("McDonald")).toBe("McDonald");
  });

  it("prefers full name and falls back safely", () => {
    expect(formatPersonDisplayName({ fullName: "alex smith", firstName: "ignored", lastName: "name" })).toBe("Alex Smith");
    expect(formatPersonDisplayName({ fallback: "Unnamed Customer" })).toBe("Unnamed Customer");
  });
});
