# Presets

`presets/features/*.json` and `presets/presets/*.json` are the declarative
source of truth for template features and presets (Phase 0 of the refactor in
`docs/模板化重构方案.md`). `presets/schema.ts` defines the zod contracts;
`apps/api/tests/architecture.test.ts` (api) and
`apps/web/tests/architecture.test.ts` (web) enforce them.

## Claims ownership conventions

- Every business source file under the scanned roots
  (`apps/api/src`, `apps/web/src/features`, `packages/shared/src`) is claimed
  by **exactly one** feature. Composition roots (`apps/api/src/app.ts`,
  `dependencies.ts`, `routes.ts`, `index.ts`, `queue.ts`, `scheduled.ts`,
  `serve.ts`, `server.ts`, `env.d.ts`) and `apps/api/src/db/**` (Phase 3)
  are exempt.
- Since Phase 2a the api source tree is physically sliced along feature
  boundaries, so claims are **directory-level globs**:
  - `apps/api/src/features/<id>/**` — everything the feature owns
    (`services/`, `dao/`, `routes/`, `controllers/`, `dto/`, `lib/`,
    `middleware/` as applicable).
  - `apps/api/src/core/**` — the platform base (auth, org middleware,
    platform bindings, admin/audit/config/bootstrap/oauth surfaces,
    `lib/ports/*` dependency-inversion contracts).
- Feature-facing type imports from the web use `@api/features/<id>/dto/...`
  (or `@api/core/dto/...`); `@api/routes` stays at the api source root
  because it is the composition root that mounts every feature router.
- Claim globs must match at least one existing file — the architecture test
  fails on stale claims, so a move or deletion must update the manifest in
  the same change.

## Special ownerships (files that live in `core/` but serve a feature)

Three files are claimed by `core` even though they primarily serve a feature.
They are workspace infrastructure, not feature logic:

- `apps/api/src/core/dao/activity.dao.ts` and
  `apps/api/src/core/dto/activity.dto.ts` — the activity feed is written by
  every feature's write path (issues, comments, labels, …) through the
  activity port. The write path is core infrastructure; only the read-side
  (`features/activities/`) is a feature.
- `apps/api/src/core/dao/search-sql.ts` — shared SQL helpers for FTS5
  search serialization used by both core dao helpers and the search feature;
  it compiles against the shared schema, not against feature dtos.
- `apps/api/src/core/dao/progress-sql.ts` — shared SQL helpers for
  cycle/roadmap progress aggregation, referenced by both the cycles and
  roadmap features; same rationale as search-sql.

When Phase 3 splits `db/schema` per feature, the `activities` table follows
these claims for consistency: if the activities feature is trimmed from a
preset, core still needs to record audit-style activity rows, so the table
and its dao stay with core unless the claims are revisited first.
