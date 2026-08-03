// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { MaintenanceAgreementCadenceFields } from "@/components/maintenance-agreements/MaintenanceAgreementCadenceFields";

afterEach(cleanup);

const hidden = (name: string) =>
  document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;

describe("MaintenanceAgreementCadenceFields", () => {
  it("renders every cadence option with human labels", () => {
    render(<MaintenanceAgreementCadenceFields initialFrequency="quarterly" initialStartDate="2026-01-15" />);

    const options = screen.getAllByRole("option") as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual([
      "annual",
      "semi_annual",
      "quarterly",
      "monthly",
      "custom",
    ]);
    expect(options.map((o) => o.textContent)).toEqual([
      "1× per year",
      "2× per year",
      "4× per year",
      "Monthly",
      "Custom",
    ]);
  });

  it("selects the provided initial frequency", () => {
    render(<MaintenanceAgreementCadenceFields initialFrequency="monthly" initialStartDate="2026-01-15" />);
    const select = document.querySelector('select[name="frequency"]') as HTMLSelectElement;
    expect(select.value).toBe("monthly");
  });

  it("falls back to quarterly when the initial frequency is not a known cadence", () => {
    render(<MaintenanceAgreementCadenceFields initialFrequency="every-full-moon" initialStartDate="2026-01-15" />);
    const select = document.querySelector('select[name="frequency"]') as HTMLSelectElement;
    expect(select.value).toBe("quarterly");
  });

  it("derives next-due (interval) and renewal (12mo) dates from the start date", () => {
    render(<MaintenanceAgreementCadenceFields initialFrequency="quarterly" initialStartDate="2026-01-15" />);

    // quarterly => +3 months
    expect(hidden("next_due_date")!.value).toBe("2026-04-15");
    expect(hidden("renewal_date")!.value).toBe("2027-01-15");
    expect(screen.getByText("2026-04-15")).toBeInTheDocument();
    expect(screen.getByText("2027-01-15")).toBeInTheDocument();
  });

  it("recomputes the next-due date when the cadence changes but keeps renewal at 12 months", () => {
    render(<MaintenanceAgreementCadenceFields initialFrequency="quarterly" initialStartDate="2026-01-15" />);
    const select = document.querySelector('select[name="frequency"]') as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "monthly" } });

    // monthly => +1 month; renewal unchanged at +12
    expect(hidden("next_due_date")!.value).toBe("2026-02-15");
    expect(hidden("renewal_date")!.value).toBe("2027-01-15");

    fireEvent.change(select, { target: { value: "annual" } });
    expect(hidden("next_due_date")!.value).toBe("2027-01-15");
  });

  it("recomputes both derived dates when the start date changes", () => {
    render(<MaintenanceAgreementCadenceFields initialFrequency="semi_annual" initialStartDate="2026-01-15" />);
    const startInput = document.querySelector('input[name="start_date"]') as HTMLInputElement;

    // semi_annual => +6 months of the initial date
    expect(hidden("next_due_date")!.value).toBe("2026-07-15");

    fireEvent.change(startInput, { target: { value: "2026-03-15" } });

    // semi_annual (+6) off the new date, renewal (+12) off the new date
    expect(hidden("next_due_date")!.value).toBe("2026-09-15");
    expect(hidden("renewal_date")!.value).toBe("2027-03-15");
  });

  it("shows a placeholder and empty hidden values when there is no start date", () => {
    render(<MaintenanceAgreementCadenceFields initialFrequency="quarterly" initialStartDate="" />);

    expect(hidden("next_due_date")!.value).toBe("");
    expect(hidden("renewal_date")!.value).toBe("");
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2);
  });
});
