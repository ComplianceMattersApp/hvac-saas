# ECC/Test Workflow Maturity Closeout

Status: CLOSED — implemented, smoked by owner, and ready as current ECC field-entry standard.

## Summary

The ECC/Test workflow cleanup is complete for the current intended scope. This pass raised the ECC side of Compliance Matters from functional test entry to a field-first, mobile-friendly, standardized rater workflow. Duct Leakage, Airflow, and Refrigerant Charge now share a consistent entry pattern with reduced visual clutter, exception-first handling, inline live calculated feedback, and clean return behavior. Completion Report now behaves as a print-first report surface, and the main ECC test hub/matrix is simplified.

This pass represents a maturity-level increase for the ECC/HERS side of Compliance Matters. The ECC test workflow now feels purpose-built for raters in the field instead of adapted from a broader service workflow, while preserving the existing ECC truth model.

## Guided Workflow Separation Lock

The next ECC workflow maturity layer is locked in `ECC_Guided_Workflow_Separation_Model_Lock.md`.
The current service/ECC guided workflow maturation lane is closed in `Guided_Workflow_Maturation_Closeout.md`.

This closeout remains the source for ECC field-entry/test workspace standards. The guided workflow lock is the source for ECC blocker, failed/correction, retest, handoff, portal-display, and cert-closeout separation.

Key boundary:

- Service follow-up uses Materials Needed / Approval Needed / Other and linked return visits.
- ECC uses Permit Needed, Failed / Correction Required, Corrections Submitted / Under Review, Retest Ready, linked retest jobs, ECC handoff, and cert closeout blockers.
- ECC must not reuse service follow-up labels or service continuation rules.
- Invoice/payment/no-charge truth remains separate from ECC cert closeout truth.

## Completed Scope

### Duct Leakage

- Visible workflow standardized around `Duct Leakage Results`.
- Extra Focused Test/dashboard-style clutter removed.
- Exception appears first with options: Asbestos, Smoke Test, `< 40' of ducting`, and Other.
- Exception reason appears only when an exception is selected and is required only in that case.
- `< 40' of ducting` is treated as exempt from duct leakage testing.
- Asbestos and `< 40' of ducting` are not presented as normal failed duct leakage results.
- Setup remains available and collapsed by default.
- Results are one compact field-entry area with measured leakage input, live Total Leakage % preview, Max Allowed context, and pass/fail/exception status.
- Duplicate live-result/result-summary cards were removed.
- Script-tag based client behavior was replaced with React-safe live preview handling.
- Complete Test returns to the job detail test section.

### Airflow

- Visible workflow standardized around `Airflow Results`.
- Exception appears first with options: Best Obtainable and Other.
- Exception reason appears only when an exception is selected and is required only in that case.
- Best Obtainable is treated as an exception/field condition, not as a normal failed result.
- Setup remains available and collapsed by default.
- Results use a compact field-entry area with prominent CFM entry and inline live result/pass-fail feedback.
- Old dashboard/live-result clutter was removed.
- Complete Test returns to the job detail test section.

### Refrigerant Charge

