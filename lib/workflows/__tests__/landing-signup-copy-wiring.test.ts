import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

describe("landing and signup copy wiring", () => {
  it("renders guided trial login and signup CTA copy", () => {
    const loginPage = readWorkspaceFile("app/login/page.tsx");

    expect(loginPage).toContain("Run service work, ECC testing, scheduling, and follow-up from one organized place.");
    expect(loginPage).toContain("Start a 14-day guided setup. No payment details needed.");
    expect(loginPage).toContain("Start HVAC Service Trial");
    expect(loginPage).toContain("Start ECC / Compliance Testing Trial");
    expect(loginPage).toContain("For service calls, dispatch, work orders, and follow-up.");
    expect(loginPage).toContain("For ECC jobs, tests, corrections, and compliance closeout.");
    expect(loginPage).toContain("Already invited by your company? Contact your administrator if you need access.");
  });

  it("renders trial-focused product choice copy", () => {
    const productChoicePage = readWorkspaceFile("app/signup/product-choice-landing.tsx");

    expect(productChoicePage).toContain("Start a 14-day guided trial");
    expect(productChoicePage).toContain("without payment details");
    expect(productChoicePage).toContain("Start HVAC Service Trial");
    expect(productChoicePage).toContain("Start ECC / Compliance Testing Trial");
  });

  it("renders distinct Service and ECC signup copy with next-step guidance", () => {
    const signupContent = readWorkspaceFile("app/signup/signup-content.tsx");

    expect(signupContent).toContain("Start Your HVAC Service Trial");
    expect(signupContent).toContain("Start Your ECC / Compliance Testing Trial");
    expect(signupContent).toContain("No payment details are needed to get started. You can review account and billing options after setup.");
    expect(signupContent).toContain("Setup is owner-led, so you can ask practical questions about how your company actually works.");
    expect(signupContent).toContain("What happens next");
    expect(signupContent).toContain("Enter your email");
    expect(signupContent).toContain("Get your setup link");
    expect(signupContent).toContain("Try real jobs for 14 days");
    expect(signupContent).toContain("Your first 14 days: enter a few real customers and service jobs");
    expect(signupContent).toContain("Your first 14 days: enter a few real ECC jobs");
  });
});
