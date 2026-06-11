import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

describe("landing and signup copy wiring", () => {
  const PRIVATE_LOOKING_COPY_GUARDS = [
    "Test Customer 123",
    "permit #",
    "invoice #",
    "sandbox",
    "example.com",
    "123 Main St",
    "(555)",
  ];

  it("renders guided trial login copy with compact preview block", () => {
    const loginPage = readWorkspaceFile("app/login/page.tsx");

    expect(loginPage).toContain("Run service work, ECC testing, scheduling, and follow-up from one organized place.");
    expect(loginPage).toContain("Start a 14-day guided setup. No payment details needed.");
    expect(loginPage).toContain("Start Service Trial");
    expect(loginPage).toContain("Start ECC / Compliance Trial");
    expect(loginPage).toContain("For service calls, dispatch, work orders, and follow-up.");
    expect(loginPage).toContain("For ECC jobs, tests, corrections, and closeout.");
    expect(loginPage).toContain("Both paths start with a 14-day guided setup and no payment details.");
    expect(loginPage).toContain("Already invited by your company? Contact your administrator if you need access.");
    expect(loginPage).not.toContain("30-day");
    expect(loginPage).not.toContain("30 day");
    for (const disallowed of PRIVATE_LOOKING_COPY_GUARDS) {
      expect(loginPage).not.toContain(disallowed);
    }
  });

  it("renders trial-focused product choice copy with compact Service and ECC preview tiles", () => {
    const productChoicePage = readWorkspaceFile("app/signup/product-choice-landing.tsx");

    expect(productChoicePage).toContain("Start a 14-day guided trial");
    expect(productChoicePage).toContain("no payment details needed");
    expect(productChoicePage).toContain("Start Service Trial");
    expect(productChoicePage).toContain("Start ECC / Compliance Testing Trial");
    expect(productChoicePage).toContain("Service preview");
    expect(productChoicePage).toContain("ECC preview");
    expect(productChoicePage).toContain("Service call scheduled");
    expect(productChoicePage).toContain("Field notes captured");
    expect(productChoicePage).toContain("Closeout ready");
    expect(productChoicePage).toContain("Duct test scheduled");
    expect(productChoicePage).toContain("Correction needed");
    expect(productChoicePage).toContain("Closeout pending");
    expect(productChoicePage).not.toContain("30-day");
    expect(productChoicePage).not.toContain("30 day");
    expect(productChoicePage).not.toContain("workspace");
    for (const disallowed of PRIVATE_LOOKING_COPY_GUARDS) {
      expect(productChoicePage).not.toContain(disallowed);
    }
  });

  it("renders generic signup preview copy for /signup", () => {
    const signupContent = readWorkspaceFile("app/signup/signup-content.tsx");

    expect(signupContent).toContain("Success Guide preview");
    expect(signupContent).toContain("Start here");
    expect(signupContent).toContain("Create first job");
    expect(signupContent).toContain("Use Today/Ops each morning");
    expect(signupContent).toContain("Try real jobs for 14 days");
    expect(signupContent).toContain("No payment details are needed to get started. You can review billing options after setup.");
    expect(signupContent).not.toContain("30-day");
    expect(signupContent).not.toContain("30 day");
  });

  it("renders Service signup preview strip copy for /signup/service", () => {
    const signupContent = readWorkspaceFile("app/signup/signup-content.tsx");

    expect(signupContent).toContain("Start Your Service Trial");
    expect(signupContent).toContain("Service preview");
    expect(signupContent).toContain("Success Guide");
    expect(signupContent).toContain("Maple Street Install");
    expect(signupContent).toContain("Tech notes added");
    expect(signupContent).toContain("Permit pending");
    expect(signupContent).toContain("Invoice ready");
  });

  it("renders ECC signup preview strip copy for /signup/ecc", () => {
    const signupContent = readWorkspaceFile("app/signup/signup-content.tsx");

    expect(signupContent).toContain("Start Your ECC / Compliance Testing Trial");
    expect(signupContent).toContain("ECC preview");
    expect(signupContent).toContain("Success Guide");
    expect(signupContent).toContain("Duct test scheduled");
    expect(signupContent).toContain("Correction needed");
    expect(signupContent).toContain("Test result tracked");
    expect(signupContent).toContain("Closeout pending");
  });

  it("keeps trial and no-payment reassurance while avoiding stale or private-looking copy", () => {
    const signupContent = readWorkspaceFile("app/signup/signup-content.tsx");

    expect(signupContent).toContain("Start Your Service Trial");
    expect(signupContent).toContain("Start Your ECC / Compliance Testing Trial");
    expect(signupContent).toContain("No payment details are needed to get started. You can review billing options after setup.");
    expect(signupContent).toContain("Try real jobs for 14 days");
    expect(signupContent).toContain("What happens next");
    expect(signupContent).not.toContain("30-day");
    expect(signupContent).not.toContain("30 day");
    for (const disallowed of PRIVATE_LOOKING_COPY_GUARDS) {
      expect(signupContent).not.toContain(disallowed);
    }
  });
});
