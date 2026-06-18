import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const loginPageSource = readFileSync(
  join(process.cwd(), "app", "login", "page.tsx"),
  "utf8"
);

describe("login page signup entry options", () => {
  it("renders Service, ECC, and Cleaning signup links", () => {
    expect(loginPageSource).toContain('href="/signup/service"');
    expect(loginPageSource).toContain('href="/signup/ecc"');
    expect(loginPageSource).toContain('href="/signup/cleaning"');
    expect(loginPageSource).toContain("Start Service Trial");
    expect(loginPageSource).toContain("Start ECC / Compliance Trial");
    expect(loginPageSource).toContain("Start Cleaning Trial");
    expect(loginPageSource).toContain("Cleaning / Janitorial");
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

  it("waits for session commit before protected redirect and always clears pending state", () => {
    expect(loginPageSource).toContain("async function waitForSessionCommit");
    expect(loginPageSource).toContain("await waitForSessionCommit(supabase);");
    expect(loginPageSource).toContain("finally {");
    expect(loginPageSource).toContain("setLoading(false);");
  });

  it("persists session explicitly and uses hard navigation to ensure server-visible cookies", () => {
    expect(loginPageSource).toContain("supabase.auth.setSession(");
    expect(loginPageSource).toContain("window.location.href = resumePath");
    expect(loginPageSource).not.toContain("router.push(");
  });
});
