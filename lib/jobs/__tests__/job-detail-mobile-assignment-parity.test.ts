import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

const controlsSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/AssignedTeamControls.tsx"),
  "utf8",
);

const addAssigneeSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/DeferredAddAssigneeForm.tsx"),
  "utf8",
);

const contactLoggingSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/ContactLoggingQuickActions.tsx"),
  "utf8",
);

describe("mobile job detail assignment parity", () => {
  it("exposes mobile assignment controls in the visible Team Assignment card", () => {
    const mobilePanelStart = pageSource.indexOf("<AssignedTeamControls", pageSource.indexOf("Contact Logging"));
    const mobilePanelEnd = pageSource.indexOf("showMobileContractorContext", mobilePanelStart);
    const mobilePanel = pageSource.slice(mobilePanelStart, mobilePanelEnd);

    expect(mobilePanelStart).toBeGreaterThan(-1);
    expect(mobilePanel).toContain("<AssignedTeamControls");
    expect(mobilePanel).toContain('variant="mobile"');
    expect(mobilePanel).toContain("isInternalUser={isInternalUser}");
    expect(mobilePanel).toContain("assignedTeam={assignedTeam}");
    expect(mobilePanel).toContain("assignedUserIds={assignedUserIds}");
  });

  it("keeps lower mobile tools as a jump back to the visible assignment card", () => {
    const mobileToolsStart = pageSource.indexOf('id="mobile-tools"');
    const mobileToolsEnd = pageSource.indexOf('id="mobile-tools-timeline"', mobileToolsStart);
    const mobileTools = pageSource.slice(mobileToolsStart, mobileToolsEnd);

    expect(mobileToolsStart).toBeGreaterThan(-1);
    expect(mobileTools).toContain('href="#mobile-assigned-team"');
    expect(mobileTools).toContain("Assign / Manage");
    expect(mobileTools).not.toContain('id="mobile-assigned-team-panel"');
  });

  it("keeps mobile assignment mutations on the existing server actions and return anchor", () => {
    expect(controlsSource).toContain("setPrimaryJobAssigneeFromForm");
    expect(controlsSource).toContain("removeJobAssigneeFromForm");
    expect(controlsSource).toContain('isMobile ? "mobile-assigned-team" : "assigned-team"');
    expect(controlsSource).toContain("isInternalUser ? (");
    expect(controlsSource).toContain("<DeferredAddAssigneeForm");
    expect(addAssigneeSource).toContain("assignJobAssigneeFromForm");
    expect(addAssigneeSource).toContain("returnAnchor");
  });

  it("preserves the desktop assignment surface through the shared controls", () => {
    const desktopPanelStart = pageSource.lastIndexOf("<AssignedTeamControls");
    const desktopPanel = pageSource.slice(desktopPanelStart, desktopPanelStart + 600);

    expect(desktopPanelStart).toBeGreaterThan(-1);
    expect(desktopPanel).toContain("assignedTeam={assignedTeam}");
    expect(desktopPanel).toContain("assignedUserIds={assignedUserIds}");
    expect(desktopPanel).toContain("isInternalUser={isInternalUser}");
    expect(desktopPanel).not.toContain('variant="mobile"');
  });

  it("keeps compact mobile schedule and equal-height contact logging controls", () => {
    expect(pageSource).toContain("const mobileAppointmentTimeLabel = job.scheduled_date ? appointmentTimeLabel : \"\";");
    expect(pageSource).toContain("{mobileAppointmentTimeLabel ? (");
    expect(contactLoggingSource).toContain("min-h-[4rem]");
    expect(contactLoggingSource).toContain("h-full");
    expect(contactLoggingSource).toContain("whitespace-normal");
    expect(contactLoggingSource).toContain('className="flex w-full"');
  });

  it("does not label unstarted mobile work as active", () => {
    expect(pageSource).toContain("const mobileWorkStateLabel = isFieldComplete");
    expect(pageSource).toContain(': "Not started";');
    expect(pageSource).toContain("{mobileWorkStateLabel}");
    expect(pageSource).not.toContain('{isFieldComplete ? "Field complete" : "Field active"}');
  });
});
