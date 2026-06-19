import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(resolve(__dirname, "../../..", path), "utf-8");
}

describe("login spinner safety wiring", () => {
  it("keeps successful password login on the shared post-login router", () => {
    const source = readRepoFile("app/login/page.tsx");

    expect(source).toContain("supabase.auth.signInWithPassword");
    expect(source).toContain("resolveDualContextAccess({ supabase, user })");
    expect(source).toContain("resolvePostLoginDestination({ access, nextPath })");
    expect(source).toContain("window.location.href = destination.path");
  });

  it("surfaces failed password login and resets loading instead of spinning forever", () => {
    const source = readRepoFile("app/login/page.tsx");

    expect(source).toContain("if (error) {");
    expect(source).toContain("setErrorMsg(error.message)");
    expect(source).toContain("finally {");
    expect(source).toContain("setLoading(false)");
    expect(source.indexOf("finally {")).toBeGreaterThan(
      source.indexOf("supabase.auth.signInWithPassword"),
    );
  });

  it("surfaces redirect/access resolution failures and resets loading", () => {
    const source = readRepoFile("app/login/page.tsx");

    expect(source).toContain("const access = await resolveDualContextAccess({ supabase, user })");
    expect(source).toContain(
      'setErrorMsg(error instanceof Error ? error.message : "We could not complete sign-in.")',
    );
    expect(source).toContain("setLoading(false)");
  });

  it("auth callback failures show a safe message and leave the callback for login", () => {
    const source = readRepoFile("app/auth/callback/page.tsx");

    expect(source).toContain('setStatus("We could not complete sign-in. Redirecting to login...")');
    expect(source).toContain('setStatus("Invalid or expired sign-in link. Redirecting to login...")');
    expect(source).toContain('router.push("/login")');
    expect(source).not.toContain('router.push("/auth/callback")');
  });
});