- Refrigerant Charge now uses a mode-based documentation path: Enter readings, Photo evidence, or Exception / Not applicable.
- Enter readings shows the numeric Refrigerant Charge fields and preserves the existing computed pass/fail behavior.
- Side-by-side/split-panel entry layout was removed.
- Visible Outdoor Temp was removed from the workflow while compatibility was preserved where needed.
- Photo evidence is now a guided inline path inside the Refrigerant Charge task instead of a required first detour to the generic Attachment Library.
- Photo evidence provides separate Take Photo and Upload Photo controls.
- Take Photo uses camera capture behavior.
- Upload Photo allows existing photo/file selection without forcing camera capture.
- Evidence saves as normal job attachments with refrigerant charge evidence context.
- Original file_name is preserved.
- User-facing attachment labels/titles are clean and do not expose internal refrigerant evidence tags.
- Editing attachment title/label preserves refrigerant evidence context.
- Evidence appears back inside the Refrigerant Charge panel after upload.
- Attachment Library remains storage/history, not the required first stop.
- Photo evidence mode hides numeric Refrigerant Charge entry fields, live numeric previews, filter drier checkbox, and numeric result summary.
- Completing Photo evidence requires explicit Pass / Fail / Needs Review.
- Photo capture/upload alone does not set computed_pass = true.
- Needs Review remains non-pass/non-fail.
- Explicit Pass/Fail is user-selected outcome/override behavior, not inferred from photo evidence.
- Exception / Not applicable remains separate from photo evidence and shows only relevant exception controls/reason fields.
- Package unit and weather/conditions exception behavior remains separate from photo evidence.
- Results and Charge Readings remain one unified numeric flow when Enter readings is selected.
- Old calculated summary/dashboard clutter was removed.
- Inline live calculated pass/fail feedback is present for measured subcool and measured superheat only in Enter readings mode.
- Existing refrigerant charge formulas/evaluator truth were preserved.
- Complete Test returns to the job detail test section.
- Future V3 mobile UX may convert documentation method and photo result choices into large stacked mobile buttons for faster field use.

### Equipment Label Photo Evidence

- Add Equipment now supports equipment label photo evidence as an inline field workflow.
- Take Label Photo and Upload Label Photo sit with the add-equipment actions instead of in a detached panel.
- Add Equipment is withheld until either manual equipment details are entered or label photo evidence has been saved.
- For cooling equipment, Tonnage stays visible in the primary add flow even when using photo evidence because airflow and related ECC defaults depend on that value.
- Enter Details contains secondary optional fields such as manufacturer, model, serial, refrigerant, and notes.
- System Inventory shows equipment by its main equipment name and avoids duplicate system labels or placeholder rows when details are blank.

### Completion Report

- Completion Report now opens as a report-first surface.
- Extra workspace/test-entry headers and redundant context around the report were removed.
- Print, Back, and Download controls remain available on screen and are suppressed from printed output.
- Print behavior focuses on report content instead of app workspace clutter.
- Report access remains from the main test hub/page and is not repeated unnecessarily inside individual test-entry pages.

### Main ECC Test Hub / Matrix

- Redundant Test Queue matrix button was removed.
- Report was renamed to Completion Report.
- Equipment access was preserved.
- Multi-system switching is surfaced as direct system chips instead of a hidden large Systems button.
- Single-system context uses a simple current system label.
- Matrix button height, width, spacing, and styling were cleaned up.
- Mobile vertical clutter was reduced.

## Current Standard

ECC test-entry workspaces should follow this pattern:

- clear test title
- Exception first, only expanded when needed
- reason required only when exception is selected
- setup/context collapsed by default
- one compact Results area
- live calculated feedback inline
- no duplicate dashboard/result cards
- no side-by-side field entry on mobile
- Complete Test returns to the job detail test section
- report surfaces remain report-first and print-friendly

## Explicit Non-Actions

- no schema changes
- no RLS changes
- no payment, Stripe, QBO, SMS, or provider behavior changes
- no invoice/payment truth changes
- no cert closeout truth changes
- no ECC evaluator truth changes
- no formula changes
- no new customer portal behavior
- no new attachment/photo enforcement
- no broader service workflow changes
- no new dedicated ECC exception schema in this pass

## Known Model Note

Exception handling currently uses existing override/exception-compatible plumbing rather than a new dedicated ECC exception truth model. This is accepted for the current maturity pass because the UI no longer presents exception/exempt conditions as ordinary failed test results. A future dedicated ECC exception truth model may be considered later only if field use shows reporting/audit needs that exceed the current model.

## Validation

- TypeScript passed.
- Focused ECC action tests passed.
- Focused Duct Leakage tests passed.
- Focused Airflow tests passed.
- Focused Refrigerant Charge/photo attestation tests passed.
- Job tests page wiring tests passed.
- `git diff --check` passed with only existing CRLF/LF warnings.
- Owner browser smoke confirmed the final Duct Leakage, Airflow, Refrigerant Charge, Completion Report, and test hub/matrix behavior as visually correct.
