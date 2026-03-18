POLISH_BACKLOG

# POLISH BACKLOG (UI/UX)

Purpose: Track visual/UX improvements to apply during the dedicated polish stage.
Rule: Do not implement items here unless we explicitly enter the “Polish Stage”.

## Global UI
- [ ] Consistent page headers (title, breadcrumbs/back link, key actions)
- [ ] Consistent spacing + typography scale (padding, section gaps, headings)
- [ ] Standard button styles (primary/secondary/danger, sizes)
- [ ] Status badges (Job status, Ops status, Test result)
- [ ] Empty states (no jobs / no locations / no equipment / no tests)
- [ ] Loading states (skeletons/spinners) + disabled states on actions
- [ ] Error states: user-friendly messages + safe fallback UI

## Forms
- [ ] Field alignment + labels consistent (grid layout rules)
- [ ] Inline helper text for required readings / blocked conditions
- [ ] Reduce button redundancy (e.g., Save vs Complete wording) — cosmetic
- [ ] Make “Completed” lock state visually clear (read-only inputs, badge)

## ECC Tests UX
- [ ] Gate “Complete Test” until computed is possible (computed_pass not null OR override)
- [ ] Show “Completed at” timestamp when test is completed
- [ ] Improve PASS/FAIL/Not computed display (badge + color + icon)
- [ ] Keep computed details compact; expand/collapse optional

## Customer Command Center UX
- [ ] Customer “folder” feel: locations + jobs + visits all grouped
- [ ] Location cards visually nested under customer
- [ ] Job cards visually nested under location
- [ ] Visit timeline view (chips or vertical timeline)

## Navigation / Cohesion
- [ ] Add consistent “Related links” section on entity pages
- [ ] Make cross-links obvious (Customer ↔ Location ↔ Job)
