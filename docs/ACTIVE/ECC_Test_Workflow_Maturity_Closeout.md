# ECC/Test Workflow Maturity Closeout

Status: CLOSED — implemented, smoked by owner, and ready as current ECC field-entry standard.

## Summary

The ECC/Test workflow cleanup is complete for the current intended scope. This pass raised the ECC side of Compliance Matters from functional test entry to a field-first, mobile-friendly, standardized rater workflow. Duct Leakage, Airflow, and Refrigerant Charge now share a consistent entry pattern with reduced visual clutter, exception-first handling, inline live calculated feedback, and clean return behavior. Completion Report now behaves as a print-first report surface, and the main ECC test hub/matrix is simplified.

This pass represents a maturity-level increase for the ECC/HERS side of Compliance Matters. The ECC test workflow now feels purpose-built for raters in the field instead of adapted from a broader service workflow, while preserving the existing ECC truth model.

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

- Refrigerant Charge was restored to a strict top-to-bottom field-entry list.
- Side-by-side/split-panel entry layout was removed.
- Visible Outdoor Temp was removed from the workflow while compatibility was preserved where needed.
- Exception handling moved to the top of the workflow.
- Exception options include Package unit, Conditions not met / weather, and Photo Taken attestation.
- Exception reason appears only for exception paths that require a reason and is required only in those cases.
- Photo Taken opens the evidence/attachments area directly under the exception dropdown.
- Results and Charge Readings were merged into one unified flow.
- Old calculated summary/dashboard clutter was removed.
- Inline live calculated pass/fail feedback is present for measured subcool and measured superheat.
- Existing refrigerant charge formulas/evaluator truth were preserved.
- Complete Test returns to the job detail test section.

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
