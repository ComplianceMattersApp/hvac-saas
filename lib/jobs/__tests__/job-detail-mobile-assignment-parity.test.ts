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

const teamSelectorSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/TeamAssignmentSelector.tsx"),
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

  it("omits the redundant lower mobile tools jump to the visible assignment card", () => {
    const mobileToolsStart = pageSource.indexOf('id="mobile-tools"');
    const mobileToolsEnd = pageSource.indexOf('id="mobile-tools-timeline"', mobileToolsStart);
    const mobileTools = pageSource.slice(mobileToolsStart, mobileToolsEnd);

    expect(mobileToolsStart).toBeGreaterThan(-1);
    expect(mobileTools).not.toContain('href="#mobile-assigned-team"');
    expect(mobileTools).not.toContain("Assign / Manage");
    expect(mobileTools).not.toContain('id="mobile-assigned-team-panel"');
  });

  it("keeps mobile assignment mutations on the existing server actions and return anchor", () => {
    expect(controlsSource).toContain("setPrimaryJobAssigneeFromForm");
    expect(controlsSource).toContain("removeJobAssigneeFromForm");
    expect(controlsSource).toContain('isMobile ? "mobile-assigned-team" : "assigned-team"');
    expect(controlsSource).toContain("isInternalUser ? (");
    expect(controlsSource).toContain("<DeferredAddAssigneeForm");
    expect(addAssigneeSource).toContain("<TeamAssignmentSelector");
    expect(addAssigneeSource).toContain("updateJobTeamAssignmentsFromForm");
    expect(teamSelectorSource).toContain("updateTeamAction");
    expect(teamSelectorSource).toContain('name="selected_user_ids"');
    expect(teamSelectorSource).toContain('name="primary_user_id"');
    expect(teamSelectorSource).toContain("Change Team");
    expect(teamSelectorSource).toContain("Assign Team");
    expect(teamSelectorSource).toContain("Search team");
    expect(addAssigneeSource).toContain("returnAnchor");
  });

  it("keeps the Team Assignment selector opener as an interactive client control", () => {
    expect(teamSelectorSource.startsWith('"use client";')).toBe(true);
    expect(teamSelectorSource).toContain("const openSelector = (event: MouseEvent<HTMLButtonElement>) => {");
    expect(teamSelectorSource).toContain("event.preventDefault();");
    expect(teamSelectorSource).toContain("event.stopPropagation();");
    expect(teamSelectorSource).toContain("setOpen(true);");
    expect(teamSelectorSource).toContain('type="button"');
    expect(teamSelectorSource).toContain('data-team-assignment-opener="true"');
    expect(teamSelectorSource).toContain("onClick={openSelector}");
    expect(teamSelectorSource).toContain('role="dialog"');
    expect(teamSelectorSource).toContain('data-team-assignment-panel="true"');
    expect(teamSelectorSource).toContain("fixed inset-x-3 top-20 z-[100]");
    expect(teamSelectorSource).not.toContain("sm:absolute");
    expect(teamSelectorSource).toContain('placeholder="Search team"');
    expect(teamSelectorSource).toContain("onClick={cancelSelector}");
    expect(teamSelectorSource).toContain("setOpen(false);");
    expect(teamSelectorSource).toContain('type="checkbox"');
    expect(teamSelectorSource).toContain("checked={checked}");
    expect(teamSelectorSource).toContain("onChange={() => toggleUser(user.user_id)}");
    expect(teamSelectorSource).toContain("<SubmitButton");
    expect(teamSelectorSource).toContain("Apply");
  });

  it("keeps both empty and assigned team selector states on the same opener path", () => {
    expect(teamSelectorSource).toContain('? "No team assigned"');
    expect(teamSelectorSource).toContain('{selectedCount > 0 ? "Change Team" : "Assign Team"}');
    expect(teamSelectorSource).toContain("disabled={!hasEligibleUsers}");
    expect(teamSelectorSource).toContain("const hasEligibleUsers = assignableUsers.length > 0;");
    expect(teamSelectorSource).toContain("onClick={openSelector}");
    expect(teamSelectorSource).toContain("setOpen(true);");
  });

  it("hides redundant mobile primary promotion for a single assignee while preserving valid switching", () => {
    expect(controlsSource).toContain(
      "const showMakePrimaryAction = !assignee.is_primary && (!isMobile || assignedTeam.length > 1);",
    );
    expect(controlsSource).toContain("{showMakePrimaryAction ? (");
    expect(controlsSource).toContain("setPrimaryJobAssigneeFromForm");
    expect(controlsSource).toContain("Remove");
    expect(controlsSource).toContain("Primary");
  });

  it("keeps mobile assigned rows compact with right-aligned actions", () => {
    expect(controlsSource).toContain(
      '? "flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800',
    );
    expect(controlsSource).toContain('? "min-w-0 flex-1 break-words text-base font-semibold"');
    expect(controlsSource).toContain('? "flex shrink-0 flex-wrap justify-end gap-2"');
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
    expect(pageSource).toContain("mt-2 break-words text-xl font-semibold leading-tight text-[#0f1f35]");
    expect(pageSource).toContain("mt-2 inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-sm font-semibold text-blue-900");
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

  it("keeps the top mobile customer link while omitting the duplicate operations-board customer card", () => {
    const mobileHeaderStart = pageSource.indexOf("<h1");
    const mobileHeaderEnd = pageSource.indexOf('id="mobile-when-panel"', mobileHeaderStart);
    const mobileHeader = pageSource.slice(mobileHeaderStart, mobileHeaderEnd);
    const fieldOpsStart = pageSource.indexOf("Field Operations Board");
    const fieldOpsEnd = pageSource.indexOf('id="assigned-team"', fieldOpsStart);
    const fieldOpsBoard = pageSource.slice(fieldOpsStart, fieldOpsEnd);

    expect(mobileHeaderStart).toBeGreaterThan(-1);
    expect(mobileHeaderEnd).toBeGreaterThan(mobileHeaderStart);
    expect(mobileHeader).toContain("Customer / Account");
    expect(mobileHeader).toContain("mobileCustomerHref");
    expect(fieldOpsStart).toBeGreaterThan(-1);
    expect(fieldOpsEnd).toBeGreaterThan(fieldOpsStart);
    expect(fieldOpsBoard).toContain("Service Location");
    expect(fieldOpsBoard).toContain("Contact Logging");
    expect(fieldOpsBoard).not.toContain("Customer / Account");
    expect(fieldOpsBoard).not.toContain("mobileCustomerHref");
  });

  it("folds the mobile service address edit affordance into the address row", () => {
    const mobileHeaderStart = pageSource.indexOf("<h1");
    const mobileHeaderEnd = pageSource.indexOf('id="mobile-when-panel"', mobileHeaderStart);
    const mobileHeader = pageSource.slice(mobileHeaderStart, mobileHeaderEnd);

    expect(mobileHeaderStart).toBeGreaterThan(-1);
    expect(mobileHeaderEnd).toBeGreaterThan(mobileHeaderStart);
    expect(mobileHeader).toContain("serviceAddressDisplay !== \"No address set\"");
    expect(mobileHeader).toContain("serviceLocationEditHref && isInternalUser");
    expect(mobileHeader).toContain("aria-label={`Edit service address: ${serviceAddressDisplay}`}");
    expect(mobileHeader).toContain("href={serviceLocationEditHref}");
    expect(mobileHeader).toContain("<MapPinIcon");
    expect(mobileHeader).toContain("<ChevronRightIcon");
    expect(mobileHeader).not.toContain(">Edit service address<");
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
