import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import {
  buildTodayGreetingLine,
  derivePreferredGreetingName,
} from "@/lib/home/today-read-model";

const todayPageSource = readFileSync(
  resolve(__dirname, "../../../app/today/page.tsx"),
  "utf-8",
);

const todayReadModelSource = readFileSync(
  resolve(__dirname, "../today-read-model.ts"),
  "utf-8",
);

describe("today greeting polish", () => {
  it("derives first name from explicit first_name when available", () => {
    expect(
      derivePreferredGreetingName({
        user_metadata: { first_name: "Eddie", full_name: "Ignore Me" },
      }),
    ).toBe("Eddie");
    expect(buildTodayGreetingLine({ user_metadata: { first_name: "Eddie" } })).toBe(
      "Welcome back, Eddie.",
    );
  });

  it("falls back to first token from display/full/name metadata", () => {
    expect(buildTodayGreetingLine({ user_metadata: { display_name: "Taylor Morgan" } })).toBe(
      "Welcome back, Taylor.",
    );
    expect(buildTodayGreetingLine({ user_metadata: { full_name: "Morgan Reed" } })).toBe(
      "Welcome back, Morgan.",
    );
    expect(buildTodayGreetingLine({ user_metadata: { name: "Alex Rivera" } })).toBe(
      "Welcome back, Alex.",
    );
  });

  it("uses safe fallback greeting when no usable name is available", () => {
    expect(buildTodayGreetingLine({ user_metadata: {} })).toBe("Welcome back.");
    expect(buildTodayGreetingLine(null)).toBe("Welcome back.");
  });

  it("keeps Today title and date/role line intact while adding greeting line", () => {
    expect(todayPageSource).toContain("Today");
    expect(todayPageSource).toContain("header.greetingLine");
    expect(todayPageSource).toContain("{header.displayDate} · {header.roleLabel}");
  });

  it("keeps business attention and link surfaces unchanged", () => {
    expect(todayPageSource).toContain("/reports/failed-payments");
    expect(todayPageSource).toContain("/reports/payments");
    expect(todayPageSource).toContain("href=\"/service-plans\"");
    expect(todayReadModelSource).toContain("failedPaymentAttentionPromise");
    expect(todayReadModelSource).toContain("summarizeMaintenanceAgreementsForAccount");
  });

  it("does not alter auth mutation or role behavior", () => {
    expect(todayReadModelSource).toContain("getRequestActorContext");
    expect(todayReadModelSource).toContain("roleLabelFor(role, productMode)");
    expect(todayReadModelSource).not.toContain("supabase.auth.updateUser");
  });
});