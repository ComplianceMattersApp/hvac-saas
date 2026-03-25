# Compliance-Driven Dispatch Calendar Refactor

## Purpose
Apply minimal, architecture-safe dispatch calendar changes that satisfy compliance, usability, or layout requirements without introducing layout regressions, duplicate logic, or source-of-truth drift.

## When to Use
- When a dispatch calendar compliance, usability, or layout bug is reported
- When a dispatch calendar refinement is requested after behavior is already understood
- When inspector positioning, filtered dataset rendering, lane layout, or dispatch visibility needs correction

## Inputs
- The specific requirement, bug report, or requested refinement
- The current dispatch calendar implementation
- The canonical filtered dataset and layout logic
- Current project guardrails from repo instructions

## Required Rules
- Treat the calendar as a projection layer, not a source of truth
- Do not invent lifecycle, scheduling state, or ECC status in UI
- Use the canonical filtered dataset for all layout-affecting logic
- Hidden or excluded jobs must never affect spacing, stacking, or positioning
- Inspector/detail panel must remain outside grid flow
- Preserve existing valid behavior unless the request explicitly changes it
- If behavior appears incorrect upstream, identify owner layer before patching UI

## Steps
1. Restate the reported issue or requested refinement clearly
2. Inspect the current implementation in the affected calendar files
3. Verify whether the issue is:
   - dataset/filtering
   - layout engine
   - rendering/presentation
4. Identify the smallest safe fix at the correct owner layer
5. Apply the minimal patch while preserving all existing correct behavior
6. Perform a blast-radius review for nearby dispatch interactions
7. Summarize the change and provide a regression checklist

## Output
Provide:
- root cause
- exact file targets
- minimal patch
- why this layer is correct
- regression checklist

## Success Criteria
- No ghost jobs affect layout
- Inspector remains outside grid flow
- Dispatch lanes remain stable
- Existing valid dispatch behavior is preserved
- No architecture drift is introduced