# Server Action Export Surface — Audit

## Why this exists

In a file-level `"use server"` module, **every export becomes a public POST
endpoint**. There is no way to export a helper privately. So a function that was
only ever meant to be called by other server code is published as a callable
entry point anyway, purely because of the file it lives in.

Three of these were found by hand while decomposing `job-actions.ts`:

| function | what it does | how it was reachable |
|---|---|---|
| `insertJobEvent` | writes job event rows | 5 server-side callers, nothing in `app/` |
| `ensureActiveAssignmentAndNotify` | creates assignments, sends notifications | 1 server caller, nothing in `app/` |
| `createJob` | creates jobs | 2 server callers; the new-job form uses `createJobFromForm`, a different function |

All three now live in `lib/actions/job-actions-shared.ts` as plain functions, and
their endpoints are no longer generated. Three in one file is a pattern rather
than a coincidence, which is what prompted a repo-wide look.

## Running it

```
NODE_PATH=./node_modules node scripts/dev/audit-server-action-exports.js
```

It reports every exported function in a `"use server"` module, with whether the
name is referenced anywhere under `app/`, bound as a `<form action={...}>`, or
imported by a `"use client"` file.

## Current state

- **78** `"use server"` modules
- **424** exported server actions
- **91** never referenced from `app/`, never a form action, never imported by a
  client component

Roughly split:

- **22** are called by other non-test modules. These are the `insertJobEvent`
  shape: genuine internal helpers that should move to a neutral module and be
  imported directly.
- **69** are not referenced outside their own file and its tests. These divide
  further, and the distinction decides the fix:
  - called only *within* their own file → should simply not be exported
    (`transitionEstimateStatusAction` in `app/estimates/[id]/actions.ts` is one)
  - referenced nowhere at all → dead code that is also a live endpoint
    (`sendEstimateFromForm`, same file, is one)

## Read this as a candidate list, not a defect list

The scan is name-based. It can be fooled by dynamic dispatch, string-keyed
action maps, or re-export barrels, so a flagged export may still have a real
caller. Confirm each by hand before changing it.

It was validated in both directions before being trusted. Five known-real
endpoints — `updateJobScheduleFromForm`, `addPublicNoteFromForm`,
`createJobFromForm`, `addJobEquipmentFromForm`, `assignJobAssigneeFromForm` — are
correctly **not** flagged. Spot checks in the other direction confirmed genuine
finds.

## Suggested order

Not urgent enough to interrupt the decomposition, but each entry is a public
write endpoint, so it is not merely tidiness either.

1. **`lib/workflows/actions.ts`** — 11 candidates, the highest concentration.
2. **`lib/workflows/account-handoff-connections-actions.ts`** and
   **`account-workshare-requests-actions.ts`** — 8 each.
3. **`lib/actions/job-actions.ts`** — 9 candidates, and the decomposition is
   already touching this file, so they can be handled as clusters move.
4. **`app/estimates/[id]/actions.ts`** — 6, and the clearest examples of the
   two sub-cases above.

The cheapest durable win is the un-export case: functions used only inside their
own file need no relocation at all, just the `export` keyword removed.

## Preventing new ones

Worth considering a CI check that fails when a `"use server"` module gains an
export with no app-layer reachability. The script already produces the data; it
would need an allowlist for the legitimately-server-to-server cases that have not
yet been moved.
