import { describe, expect, it } from "vitest";
import { formatCityNamePart, formatPersonDisplayName, formatPersonNamePart } from "@/lib/utils/identity-display";

describe("person display formatting", () => {
  it("capitalizes lowercase first and last name parts for display", () => {
    expect(formatPersonDisplayName({ firstName: "jane", lastName: "doe" })).toBe("Jane Doe");
  });

  it("normalizes all-caps names without changing mixed-case names", () => {
    expect(formatPersonNamePart("JOHN")).toBe("John");
    expect(formatPersonNamePart("McDonald")).toBe("McDonald");
    expect(formatPersonNamePart("SHANIE GEORGE")).toBe("Shanie George");
    expect(formatPersonNamePart("O'CONNOR")).toBe("O'Connor");
    expect(formatPersonNamePart("MCDONALD")).toBe("McDonald");
  });

  it("normalizes all-caps city display without damaging short place acronyms", () => {
    expect(formatCityNamePart("SAN JOSE")).toBe("San Jose");
    expect(formatCityNamePart("STOCKTON")).toBe("Stockton");
    expect(formatCityNamePart("LA")).toBe("LA");
  });

  it("prefers full name and falls back safely", () => {
    expect(formatPersonDisplayName({ fullName: "alex smith", firstName: "ignored", lastName: "name" })).toBe("Alex Smith");
    expect(formatPersonDisplayName({ fallback: "Unnamed Customer" })).toBe("Unnamed Customer");
  });
});
