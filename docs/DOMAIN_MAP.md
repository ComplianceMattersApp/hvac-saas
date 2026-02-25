# DOMAIN_MAP (Ownership + Where To Change Things)

Purpose: reduce confusion across threads by defining “what file owns what domain”.
Rule: if you need to change behavior, start with the owner file first.

---

## Jobs (core job record + lifecycle)
**Routes**
- app/jobs/page.tsx
- app/jobs/new/page.tsx
- app/jobs/[id]/page.tsx
- app/jobs/[id]/info/page.tsx
- app/jobs/[id]/tests/page.tsx

**Actions (owner)**
- lib/actions/job-actions.ts
- lib/actions/job-contact-actions.ts
- lib/actions/job-ops-actions.ts

**UI Components**
- app/jobs/[id]/_components/ServiceStatusActions.tsx
- app/jobs/new/NewJobForm.tsx
- components/jobs/JobCoreFields.tsx

---

## ECC / Tests (ecc_test_runs, pass/fail, paperwork)
**Routes**
- app/jobs/[id]/tests/page.tsx

**Actions (owner)**
- lib/actions/ecc-status.ts
- lib/actions/ecc-paperwork-actions.ts

---

## Ops / Queues (ops_status, follow-up discipline, queue visibility)
**Routes**
- app/ops/page.tsx

**Actions (owner)**
- lib/actions/job-ops-actions.ts
- lib/actions/ops-status.ts

**UI Components**
- app/ops/_components/ContractorFilter.tsx

---

## Calendar / Scheduling
**Routes**
- app/calendar/page.tsx

**Actions (owner)**
- lib/actions/calendar-actions.ts
- lib/actions/calendar.ts

**Utils**
- lib/utils/schedule-la.ts
- lib/utils/scheduling.ts
- lib/utils/time.ts

---

## Customers (customer profile + job history)
**Routes**
- app/customers/page.tsx
- app/customers/[id]/page.tsx
- app/customers/[id]/edit/page.tsx

**Actions (owner)**
- lib/actions/customer-actions.ts

---

## Locations (service address + visits / retest actions)
**Routes**
- app/locations/[id]/page.tsx

**Actions (owner)**
- app/locations/[id]/visit-actions.ts
- app/locations/[id]/schedule-actions.ts
- app/locations/[id]/retest-actions.ts
- app/locations/[id]/close-visit-actions.ts

---

## Contractors (contractor records + assignment)
**Routes**
- app/contractors/page.tsx
- app/contractors/new/page.tsx
- app/contractors/[id]/edit/page.tsx

**Actions (owner)**
- lib/actions/contractor-actions.ts

**UI Components**
- app/contractors/_components/ContractorForm.tsx
- app/contractors/_components/jobs/JobCoreFields.tsx

---

## Services (service records tied to jobs)
**Routes**
- app/services/[id]/page.tsx

**Actions (owner)**
- lib/actions/service-actions.ts

---

## Intake (public/customer intake workflow)
**Routes**
- app/intake/page.tsx

**Actions (owner)**
- lib/actions/intake-actions.ts

---

## Auth / Session
**Routes**
- app/login/page.tsx
- middleware.ts

**Supabase**
- lib/supabase/client.ts
- lib/supabase/server.ts

---

## Shared UI + Layout
- app/layout.tsx
- app/globals.css
- components/ui/*
- components/layout/sidebar.tsx
- components/SubmitButton.tsx