import React from "react";
import { describe, expect, it, vi } from "vitest";
import SignupPage from "@/app/signup/page";
import ProductSignupPage from "@/app/signup/[product]/page";
import { SignupContent } from "@/app/signup/signup-content";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("signup product routes", () => {
  it("redirects /signup to login signup entry", () => {
    SignupPage();

    expect(redirect).toHaveBeenCalledWith("/login?signup=1");
  });

  it("renders /signup/service with Service intent", async () => {
    const page = await ProductSignupPage({
      params: Promise.resolve({ product: "service" }),
    });

    expect(React.isValidElement(page)).toBe(true);
    expect(page.type).toBe(SignupContent);
    expect(page.props).toMatchObject({ productIntent: "service" });
  });

  it("renders /signup/ecc with ECC intent", async () => {
    const page = await ProductSignupPage({
      params: Promise.resolve({ product: "ecc" }),
    });

    expect(React.isValidElement(page)).toBe(true);
    expect(page.type).toBe(SignupContent);
    expect(page.props).toMatchObject({ productIntent: "ecc" });
  });

  it("renders /signup/cleaning with Cleaning intent", async () => {
    const page = await ProductSignupPage({
      params: Promise.resolve({ product: "cleaning" }),
    });

    expect(React.isValidElement(page)).toBe(true);
    expect(page.type).toBe(SignupContent);
    expect(page.props).toMatchObject({ productIntent: "cleaning" });
  });
});
