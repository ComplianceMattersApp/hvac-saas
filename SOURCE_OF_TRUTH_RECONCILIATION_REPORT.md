# Source of Truth Reconciliation Report

## 1. Scope

Inspected areas:
- Repository tree ownership and git metadata at root and nested paths
- Duplicate tree presence and divergence across key project files
- Schema authority artifacts:
  - root migrations under supabase/migrations
  - root schema snapshots: prod_schema.sql and schema_core.sql
  - nested tree migrations under hvac-saas/supabase/migrations
  - nested schema snapshots: hvac-saas/prod_schema.sql and hvac-saas/schema_core.sql
- Documentation references to service_cases and service_case_id

Boundaries applied:
- No feature implementation
- No lifecycle refactor
- No architecture rewrite
- Proof-only conclusions; unknowns marked NOT VERIFIED

## 2. Tree Inventory

Tree A (root): C:\Users\eddie\hvac-saas
- Evidence: git rev-parse --show-toplevel returned C:\Users\eddie\hvac-saas
- Evidence: Test-Path .git returned True
- Evidence: active terminal cwd is C:\Users\eddie\hvac-saas
- Evidence: root contains full operational folders including app, lib, supabase, docs, components, and .next

Tree B (nested): C:\Users\eddie\hvac-saas\hvac-saas
- Evidence: directory exists and contains app/lib/docs/components/supabase
- Evidence: Test-Path hvac-saas/.git returned False
- Evidence: root git index entry is a gitlink at path hvac-saas:
  - git ls-files --stage -- hvac-saas -> mode 160000, commit 927e96a7...
  - git ls-tree HEAD hvac-saas -> mode 160000 commit 927e96a7...
- Evidence: git submodule status fails with:
  - no submodule mapping found in .gitmodules for path hvac-saas
  - .gitmodules file is absent

Direct divergence proof (root vs nested hashes):
- package.json: different
- tsconfig.json: different
- README.md: different
- prod_schema.sql: different
- middleware.ts: different
- next.config.js: same
- schema_core.sql: same

Size/completeness signal:
- Root file count: 41569
- Nested file count: 172
- Interpretation: nested tree is a much smaller secondary tree relative to root.

## 3. Authoritative Project Tree

Authoritative working tree: C:\Users\eddie\hvac-saas (root)

Proof:
- It is the only confirmed git working tree (.git exists at root, not in nested path).
- git top-level root resolves to root path.
- Root contains the full migration baseline that includes service_cases and jobs.service_case_id.
- Current patch/test workflow context is rooted at C:\Users\eddie\hvac-saas.

Deployment target status: NOT VERIFIED
- No workflow file in .github/workflows was found to prove deployment working-directory behavior.
- No explicit deployment config proving root vs nested selection was found in inspected files.

## 4. Duplicate / Mirror Tree Findings

Duplicate/mirror exists:
- Yes. A nested hvac-saas tree exists under root with duplicate project structure.

State assessment:
- It is divergent from root (multiple key files differ by hash).
- It is structurally dangerous because root git tracks hvac-saas as a gitlink entry (160000) but there is no .gitmodules mapping.
- It appears partial relative to root (file-count disparity and migration-set mismatch).

Risk level: HIGH
- Reason: developers can read/edit the wrong tree, while root git tracking behavior for the nested path is non-standard/orphaned.
- Reason: this can cause audit and schema reconciliation errors and patching confusion.

## 5. Schema Authority Findings

Authoritative migration source:
- Root migrations at supabase/migrations

Proof in authoritative migrations:
- supabase/migrations/20260301_baseline_foundation.sql includes:
  - jobs.service_case_id column
  - service_cases table
  - idx_jobs_service_case_id index
  - service_cases RLS policies

Nested migration comparison:
- hvac-saas/supabase/migrations does not contain 20260301_baseline_foundation.sql.
- Nested migration set is different and does not show service_cases/service_case_id in this reconciliation pass.

Schema snapshots found:
- Root: prod_schema.sql, schema_core.sql
- Nested: hvac-saas/prod_schema.sql, hvac-saas/schema_core.sql

service_cases and jobs.service_case_id in snapshots:
- Root snapshots (prod_schema.sql, schema_core.sql): NOT FOUND in this pass
- Nested snapshots (hvac-saas/prod_schema.sql, hvac-saas/schema_core.sql): NOT FOUND in this pass

prod_schema.sql trust assessment:
- Root prod_schema.sql is NOT trustworthy as full baseline authority for service_case structures in current state.
- Reason: authoritative migration baseline contains service_cases/service_case_id, but snapshot artifact search did not.
- Most likely status: stale or generated from an environment/state not aligned to authoritative migrations.
- Exact generation provenance: NOT VERIFIED (no generation metadata found in inspected files).

## 6. Drift Conclusion

Exact drift found:
1. Schema artifact drift
- Root migration baseline contains service_cases/service_case_id.
- Schema snapshots (root and nested) omit them in this reconciliation pass.

2. Duplicate tree drift
- Nested hvac-saas mirror exists and diverges from root.
- Root git treats nested path as gitlink (160000) without a valid .gitmodules mapping.

Root cause (evidence-based):
- Parallel tree presence plus orphaned gitlink-style tracking creates ambiguity about which files represent operational truth.
- Schema snapshot artifacts are not being kept in lockstep with authoritative migration baseline.

Severity:
- Overall: HIGH
- Schema drift: HIGH
- Duplicate tree drift: HIGH

## 7. Minimal Cleanup Actions

1. Declare authoritative tree explicitly in a short root doc (or existing root README section):
- Authoritative code and migrations are at C:\Users\eddie\hvac-saas.
- Nested C:\Users\eddie\hvac-saas\hvac-saas is non-authoritative.

2. Resolve orphaned gitlink risk with minimal git hygiene:
- Either restore valid submodule mapping in .gitmodules and enforce submodule workflow, or remove gitlink usage for hvac-saas path.
- Choose one path only; do not keep ambiguous gitlink-without-mapping state.

3. Regenerate schema artifact from authoritative source:
- Regenerate root prod_schema.sql from the authoritative DB state built from root migrations.
- Add a one-line header comment in prod_schema.sql with generation date and source context.

4. Add a tiny schema-authority note:
- Migrations are authoritative for baseline structure.
- Snapshot files are convenience artifacts and must be periodically regenerated.

5. Add one guard check in CI or pre-merge script (documentation-only recommendation):
- Fail if service_cases or jobs.service_case_id are missing from prod_schema.sql when present in authoritative migrations.

## 8. Recommended Immediate Next Step

Single best next action:
- Regenerate root prod_schema.sql from the authoritative root migration-applied database, then commit it with a short provenance note (date + source), because this directly resolves the highest-confidence schema drift with minimal risk.
