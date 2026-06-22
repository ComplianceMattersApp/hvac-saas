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
    expect(pageSource).toContain('<details id="mobile-when-panel" className="group relative overflow-visible rounded-xl');
    expect(pageSource).toContain("hidden w-full max-w-[calc(100vw-1.5rem)] group-open:block");
    expect(contactLoggingSource).toContain("min-h-[4rem]");
    expect(contactLoggingSource).toContain("h-full");
    expect(contactLoggingSource).toContain("whitespace-normal");
    expect(contactLoggingSource).toContain('className="flex w-full"');
  });

  it("omits the redundant mobile work summary card from the header", () => {
    const mobileScheduleStart = pageSource.indexOf('id="mobile-when-panel"');
    const mobileScheduleEnd = pageSource.indexOf('{banner === "note_added"', mobileScheduleStart);
    const mobileScheduleSection = pageSource.slice(mobileScheduleStart, mobileScheduleEnd);

    expect(mobileScheduleStart).toBeGreaterThan(-1);
    expect(mobileScheduleEnd).toBeGreaterThan(mobileScheduleStart);
    expect(pageSource).not.toContain("const mobileWorkStateLabel =");
    expect(pageSource).not.toContain("{mobileWorkStateLabel}");
    expect(mobileScheduleSection).not.toContain("<span>Work</span>");
    expect(mobileScheduleSection).not.toContain('job.job_type === "service" ? "Service" : "ECC"');
  });

  it("removes duplicate mobile workflow and field status row below the schedule/work cards", () => {
    const mobileWorkbenchStart = pageSource.indexOf('id="mobile-when-panel"');
    const mobileWorkbenchEnd = pageSource.indexOf('{banner === "note_added"', mobileWorkbenchStart);
    const mobileWorkbench = pageSource.slice(mobileWorkbenchStart, mobileWorkbenchEnd);

    expect(mobileWorkbenchStart).toBeGreaterThan(-1);
    expect(mobileWorkbenchEnd).toBeGreaterThan(mobileWorkbenchStart);
    expect(mobileWorkbench).not.toContain("formatOpsStatusLabel(job.ops_status, job.job_type)");
    expect(mobileWorkbench).not.toContain("{formatStatus(job.status)}");
  });

  it("uses the current mobile field status as the compact action card header", () => {
    const actionCardStart = pageSource.indexOf('shadow-[0_18px_36px_-30px_rgba(29,78,216,0.32)]');
    const actionCardEnd = pageSource.indexOf("<JobFieldActionButton", actionCardStart);
    const actionCard = pageSource.slice(actionCardStart, actionCardEnd);

    expect(actionCardStart).toBeGreaterThan(-1);
    expect(actionCardEnd).toBeGreaterThan(actionCardStart);
    expect(actionCard).toContain("<span>{mobileCurrentStatusLabel}</span>");
    expect(actionCard).not.toContain("Next Field Action");
    expect(actionCard).not.toContain("Current Status");
    expect(pageSource).toContain("<JobFieldActionButton");
  });
});
