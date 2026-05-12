# Support V0 Issue Log Template (Spreadsheet Style)

Status: ACTIVE template for Group 8A owner-led support setup.

Use this as the baseline schema for a shared spreadsheet or doc table.

## 1. Header row (copy into spreadsheet)

`Reported At,Customer / Company,Reporter,Contact Channel,Route / Page,Workflow Area,Expected Behavior,Actual Behavior,Category,Severity,Blocked?,Workaround,Owner,Status,Escalated to Build?,Build Link / Reference,Resolution Notes,Closed At`

## 2. Allowed values

Category:
- Training / Guidance
- Setup / Data
- UX Polish
- Confirmed Bug
- Future Feature

Severity:
- S1 Critical
- S2 High
- S3 Normal
- S4 Low

Blocked?:
- Yes
- Partial
- No

Status:
- New
- In Review
- Engineering
- Resolved
- Closed

Escalated to Build?:
- Yes
- No

## 3. Escalation-to-build rule

Escalate to build work only when:

1. Issue is a confirmed, reproducible bug with clear expected vs actual behavior.
2. Issue is a repeated blocking UX problem causing real workflow stoppage/confusion.

Do not escalate to build work for one-off training/guidance requests, one-off setup/data corrections, or future-feature requests.

## 4. Example row

`2026-05-12 09:14 PT,Acme HVAC,Jane Doe,Email,/jobs/[id],Job Detail,Shared Notes should be hidden in HVAC mode,Shared Notes card still visible in HVAC mode,Confirmed Bug,S3 Normal,No,Refresh + reopen job detail,Owner Name,In Review,Yes,GH-123,Mode guard missing on Shared Notes render,`

## 5. Owner setup placeholders

- Issue log location (spreadsheet/doc URL): `OWNER NEEDED`
- Named owner/first responder: `OWNER NEEDED`
- Support email used in log comms: `OWNER NEEDED`
- Support phone/text used for S1/S2: `OWNER NEEDED`