# Attachment Upload & Storage Audit — 2026-08-17

Hardening review of how job attachments are uploaded, stored, and retrieved,
plus a design decision on photo preview and retrieval informed by how the
incumbent field-service platforms handle the same problem.

Scope: the `attachments` table, the `attachments` storage bucket, the four
upload surfaces (internal job workspace, contractor portal, refrigerant charge
evidence, equipment label evidence), and every read path that renders or signs
an attachment.

---

## 1. Verdict

The upload flow was **not** built on sand, but it rested on three unstated
assumptions that were no longer true, and it had one genuine structural gap.

What held up well:

- Authorization is properly layered. Every mutation resolves the actor
  (contractor vs. internal), scopes the job to the caller's account, and
  re-checks entitlement. Cross-account access was already closed off by
  `loadScopedInternal*` helpers and the RLS policies behind them.
- The storage bucket is private, and retrieval is via short-lived signed URLs
  rather than public objects.
- Deletion cleans up both the row and the object, in that order.

What did not:

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | No server-side type or size validation on upload | High | Fixed |
| 2 | Client-declared `content_type` / `file_size` trusted permanently | High | Fixed |
| 3 | Bucket invariants existed only in the Supabase dashboard | Medium | Fixed |
| 4 | Storage RLS seq-scanned `attachments` on every object touched | Medium | Fixed |
| 5 | N+1 signed-URL round trips on every attachment render | Medium | Fixed |
| 6 | Abandoned uploads left permanently broken rows | Medium | Fixed |
| 7 | No uploader recorded anywhere on the attachment row | High (compliance) | Fixed |
| 8 | Undecodable images silently rendered as document tiles | Medium | Fixed |
| 9 | Attachment library capped at 500 with no pagination | Low | Open |
| 10 | `account_owner_user_id` absent from `attachments` | Medium | Deferred — see §5 |

---

## 2. Findings in detail

### 2.1 The upload token was the only gate, and it did not gate anything

`createJobAttachmentUploadToken` accepted `contentType` and `fileSize` from the
browser and wrote them straight into the row, then minted a **service-role**
signed upload URL. Service-role bypasses storage RLS by design, so at that point
nothing on the server constrained what actually landed in the bucket. A client
could declare `image/jpeg, 1024 bytes` and upload a 5 GB HTML file.

Fixed by `lib/attachments/attachment-upload-policy.ts`: a single allowlist of
content types, each mapped to the extensions that may legitimately carry it, so
a file cannot claim `image/jpeg` while landing as `payload.html`, nor claim
`text/html` while wearing a `.jpg`. SVG is deliberately excluded — it is an
active-content format and these objects are served from signed URLs that render
in the browser.

The same module is applied in the browser at pick time so the technician sees
the problem immediately, and re-applied on the server, which is the boundary
that actually counts.

### 2.2 Declared metadata was never reconciled against reality

Even with validation at token time, the declared values were claims about a file
that had not been uploaded yet. `finalizeInternalJobAttachmentUpload` now
inspects the object that actually landed, re-runs the policy against its real
size and MIME type, deletes anything that overshot or arrived as a disallowed
type, and rewrites the row to match storage.

### 2.3 Bucket configuration was untracked

The `attachments` bucket had been created through the Supabase dashboard, so its
privacy and size ceiling would not survive an environment rebuild. Now pinned in
`20260817120000_attachment_storage_hardening.sql` at 25 MiB, private.

No bucket-wide `allowed_mime_types` is set on purpose: this one bucket also
carries business logos (SVG), permit PDFs, and estimate photos, so a bucket-level
allowlist would be the union of every surface's needs and would meaningfully
constrain none of them. Type policy stays per-surface in application code.

### 2.4 Storage RLS had no supporting index

Both storage policies resolve an object by
`public.attachments.storage_path = storage.objects.name`, and `storage_path` had
no index — so every policy evaluation sequentially scanned `attachments`, once
per object touched. Indexed in the same migration.

