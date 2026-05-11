import React from "react";
import { describe, expect, it } from "vitest";
import SignupPage from "@/app/signup/page";
import ProductSignupPage from "@/app/signup/[product]/page";
import { SignupContent } from "@/app/signup/signup-content";
import { SignupProductChoiceLanding } from "@/app/signup/product-choice-landing";

describe("signup product routes", () => {
  it("renders /signup as product-choice landing", () => {
    const page = SignupPage();

    expect(React.isValidElement(page)).toBe(true);
    expect(page.type).toBe(SignupProductChoiceLanding);
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
});
