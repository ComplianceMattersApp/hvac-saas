import { describe, expect, it } from "vitest";

import {
  formatAppointmentContext,
  renderOnTheWayMessageBody,
} from "@/lib/communications/sms-on-the-way-token-renderer";

const DEFAULT_BODY =
  "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. I am on the way to {{appointment_or_job_context}}. Reply STOP to opt out.";

describe("renderOnTheWayMessageBody", () => {
  it("substitutes all four tokens with real values", () => {
    const rendered = renderOnTheWayMessageBody(DEFAULT_BODY, {
      recipientFirstName: "Maria",
      operatorOrTechName: "Jordan",
      companyName: "Cool Air HVAC",
      appointmentOrJobContext: "Tuesday, July 9 between 10 AM – 12 PM",
    });

    expect(rendered).toBe(
      "Hi Maria, this is Jordan with Cool Air HVAC. I am on the way to Tuesday, July 9 between 10 AM – 12 PM. Reply STOP to opt out.",
    );
  });

  it("leaves no unreplaced {{...}} placeholders even when values are fallbacks", () => {
    const rendered = renderOnTheWayMessageBody(DEFAULT_BODY, {
      recipientFirstName: "there",
      operatorOrTechName: "your technician",
      companyName: "our team",
      appointmentOrJobContext: "your service appointment",
    });

    expect(rendered).not.toContain("{{");
    expect(rendered).not.toContain("}}");
    expect(rendered).toContain("Hi there, this is your technician with our team");
  });

  it("tolerates whitespace inside the token braces", () => {
    const rendered = renderOnTheWayMessageBody("Hi {{ recipient_first_name }} from {{company_name}}", {
      recipientFirstName: "Sam",
      operatorOrTechName: "Alex",
      companyName: "Acme",
      appointmentOrJobContext: "your appointment",
    });

    expect(rendered).toBe("Hi Sam from Acme");
  });
});

describe("formatAppointmentContext", () => {
  it("builds date + time window string", () => {
    const result = formatAppointmentContext({
      scheduledDate: "2026-07-09",
      windowStart: "10:00",
      windowEnd: "12:00",
    });

    expect(result).toContain("July 9");
    expect(result).toContain("between 10 AM – 12 PM");
    expect(result).toMatch(/^\w+day, July 9 between 10 AM – 12 PM$/);
  });

  it("formats non-zero minutes with 12-hour clock", () => {
    const result = formatAppointmentContext({
      scheduledDate: "2026-07-09",
      windowStart: "13:30",
      windowEnd: "15:45",
    });

    expect(result).toContain("between 1:30 PM – 3:45 PM");
  });

  it("tolerates legacy HH:MM:SS time strings", () => {
    const result = formatAppointmentContext({
      scheduledDate: "2026-07-09",
      windowStart: "10:00:00",
      windowEnd: "12:00:00",
    });

    expect(result).toContain("between 10 AM – 12 PM");
  });

  it("returns date-only string when window is missing", () => {
    const result = formatAppointmentContext({
      scheduledDate: "2026-07-09",
      windowStart: null,
      windowEnd: null,
    });

    expect(result).toContain("July 9");
    expect(result).not.toContain("between");
  });

  it("falls back to generic phrase when no date is available", () => {
    expect(
      formatAppointmentContext({ scheduledDate: null, windowStart: "10:00", windowEnd: "12:00" }),
    ).toBe("your service appointment");
    expect(
      formatAppointmentContext({ scheduledDate: "", windowStart: null, windowEnd: null }),
    ).toBe("your service appointment");
  });

  it("does not shift the date across a timezone boundary", () => {
    // new Date("2026-07-09") would parse as UTC midnight and render as July 8 in
    // negative-offset zones. The manual split must keep July 9 as July 9.
    const result = formatAppointmentContext({
      scheduledDate: "2026-07-09",
      windowStart: null,
      windowEnd: null,
    });

    expect(result).toContain("July 9");
    expect(result).not.toContain("July 8");
    expect(result).not.toContain("July 10");
  });
});
