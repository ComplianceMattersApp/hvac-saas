import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

const callListPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/call-list/page.tsx"),
  "utf-8",
);

describe("/ops call list — Full Page link", () => {
  it("renders a link to /ops/call-list from the call list card header", () => {
    expect(opsPageSource).toContain('href={`/ops/call-list');
  });

  it("the View Unscheduled Work link label is present", () => {
    expect(opsPageSource).toContain("View Unscheduled Work");
  });

  it("contractor filter is preserved in the Full page link href", () => {
    expect(opsPageSource).toContain("encodeURIComponent(contractorScopeFilter)");
  });

  it("renders Last attempt metadata sourced from customer_attempt events", () => {
    expect(opsPageSource).toContain('.eq("event_type", "customer_attempt")');
    expect(opsPageSource).toContain('label: "Last attempt"');
  });

  it("uses a subtle no-attempt fallback copy on ops cards", () => {
    expect(opsPageSource).toContain("No attempts yet");
  });
});

describe("/ops/call-list page", () => {
  it("redirects unauthenticated users to /login", () => {
    expect(callListPageSource).toContain('redirect("/login")');
  });

  it("redirects contractor users to /portal", () => {
    expect(callListPageSource).toContain('redirect("/portal")');
  });

  it("queries need_to_schedule open jobs only", () => {
    expect(callListPageSource).toContain('eq("ops_status", "need_to_schedule")');
    expect(callListPageSource).toContain('eq("status", "open")');
  });

  it("includes and renders the contractor name in the call-list card context", () => {
    expect(callListPageSource).toContain("contractors(name)");
    expect(callListPageSource).toContain("contractorDisplayName");
    expect(callListPageSource).toContain("Contractor");
  });

  it("queries are account-scoped (no limit hardcoded — all items fetched)", () => {
    // No .limit() call means all need_to_schedule jobs are shown
    expect(callListPageSource).not.toContain(".limit(");
  });

  it("links each job title to /jobs/{id}?tab=ops", () => {
    expect(callListPageSource).toContain("/jobs/${jobId}?tab=ops");
  });

  it("renders an inline scheduler editor using existing schedule action", () => {
    expect(callListPageSource).toContain("Scheduler");
    expect(callListPageSource).toContain("updateJobScheduleFromForm");
    expect(callListPageSource).toContain('name="scheduled_date"');
    expect(callListPageSource).toContain('name="window_start"');
    expect(callListPageSource).toContain('name="window_end"');
    expect(callListPageSource).toContain("Save Schedule");
    expect(callListPageSource).toContain("Clear");
    expect(callListPageSource).toContain('name="unschedule"');
    expect(callListPageSource).toContain('name="return_to" value={returnTo}');
  });

  it("removes redundant Open Job action button from the right action cluster", () => {
    expect(callListPageSource).not.toMatch(/>\s*Open Job\s*</);
  });

  it("renders Call and Open SMS App contact action links via tel/sms hrefs", () => {
    expect(callListPageSource).toContain("telHref(phone)");
    expect(callListPageSource).toContain("smsHref(phone)");
    // Label text exists somewhere in the JSX
    expect(callListPageSource).toMatch(/>\s*Call\s*</);
    expect(callListPageSource).toMatch(/>\s*Open SMS App\s*</);
  });

  it("renders Log Call and Log Text Attempt buttons that use existing contact-attempt action", () => {
    expect(callListPageSource).toContain("logCustomerContactAttemptFromForm");
    expect(callListPageSource).toMatch(/>\s*Log Call\s*</);
    expect(callListPageSource).toMatch(/>\s*Log Text Attempt\s*</);
    expect(callListPageSource).toContain('name="method" value="call"');
    expect(callListPageSource).toContain('name="method" value="text"');
  });

  it("passes return_to and success banners for call/text logging", () => {
    expect(callListPageSource).toContain('name="return_to" value={returnTo}');
    expect(callListPageSource).toContain("contact_attempt_logged_call");
    expect(callListPageSource).toContain("contact_attempt_logged_text");
  });

  it("renders Back to Ops navigation link", () => {
    expect(callListPageSource).toContain('href="/ops"');
  });

  it("empty state renders safely with a return-to-ops link", () => {
    expect(callListPageSource).toContain("No unscheduled work right now.");
    expect(callListPageSource).toContain("Return to Ops");
  });

  it("page heading is Unscheduled Work", () => {
    expect(callListPageSource).toContain(">Unscheduled Work<");
  });

  it("shows universal unscheduled helper copy and badge label", () => {
    expect(callListPageSource).toContain("Unscheduled");
    expect(callListPageSource).toContain(
      "Jobs and work requests that still need a scheduled date, time window, or dispatch follow-up.",
    );
  });
});
