# Support V0 Issue Log Template (Spreadsheet Style)

Status: ACTIVE template for Group 8A owner-led support setup.

Use this as the baseline schema for a shared spreadsheet or doc table.

## 0. Recommended V0 path (owner-led slim)

For the current one-owner Support V0 model, use the slim spreadsheet format below as the default operating path.

Current log location:
- `Owner-managed Google Sheet — "Compliance Matters Support V0 Issue Log"`

## 1. Slim header row (recommended default)

`Date,Company/User,Issue or Question,Category,Severity,Status,Resolution / Next Step,Build Work Needed?`

## 2. Allowed values (slim)

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

Status:
- New
- In Review
- Engineering
- Resolved
- Closed

Build Work Needed?:
- Yes
- No

## 3. Escalation-to-build rule (slim)

Escalate to build work only when:

1. Issue is a confirmed, reproducible bug with clear expected vs actual behavior.
2. Issue is a repeated blocking UX problem causing real workflow stoppage/confusion.

Do not escalate to build work for one-off training/guidance requests, one-off setup/data corrections, or future-feature requests.

---

## 4. Fuller template (optional/future)

Use the fuller schema below only if support volume/complexity grows and the owner wants more detailed triage fields.

### 4.1 Header row (full)

`Reported At,Customer / Company,Reporter,Contact Channel,Route / Page,Workflow Area,Expected Behavior,Actual Behavior,Category,Severity,Blocked?,Workaround,Owner,Status,Escalated to Build?,Build Link / Reference,Resolution Notes,Closed At`

### 4.2 Allowed values (full)

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

### 4.3 Escalation-to-build rule (full)

Escalate to build work only when:

1. Issue is a confirmed, reproducible bug with clear expected vs actual behavior.
2. Issue is a repeated blocking UX problem causing real workflow stoppage/confusion.

Do not escalate to build work for one-off training/guidance requests, one-off setup/data corrections, or future-feature requests.

### 4.4 Example row

`2026-05-12 09:14 PT,Acme HVAC,Jane Doe,Email,/jobs/[id],Job Detail,Shared Notes should be hidden in HVAC mode,Shared Notes card still visible in HVAC mode,Confirmed Bug,S3 Normal,No,Refresh + reopen job detail,Owner Name,In Review,Yes,GH-123,Mode guard missing on Shared Notes render,`

### 4.5 Current owner-led setup values

- Issue log location (spreadsheet/doc URL): `Owner-managed Google Sheet — "Compliance Matters Support V0 Issue Log"`
- Named owner/first responder: `Eddie Castellanos`
- Support email used in log comms: `eddie@compliancemattersca.com`
- Support phone/text used for S1/S2: `209-518-2383`