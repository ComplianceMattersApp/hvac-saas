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

  it("the Full page link label is present", () => {
    expect(opsPageSource).toContain("Full page");
  });

  it("contractor filter is preserved in the Full page link href", () => {
    expect(opsPageSource).toContain("encodeURIComponent(contractor)");
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

  it("renders Call and Text contact action links via tel/sms hrefs", () => {
    expect(callListPageSource).toContain("telHref(phone)");
    expect(callListPageSource).toContain("smsHref(phone)");
    // Label text exists somewhere in the JSX
    expect(callListPageSource).toMatch(/>\s*Call\s*</);
    expect(callListPageSource).toMatch(/>\s*Text\s*</);
  });

  it("renders Log Call and Log Text buttons that use existing contact-attempt action", () => {
    expect(callListPageSource).toContain("logCustomerContactAttemptFromForm");
    expect(callListPageSource).toMatch(/>\s*Log Call\s*</);
    expect(callListPageSource).toMatch(/>\s*Log Text\s*</);
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
    expect(callListPageSource).toContain("No jobs waiting to be scheduled right now.");
    expect(callListPageSource).toContain("Return to Ops");
  });

  it("page heading is Call List", () => {
    expect(callListPageSource).toContain(">Call List<");
  });
});
