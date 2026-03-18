\# DATA FLOW MAP

Compliance Matters Software

Single Source of Truth: Job-Centric Architecture



---



\# 1. Core Principle



Everything revolves around the \*\*job\*\*.



Customers, locations, contractors, systems, tests, ops queues, reporting —

all attach to `jobs`.



The job is the canonical operational entity.



---



\# 2. Primary Entity Flow



Customer → Location → Job → Systems → ECC Test Runs → Ops Status → Closeout → Archive



---



\# 3. Detailed Flow



\## 3.1 Customer + Location Layer



customers

&nbsp;   ↓

locations (service address)

&nbsp;   ↓

jobs (customer\_id + location\_id)



\- A customer can have multiple locations.

\- A location can have multiple jobs.

\- Jobs inherit operational identity from location.



---



\## 3.2 Job Lifecycle



Create Job

&nbsp;   ↓

Assign Contractor

&nbsp;   ↓

Add Systems / Equipment

&nbsp;   ↓

Run ECC Tests (ecc\_test\_runs)

&nbsp;   ↓

Compute pass/fail (ecc-status.ts)

&nbsp;   ↓

Update ops\_status

&nbsp;   ↓

Invoice + CHEERS completion

&nbsp;   ↓

Archive rule



Archive Rule:

job is completed

AND invoice\_number exists

AND cheers\_completed is true

→ Remove from active ops dashboard



---



\## 3.3 ECC Test Flow



jobs

&nbsp;   ↓

ecc\_test\_runs

&nbsp;   ↓

data (JSON)

&nbsp;   ↓

computed values (pass/fail logic)

&nbsp;   ↓

override support (manual override allowed)

&nbsp;   ↓

final test status



Key Files:

\- app/jobs/\[id]/tests/page.tsx

\- lib/actions/ecc-status.ts

\- lib/actions/ecc-paperwork-actions.ts



---



\## 3.4 Ops Queue Flow



jobs (field status)

&nbsp;   ↓

ops\_status (operational visibility)

&nbsp;   ↓

follow\_up\_date + next\_action\_note

&nbsp;   ↓

dashboard queues (/ops)



Key Files:

\- app/ops/page.tsx

\- lib/actions/job-ops-actions.ts

\- lib/actions/ops-status.ts



Important:

Field status and ops\_status are separate concepts.



---



\## 3.5 Calendar Flow



jobs

&nbsp;   ↓

scheduled\_date + window\_start + window\_end

&nbsp;   ↓

calendar view



Key Files:

\- app/calendar/page.tsx

\- lib/actions/calendar-actions.ts



Timezone handling:

\- lib/utils/schedule-la.ts

\- lib/utils/time.ts



---



\## 3.6 Reporting / Phase 3 Flow (Planned)



jobs

&nbsp;   ↓

ecc\_test\_runs

&nbsp;   ↓

CHEERS summary generation

&nbsp;   ↓

cheers\_completed flag

&nbsp;   ↓

archive eligibility



Future additions:

\- Contractor failure reports

\- Pending info reports

\- Customer intake token verification



---



\# 4. Canonical Data Rules



\- Job owns lifecycle state.

\- ecc\_test\_runs owns test data.

\- ops\_status owns operational visibility.

\- Archive logic depends on invoice + cheers\_completed + completed.



---



\# 5. Null Risk Zones (Production Safety)



High-risk areas:



\- jobs/\[id]/tests page reading test\_run.data

\- single() queries assuming row exists

\- archive logic relying on partial state

\- calendar date handling

\- ops queue grouped counts



Rule:

Never assume a row exists.

Always guard nullable JSON.



---



\# 6. Future Expansion Path



Phase 3:

\- CHEERS summary view

\- Reporting generation

\- Customer intake token workflow



Phase 4:

\- UI polish

\- Design system pass

\- Component refinement

\- Performance tuning