### 2.5 Signing was N+1

Every render signed each attachment with its own round trip to Storage. Replaced
by `lib/attachments/signed-attachment-urls.ts`, which batches through
`createSignedUrls`. A 40-photo job went from 40 sequential round trips to one.

### 2.6 Abandoned uploads left broken rows

The upload is a three-step flow: insert the row, hand back a signed upload URL,
finalize. A technician who loses signal or closes the tab between steps two and
three left a row describing an object that never arrived, which rendered
permanently as a broken tile — and there was no way to distinguish it from a
legitimate attachment.

Fixed with a `finalized_at` column. Rows are staged `NULL` and promoted only
once the object is confirmed present. Read surfaces filter on it.

The column **defaults to `now()`**, which is the important safety property: every
other insert path (permit intake, business profile, job actions) stays
finalized-on-insert with no change, and any read path not yet converted behaves
exactly as it does today. A missed filter can never hide a legitimate
attachment — the failure mode is "no worse than before", not "evidence
disappears".

A daily sweep (`/api/cron/attachment-upload-sweep`, 08:00 UTC) reclaims staged
rows older than 24 hours and removes their objects. The grace period is
deliberately generous: a large photo over poor LTE from a mechanical room can
take a long time, and sweeping a row out from under an in-flight upload would
delete a technician's work.

### 2.7 No provenance — the most significant finding

`public.attachments` recorded **no uploader**. For a compliance product whose
photos are evidence — equipment nameplates, refrigerant charge readings, duct
leakage — "who produced this?" was only answerable by scanning `job_events.meta`
for an `attachment_ids` array that happened to contain the id, and only when a
finalize event was written at all. Direct inserts left no actor trail whatsoever.

`created_by_user_id` is now recorded at upload. It is nullable with no backfill:
existing rows genuinely have no recoverable uploader, and inventing one would be
worse than recording the gap honestly.

### 2.8 Undecodable images masqueraded as documents

When a preview failed to render, `onError` pushed the id into `failedPreviewIds`,
`hasThumb` went false, and the tile fell through to the generic file-glyph
branch — producing a tidy card with an "IMG" badge, the filename, and the label
"Image". A photo the browser could not decode looked exactly like an ordinary
document attachment. Nobody would ever learn the evidence was unviewable.

This is the practical HEIC exposure. It is now a distinct amber "Preview
unavailable in this browser — use Open to download the original" state.

---

## 3. Photo storage and retrieval — the design decision

### 3.1 What the incumbents do

- **Housecall Pro** makes compression a **user-level setting**, persisted
  server-side and applied across all of that user's devices. Attachment display
  paginates at 25 per page, configurable to 50 or 75.
- **CompanyCam** — the photo specialist in this market — **reversed away from
  compression**, shipping "ultra-resolution" explicitly to stop contractors
  losing detail. Jobber does not compete here; it *integrates* CompanyCam.
- **Jobber** rejects HEIC rather than transforming it (allowlist: png, img, jpg,
  jpeg, gif, bmp). Size caps are per-pathway, not global: 500 MB on notes,
  100 MB for line-item images, but 10 MB across all email attachments. Upload
  batches cap at 50; the mobile app shows only the last 15.
- Industry-standard HEIC remedy is a clear rejection plus telling the user to
  switch the iPhone camera format — not server-side transformation.

### 3.2 Decision: no Supabase image transformations

Rejected, for three reasons:

1. **Transform and bulk signing are mutually exclusive.** `createSignedUrl`
   bakes the transform into the signed token; `createSignedUrls` has no
   transform parameter. Enabling transforms would undo the batching in §2.5 and
   return the app to one Storage round trip per photo.
2. **The cost scales with uploads, not views** — billed per unique origin image
   per month. At ~15 photos/tech/day (~330/month), that is a bill that grows
   linearly with headcount, forever, to solve a problem the client can solve
   once at upload for nothing.
