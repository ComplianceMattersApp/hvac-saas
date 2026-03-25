# Root Cause Debug — Compliance Matters

## Purpose
Perform a disciplined, architecture-safe debug pass that fixes the root cause without introducing drift.

---

## Inputs
- Bug description
- Current behavior
- Expected behavior

---

## Process

### 1. Understand the Issue
- Restate the problem clearly
- Identify affected feature and surface

### 2. Identify Owner Layer
Determine where the issue originates:

- Database (data incorrect?)
- Resolver / logic (status, ECC, lifecycle?)
- Server action (mutation issue?)
- UI (rendering only?)

DO NOT assume UI is the problem

---

### 3. Trace Source of Truth

- Verify correct source:
  - `job_events`
  - `ecc_test_runs`
  - `jobs.ops_status`

- Identify where divergence begins

---

### 4. Root Cause Analysis

- What is actually wrong?
- Why is it happening?
- What layer owns the fix?

---

### 5. Apply Minimal Fix

- Patch ONLY the owner layer
- Avoid duplicate logic
- Preserve lifecycle and architecture

---

### 6. Blast Radius Check

Before finalizing:

- What else depends on this logic?
- Could this break:
  - queues?
  - timeline?
  - calendar?
  - portal?

---

### 7. Output

Provide:

1. Root cause explanation
2. Exact file(s) to modify
3. Minimal patch
4. Why this fix is correct
5. Regression checklist

---

## Rules

- No UI guessing
- No lifecycle invention
- No large rewrites
- No parallel logic

---

## Success Criteria

- Bug is resolved at source
- No architectural drift
- No new inconsistencies introduced