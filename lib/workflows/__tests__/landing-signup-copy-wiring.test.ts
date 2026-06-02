import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(path, "utf-8");
}

describe("landing and signup copy wiring", () => {
  it("renders guided trial login copy with compact preview block", () => {
    const loginPage = readWorkspaceFile("app/login/page.tsx");

    expect(loginPage).toContain("Run service work, ECC testing, scheduling, and follow-up from one organized place.");
    expect(loginPage).toContain("Start a 14-day guided setup. No payment details needed.");
    expect(loginPage).toContain("What the app helps with");
    expect(loginPage).toContain("Today’s work");
    expect(loginPage).toContain("2 jobs need scheduling");
    expect(loginPage).toContain("1 job ready for closeout");
    expect(loginPage).toContain("0 unassigned scheduled jobs");
    expect(loginPage).toContain("Start HVAC Service Trial");
    expect(loginPage).toContain("Start ECC / Compliance Testing Trial");
    expect(loginPage).toContain("For service calls, dispatch, work orders, and follow-up.");
    expect(loginPage).toContain("For ECC jobs, tests, corrections, and compliance closeout.");
    expect(loginPage).toContain("Already invited by your company? Contact your administrator if you need access.");
    expect(loginPage).not.toContain("30-day");
    expect(loginPage).not.toContain("30 day");
  });

  it("renders trial-focused product choice copy with Service and ECC previews", () => {
    const productChoicePage = readWorkspaceFile("app/signup/product-choice-landing.tsx");

    expect(productChoicePage).toContain("Start a 14-day guided trial");
    expect(productChoicePage).toContain("without payment details");
    expect(productChoicePage).toContain("Start HVAC Service Trial");
    expect(productChoicePage).toContain("Start ECC / Compliance Testing Trial");
    expect(productChoicePage).toContain("Service call scheduled");
    expect(productChoicePage).toContain("Field notes captured");
    expect(productChoicePage).toContain("Closeout ready");
    expect(productChoicePage).toContain("Duct test scheduled");
    expect(productChoicePage).toContain("Correction needed");
    expect(productChoicePage).toContain("Closeout pending");
    expect(productChoicePage).not.toContain("30-day");
    expect(productChoicePage).not.toContain("30 day");
    expect(productChoicePage).not.toContain("workspace");
  });

  it("renders distinct Service and ECC signup copy with preview strips", () => {
    const signupContent = readWorkspaceFile("app/signup/signup-content.tsx");

    expect(signupContent).toContain("Start Your HVAC Service Trial");
    expect(signupContent).toContain("Start Your ECC / Compliance Testing Trial");
    expect(signupContent).toContain("No payment details are needed to get started. You can review account and billing options after setup.");
    expect(signupContent).toContain("Setup is owner-led, so you can ask practical questions about how your company actually works.");
    expect(signupContent).toContain("What happens next");
    expect(signupContent).toContain("Enter your email");
    expect(signupContent).toContain("Get your setup link");
    expect(signupContent).toContain("Try real jobs for 14 days");
    expect(signupContent).toContain("Keep service calls organized");
    expect(signupContent).toContain("Track ECC jobs from start to closeout");
    expect(signupContent).toContain("Your first 14 days: enter a few real customers and service jobs");
    expect(signupContent).toContain("Your first 14 days: enter a few real ECC jobs");
    expect(signupContent).toContain("Maple Street Install");
    expect(signupContent).toContain("Tech notes added");
    expect(signupContent).toContain("Permit pending");
    expect(signupContent).toContain("Invoice ready");
    expect(signupContent).toContain("Duct test scheduled");
    expect(signupContent).toContain("Correction needed");
    expect(signupContent).toContain("Test result tracked");
    expect(signupContent).toContain("Closeout pending");
    expect(signupContent).toContain("Start here");
    expect(signupContent).toContain("Create first job");
    expect(signupContent).toContain("Use Today/Ops each morning");
    expect(signupContent).not.toContain("30-day");
    expect(signupContent).not.toContain("30 day");
  });
});
