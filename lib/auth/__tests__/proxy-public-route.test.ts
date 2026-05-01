import { describe, expect, it } from "vitest";
import { isUnauthedPublicRoute } from "@/proxy";

describe("isUnauthedPublicRoute", () => {
  it("allows /signup without auth", () => {
    expect(isUnauthedPublicRoute("/signup")).toBe(true);
  });

  it("continues allowing existing auth routes", () => {
    expect(isUnauthedPublicRoute("/login")).toBe(true);
    expect(isUnauthedPublicRoute("/auth/callback")).toBe(true);
    expect(isUnauthedPublicRoute("/set-password")).toBe(true);
  });

  it("does not allow protected ops routes", () => {
    expect(isUnauthedPublicRoute("/ops")).toBe(false);
    expect(isUnauthedPublicRoute("/ops/admin")).toBe(false);
  });
});
