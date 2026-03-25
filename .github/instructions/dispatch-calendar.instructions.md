# Dispatch Calendar — Scoped Instructions

Applies to:
- components/calendar/*
- dispatch grid
- calendar-view.tsx
- CalendarMonthGrid.tsx

---

## PURPOSE

The dispatch calendar is a **visual projection of operational data**.

It is NOT a source of truth.

---

## CORE RULES

- The calendar must only reflect filtered, valid jobs
- Hidden jobs must NEVER affect layout
- No "ghost jobs" or invisible spacing

---

## DATA RULES

- Always use the canonical filtered dataset
- Do NOT create secondary filtering logic in UI
- Do NOT allow excluded jobs to influence layout calculations

---

## LAYOUT RULES

- Grid = pure layout surface
- Inspector panel MUST:
  - be outside grid flow
  - not affect layout
  - not reposition grid elements

---

## INTERACTION MODEL

- Calendar is read-first, not edit-first
- Edits happen in inspector panel only
- No inline mutation inside grid

---

## STATUS DISPLAY

- Status is display-only
- Must come from `jobs.ops_status`
- No UI-derived status logic

---

## DISPATCH LOGIC

- Calendar reflects scheduling, not lifecycle decisions
- Scheduling state must come from backend fields
- Do NOT compute scheduling state in UI

---

## CHANGE DISCIPLINE

If a bug is reported:

1. Verify dataset filtering first
2. Verify layout engine second
3. Verify rendering last

Do NOT patch rendering first unless confirmed UI-only issue