import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

const mobileJobDetailCurrentSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/MobileJobDetailCurrent.tsx"),
  "utf8",
);

const mobileJobDetailV2PreviewSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/MobileJobDetailV2Preview.tsx"),
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
  it("keeps current mobile as default and gates the V2 preview behind mobileLayout=v2", () => {
    expect(pageSource).toContain('import MobileJobDetailCurrent from "./_components/MobileJobDetailCurrent";');
    expect(pageSource).toContain('import MobileJobDetailV2Preview from "./_components/MobileJobDetailV2Preview";');
    expect(pageSource).toContain("const mobileLayoutRaw = sp.mobileLayout;");
    expect(pageSource).toContain('const useMobileV2Preview = mobileLayout === "v2";');
    expect(pageSource).toContain("const MobileJobDetailMobileComponent = useMobileV2Preview");
    expect(pageSource).toContain("? MobileJobDetailV2Preview");
    expect(pageSource).toContain(": MobileJobDetailCurrent");
    expect(pageSource).toContain("<MobileJobDetailMobileComponent");
    expect(mobileJobDetailV2PreviewSource).toContain("export default function MobileJobDetailV2Preview");
    expect(mobileJobDetailV2PreviewSource).toContain("Billing / Closeout");
    expect(mobileJobDetailV2PreviewSource).toContain("No billing action needed yet.");
    expect(mobileJobDetailV2PreviewSource).not.toContain("Preview only");
  });

  it("keeps V2 preview anchor CTAs routed to standard current mobile anchors or real workspaces", () => {
    expect(mobileJobDetailV2PreviewSource).toContain('const standardJobHref = `/jobs/${job.id}?tab=${tab}`;');
    expect(mobileJobDetailV2PreviewSource).toContain("const standardJobAnchorHref = (anchor: string) => `${standardJobHref}#${anchor}`;");
    expect(mobileJobDetailV2PreviewSource).toContain("? standardJobAnchorHref(nextStep.anchor)");
    expect(mobileJobDetailV2PreviewSource).toContain('standardJobAnchorHref("mobile-work-scope")');
    expect(mobileJobDetailV2PreviewSource).toContain('standardJobAnchorHref("mobile-tools")');
    expect(mobileJobDetailV2PreviewSource).toContain('standardJobAnchorHref("mobile-internal-notes")');
    expect(mobileJobDetailV2PreviewSource).toContain('standardJobAnchorHref("mobile-shared-notes")');
    expect(mobileJobDetailV2PreviewSource).toContain("standardJobAnchorHref(billingPreview.hrefAnchor)");
    expect(mobileJobDetailV2PreviewSource).toContain("nextStep.href");
    expect(mobileJobDetailV2PreviewSource).toContain("href: `/jobs/${props.job.id}/tests`");
    expect(mobileJobDetailV2PreviewSource).toContain('href={`/jobs/${job.id}/attachments`}');
    expect(mobileJobDetailV2PreviewSource).not.toContain('href={`/jobs/${job.id}?tab=${tab}#');
  });

  it("does not treat ECC test availability as required test attention in the V2 preview", () => {
    expect(mobileJobDetailV2PreviewSource).toContain("function hasCompletedEccTestRun");
    expect(mobileJobDetailV2PreviewSource).toContain('String(sp?.notice ?? "").trim() === "ecc_test_required" && !hasCompletedEccTestRun(job)');
    expect(mobileJobDetailV2PreviewSource).toContain("hasRequiredEccTestAttention: boolean");
    expect(mobileJobDetailV2PreviewSource).toContain("props.hasRequiredEccTestAttention");
    expect(mobileJobDetailV2PreviewSource).not.toContain("!props.isFieldComplete ||\n      props.showMobileEccTestAction");
    expect(mobileJobDetailV2PreviewSource).toContain("Open test workflow");
    expect(mobileJobDetailV2PreviewSource).not.toContain("Open the required test workflow");
  });

  it("uses action-oriented wording for the generic V2 field completion branch", () => {
    expect(mobileJobDetailV2PreviewSource).toContain('return "Mark Field Work Complete";');
    expect(mobileJobDetailV2PreviewSource).toContain('"Finish field visit"');
    expect(mobileJobDetailV2PreviewSource).toContain('"When the field work is done, mark this visit complete."');
    expect(mobileJobDetailV2PreviewSource).not.toContain('return "Complete work";');
    expect(mobileJobDetailV2PreviewSource).not.toContain('"Complete the field visit when the work is done."');
  });

  it("surfaces existing Visit Scope as Service work without treating it as billing truth", () => {
    expect(mobileJobDetailV2PreviewSource).toContain("const allVisitScopeItems = Array.isArray(visitScopeItems) ? visitScopeItems : [];");
    expect(mobileJobDetailV2PreviewSource).toContain('item?.kind === "companion_service"');
    expect(mobileJobDetailV2PreviewSource).toContain('"Companion Service Work"');
    expect(mobileJobDetailV2PreviewSource).toContain('"Work Performed"');
    expect(mobileJobDetailV2PreviewSource).toContain('"Work to Do"');
    expect(mobileJobDetailV2PreviewSource).toContain("Visit reason / summary");
    expect(mobileJobDetailV2PreviewSource).toContain("No Work Items saved yet.");
    expect(mobileJobDetailV2PreviewSource).toContain('standardJobAnchorHref("mobile-work-scope")');
    expect(mobileJobDetailV2PreviewSource).toContain("View work details");
    expect(mobileJobDetailV2PreviewSource).not.toContain("Invoice Charges are billed scope. Work Items remain operational scope.");
  });

  it("hardens V2 preview lifecycle exceptions as read-only or attention states", () => {
    expect(mobileJobDetailV2PreviewSource).toContain("function getLifecycleExceptionLabel");
    expect(mobileJobDetailV2PreviewSource).toContain("function getWaitingStateLabel");
    expect(mobileJobDetailV2PreviewSource).toContain("function buildExceptionNextStepPreview");
    expect(mobileJobDetailV2PreviewSource).toContain('return "Approval needed"');
    expect(mobileJobDetailV2PreviewSource).toContain('return "Waiting on part"');
    expect(mobileJobDetailV2PreviewSource).toContain('return "Waiting on info"');
    expect(mobileJobDetailV2PreviewSource).toContain('return "Paused"');
    expect(mobileJobDetailV2PreviewSource).toContain('return "Correction needed"');
    expect(mobileJobDetailV2PreviewSource).toContain('return "Review needed"');
    expect(mobileJobDetailV2PreviewSource).toContain('return "Retest needed"');
    expect(mobileJobDetailV2PreviewSource).toContain('return "Linked active job"');
    expect(mobileJobDetailV2PreviewSource).toContain('title: "Job cancelled"');
    expect(mobileJobDetailV2PreviewSource).toContain('title: "Job closed"');
    expect(mobileJobDetailV2PreviewSource).toContain('actionLabel: "Review job history"');
    expect(mobileJobDetailV2PreviewSource).toContain('actionLabel: "Open waiting tools"');
    expect(mobileJobDetailV2PreviewSource).toContain('anchor: "mobile-tools"');
    expect(mobileJobDetailV2PreviewSource).toContain('"href" in nextStep && nextStep.href');
  });

  it("keeps V2 More Details tools flattened into direct grouped rows", () => {
    expect(mobileJobDetailV2PreviewSource).toContain("Admin tools, permits, history, and follow-up.");
    expect(mobileJobDetailV2PreviewSource).toContain("toolsGroupHeadingClass");
    expect(mobileJobDetailV2PreviewSource).toContain("Admin / Records");
    expect(mobileJobDetailV2PreviewSource).toContain("Create Estimate");
    expect(mobileJobDetailV2PreviewSource).toContain("Create Return Visit");
    expect(mobileJobDetailV2PreviewSource).toContain('standardJobAnchorHref("mobile-follow-up-job")');
    expect(mobileJobDetailV2PreviewSource).toContain("Permit Information");
    expect(mobileJobDetailV2PreviewSource).toContain('standardJobAnchorHref("mobile-permit-info")');
    expect(mobileJobDetailV2PreviewSource).toContain("Job Status Tools");
    expect(mobileJobDetailV2PreviewSource).toContain("Timeline / History");
    expect(mobileJobDetailV2PreviewSource).toContain('standardJobAnchorHref("mobile-tools-timeline")');
    expect(mobileJobDetailV2PreviewSource).toContain("Location & Address");
    expect(mobileJobDetailV2PreviewSource).not.toContain(">Job Tools</span>");
    expect(mobileJobDetailV2PreviewSource).not.toContain("Open tools area");
  });

  it("exposes mobile assignment controls in the visible Team Assignment card", () => {
    const mobilePanelStart = mobileJobDetailCurrentSource.indexOf("<AssignedTeamControls", mobileJobDetailCurrentSource.indexOf("Contact Logging"));
    const mobilePanelEnd = mobileJobDetailCurrentSource.indexOf("showMobileContractorContext", mobilePanelStart);
    const mobilePanel = mobileJobDetailCurrentSource.slice(mobilePanelStart, mobilePanelEnd);

    expect(mobilePanelStart).toBeGreaterThan(-1);
    expect(mobilePanel).toContain("<AssignedTeamControls");
    expect(mobilePanel).toContain('variant="mobile"');
    expect(mobilePanel).toContain("isInternalUser={isInternalUser}");
    expect(mobilePanel).toContain("assignedTeam={assignedTeam}");
    expect(mobilePanel).toContain("assignedUserIds={assignedUserIds}");
  });

  it("omits the redundant lower mobile tools jump to the visible assignment card", () => {
    const mobileToolsStart = mobileJobDetailCurrentSource.indexOf('id="mobile-tools"');
    const mobileToolsEnd = mobileJobDetailCurrentSource.indexOf('id="mobile-tools-timeline"', mobileToolsStart);
    const mobileTools = mobileJobDetailCurrentSource.slice(mobileToolsStart, mobileToolsEnd);

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
    expect(mobileJobDetailCurrentSource).toContain("{mobileAppointmentTimeLabel ? (");
    expect(mobileJobDetailCurrentSource).toContain('<details id="mobile-when-panel" className="group relative overflow-visible rounded-xl');
    expect(mobileJobDetailCurrentSource).toContain("mt-2 break-words text-xl font-semibold leading-tight text-[#0f1f35]");
    expect(mobileJobDetailCurrentSource).toContain("mt-2 inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-sm font-semibold text-blue-900");
    expect(mobileJobDetailCurrentSource).toContain("hidden w-full max-w-[calc(100vw-1.5rem)] group-open:block");
    expect(contactLoggingSource).toContain("min-h-[4rem]");
    expect(contactLoggingSource).toContain("h-full");
    expect(contactLoggingSource).toContain("whitespace-normal");
    expect(contactLoggingSource).toContain('className="flex w-full"');
  });

  it("omits the redundant mobile work summary card from the header", () => {
    const mobileScheduleStart = mobileJobDetailCurrentSource.indexOf('id="mobile-when-panel"');
    const mobileScheduleEnd = mobileJobDetailCurrentSource.indexOf('{banner === "note_added"', mobileScheduleStart);
    const mobileScheduleSection = mobileJobDetailCurrentSource.slice(mobileScheduleStart, mobileScheduleEnd);

    expect(mobileScheduleStart).toBeGreaterThan(-1);
    expect(mobileScheduleEnd).toBeGreaterThan(mobileScheduleStart);
    expect(`${pageSource}\n${mobileJobDetailCurrentSource}`).not.toContain("const mobileWorkStateLabel =");
    expect(mobileJobDetailCurrentSource).not.toContain("{mobileWorkStateLabel}");
    expect(mobileScheduleSection).not.toContain("<span>Work</span>");
    expect(mobileScheduleSection).not.toContain('job.job_type === "service" ? "Service" : "ECC"');
  });

  it("keeps the top mobile customer link while omitting the duplicate operations-board customer card", () => {
    const mobileHeaderStart = mobileJobDetailCurrentSource.indexOf("<h1");
    const mobileHeaderEnd = mobileJobDetailCurrentSource.indexOf('id="mobile-when-panel"', mobileHeaderStart);
    const mobileHeader = mobileJobDetailCurrentSource.slice(mobileHeaderStart, mobileHeaderEnd);
    const fieldOpsStart = mobileJobDetailCurrentSource.indexOf("Field Operations Board");
    const fieldOpsEnd = mobileJobDetailCurrentSource.indexOf('id="assigned-team"', fieldOpsStart);
    const fieldOpsBoard = mobileJobDetailCurrentSource.slice(fieldOpsStart, fieldOpsEnd);

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

  it("styles the mobile Notes & Attachments attachment link as a blue action", () => {
    const notesHubStart = mobileJobDetailCurrentSource.indexOf('id="mobile-notes-hub"');
    const notesHubEnd = mobileJobDetailCurrentSource.indexOf('id="mobile-internal-notes"', notesHubStart);
    const notesHub = mobileJobDetailCurrentSource.slice(notesHubStart, notesHubEnd);

    expect(notesHubStart).toBeGreaterThan(-1);
    expect(notesHubEnd).toBeGreaterThan(notesHubStart);
    expect(notesHub).toContain('href={`/jobs/${job.id}/attachments`}');
    expect(notesHub).toContain("rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white");
    expect(notesHub).toContain("hover:bg-blue-800");
    expect(notesHub).toContain("focus-visible:ring-2 focus-visible:ring-blue-300");
    expect(notesHub).toContain("active:translate-y-[0.5px]");
  });

  it("folds the mobile service address edit affordance into the address row", () => {
    const mobileHeaderStart = mobileJobDetailCurrentSource.indexOf("<h1");
    const mobileHeaderEnd = mobileJobDetailCurrentSource.indexOf('id="mobile-when-panel"', mobileHeaderStart);
    const mobileHeader = mobileJobDetailCurrentSource.slice(mobileHeaderStart, mobileHeaderEnd);

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
    const mobileWorkbenchStart = mobileJobDetailCurrentSource.indexOf('id="mobile-when-panel"');
    const mobileWorkbenchEnd = mobileJobDetailCurrentSource.indexOf('{banner === "note_added"', mobileWorkbenchStart);
    const mobileWorkbench = mobileJobDetailCurrentSource.slice(mobileWorkbenchStart, mobileWorkbenchEnd);

    expect(mobileWorkbenchStart).toBeGreaterThan(-1);
    expect(mobileWorkbenchEnd).toBeGreaterThan(mobileWorkbenchStart);
    expect(mobileWorkbench).not.toContain("formatOpsStatusLabel(job.ops_status, job.job_type)");
    expect(mobileWorkbench).not.toContain("{formatStatus(job.status)}");
  });

  it("uses the current mobile field status as the compact action card header", () => {
    const actionCardStart = mobileJobDetailCurrentSource.indexOf('shadow-[0_18px_36px_-30px_rgba(29,78,216,0.32)]');
    const actionCardEnd = mobileJobDetailCurrentSource.indexOf("<JobFieldActionButton", actionCardStart);
    const actionCard = mobileJobDetailCurrentSource.slice(actionCardStart, actionCardEnd);

    expect(actionCardStart).toBeGreaterThan(-1);
    expect(actionCardEnd).toBeGreaterThan(actionCardStart);
    expect(actionCard).toContain("<span>{mobileCurrentStatusLabel}</span>");
    expect(actionCard).not.toContain("Next Field Action");
    expect(actionCard).not.toContain("Current Status");
    expect(mobileJobDetailCurrentSource).toContain("<JobFieldActionButton");
  });
});
