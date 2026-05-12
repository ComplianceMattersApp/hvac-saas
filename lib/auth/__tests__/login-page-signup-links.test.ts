import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const loginPageSource = readFileSync(
  join(process.cwd(), "app", "login", "page.tsx"),
  "utf8"
);

describe("login page signup entry options", () => {
  it("renders HVAC Service and ECC signup links", () => {
    expect(loginPageSource).toContain('href="/signup/service"');
    expect(loginPageSource).toContain('href="/signup/ecc"');
    expect(loginPageSource).toContain("Sign up for HVAC Service");
    expect(loginPageSource).toContain("Sign up for ECC / Compliance Testing");
  });

  it("does not render a hybrid signup link", () => {
    expect(loginPageSource).not.toContain('href="/signup/hybrid"');
    expect(loginPageSource).not.toContain("Sign up for Hybrid");
  });

  it("keeps login form and next-path return resolver wiring", () => {
    expect(loginPageSource).toContain("<form onSubmit={onSubmit}");
    expect(loginPageSource).toContain("const nextPath = searchParams.get(\"next\")");
    expect(loginPageSource).toContain("resolveSafeAuthReturnPath({");
    expect(loginPageSource).toContain("candidateNext: nextPath");
  });
});