3. **The problem it fixes is largely absent.** Every capture path uses
   `<input type="file" accept="image/*" capture="environment">`, and iOS
   converts HEIC to JPEG on that path in the large majority of cases.

### 3.3 Decision: originals are never downscaled

The magnifier technicians rely on for reading a data plate is **browser-native**
— `JobAttachmentsInternal.tsx` renders
`<a href={signedUrl} target="_blank"><img src={signedUrl}></a>`, so clicking
opens the raw full-resolution object and Chrome's standalone image viewer
supplies click-to-zoom.

That, plus CompanyCam's reversal, plus the compliance-evidence role of these
photos, settles it: **stored originals stay untouched.** Any future thumbnail is
strictly additive.

Critically, `href` and `src` are already separate slots. A thumbnail can go into
`src` while `href` keeps pointing at the original, preserving the magnifier at
full fidelity — a one-attribute change, not a redesign.

### 3.4 Recommended next step, gated on measurement

Thumbnails were never about HEIC; the only remaining argument for them is
payload — ~60 MB/tech/day uploaded over LTE, and grids downloading
full-resolution originals to draw 130px tiles. Whether that is worth building
depends on the real numbers:

```sql
select
  content_type,
  count(*) as uploads,
  pg_size_pretty(avg(file_size)::bigint) as avg_size,
  pg_size_pretty(sum(file_size)::bigint) as total
from public.attachments
where content_type like 'image/%'
group by content_type
order by uploads desc;
```

If average size is 3–5 MB, build canvas-generated thumbnails at upload
(zero marginal cost, compatible with bulk signing) behind a per-user quality
setting, following the Housecall Pro pattern. If HEIC turns out to be a
meaningful share rather than a tail, revisit transformations as a fallback for
those rows only.

---

## 4. Changes landed

| Area | Change |
|---|---|
| `lib/attachments/attachment-upload-policy.ts` | Type/extension allowlist, size cap, filename sanitization, shared browser + server validation |
| `lib/attachments/signed-attachment-urls.ts` | Batched signing across all attachment read paths |
| `lib/attachments/abandoned-upload-sweep.ts` | Staged-upload reclamation |
| `app/api/cron/attachment-upload-sweep/route.ts` | Daily sweep, 08:00 UTC |
| `20260817120000_attachment_storage_hardening.sql` | Bucket invariants pinned; `storage_path` indexed |
| `20260817140000_attachment_provenance_and_staging.sql` | `created_by_user_id`, `finalized_at`, entity/staging indexes, sweep function |
| `lib/actions/attachment-actions.ts` | Policy enforcement, post-upload reconciliation, staging + finalize stamp, provenance |
| `JobAttachmentsInternal.tsx` | Distinct preview-failure state |
| 9 read paths | `finalized_at` filter |

Verification: `tsc --noEmit` clean, `eslint` clean on all touched files,
full suite **6337 tests across 659 files, all passing**.

---

## 5. Open items

**Deferred deliberately — `account_owner_user_id` on `attachments`.** It would
let the RLS policies stop joining `jobs` per row. But `attachments` is
polymorphic (`entity_type` spans job, permit request, business profile), so the
column would need a different derivation per type and a trigger to stay
consistent. Adding a denormalized column that can silently drift from the job's
real account would be adding sand, not removing it. Worth doing with a
maintaining trigger and a verified backfill — not as a drive-by.

**Open — pagination.** `/jobs/[id]/attachments` caps at 500 rows with no paging.
Not a correctness bug, but it is a cliff rather than a limit. Housecall Pro's
25-per-page default is a reasonable target.

**Open — thumbnails and per-user quality setting.** Gated on §3.4.

**Roadmap — customer-level media gallery.** Attachments are per-job only.
Jobber's client-level rollup with source and file-type filters is genuinely
useful for "show me every photo taken at this address".

**Roadmap — photo annotation.** Housecall Pro ships it. Letting a technician
circle a gauge reading or a model number is high-value evidence and fits
naturally beside the existing evidence-context tagging.
