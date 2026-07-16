import { describe, expect, it } from "vitest";
import { isPublicAssetPath, isUnauthedPublicRoute } from "@/proxy";

describe("isUnauthedPublicRoute", () => {
  it("allows /signup without auth", () => {
    expect(isUnauthedPublicRoute("/signup")).toBe(true);
    expect(isUnauthedPublicRoute("/signup/service")).toBe(true);
    expect(isUnauthedPublicRoute("/signup/ecc")).toBe(true);
  });

  it("continues allowing existing auth routes", () => {
    expect(isUnauthedPublicRoute("/login")).toBe(true);
    expect(isUnauthedPublicRoute("/auth/callback")).toBe(true);
    expect(isUnauthedPublicRoute("/set-password")).toBe(true);
  });

  it("allows public proposal token routes without auth", () => {
    expect(isUnauthedPublicRoute("/proposals/some-token")).toBe(true);
  });

  it("allows public checkout confirmation routes without auth", () => {
    expect(isUnauthedPublicRoute("/payments/checkout-complete")).toBe(true);
    expect(isUnauthedPublicRoute("/payments/checkout-complete?status=success")).toBe(true);
  });

  it("allows signed public invoice payment routes without auth", () => {
    expect(isUnauthedPublicRoute("/payments/invoice/signed-token")).toBe(true);
    expect(isUnauthedPublicRoute("/payments/invoice/signed-token.with-parts")).toBe(true);
    expect(isUnauthedPublicRoute("/payments/invoice")).toBe(false);
  });

  it("allows the privacy and terms pages without auth", () => {
    expect(isUnauthedPublicRoute("/privacy")).toBe(true);
    expect(isUnauthedPublicRoute("/terms")).toBe(true);
  });

  it("does not allow protected ops routes", () => {
    expect(isUnauthedPublicRoute("/ops")).toBe(false);
    expect(isUnauthedPublicRoute("/ops/admin")).toBe(false);
    expect(isUnauthedPublicRoute("/estimates")).toBe(false);
  });

  it("allows the push service worker through as a public asset", () => {
    expect(isPublicAssetPath("/sw.js")).toBe(true);
  });
});
