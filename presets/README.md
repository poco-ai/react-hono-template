# Presets

`presets/features/*.json` and `presets/presets/*.json` are the declarative
source of truth for template features and presets (Phase 0 of the refactor in
`docs/模板化重构方案.md`). `presets/schema.ts` defines the zod contracts;
`apps/api/tests/architecture.test.ts` enforces claims coverage, dependency
boundaries and preset closure; `apps/web/tests/web-registry.test.ts` pins the
web contributions.

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
- Web claims cover more than the feature folder: each feature also claims its
  `apps/web/src/routes/**` files, `apps/web/src/pages/**` pages,
  feature-owned `apps/web/src/components/**` files and its
  `apps/web/src/i18n/locales/{en,zh}/<namespace>.ts` files. Unclaimed web
  files are the core shell and survive every preset. (There is no
  `components/**` catch-all because glob syntax has no exclusions — a broad
  glob would overlap feature claims.)
- Soft dependencies (`softDependsOn`) are compiled through structural ports in
  `apps/api/src/core/lib/ports/` and resolved with `ctx.features.find(...)`
  (undefined ⇒ the integration degrades). Hard dependencies use
  `ctx.features.get(...)` and are guaranteed present by preset closure.
- `presets/features/*.json` also drives the scaffold's regeneration list:
  `apps/api/src/manifest.ts`, `apps/api/src/routes.ts`,
  `apps/web/src/features/registry.ts`, the i18n aggregators,
  `packages/shared/src/index.ts`, the schema aggregators
  (`db/define-schema.ts`, `db/schema*.ts`, `db/auth-schema.ts`) and
  `apps/web/src/features/web-types.ts` route unions are rewritten per preset.

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

The `activities` table follows these claims for consistency: if the activities
feature is trimmed from a preset, core still needs to record audit-style
activity rows, so the table (defined in `apps/api/src/core/schema.ts`, next to
`auditEvents`) and its dao stay with core unless the claims are revisited
first.

## Schema-level dependencies

`dependsOn` drives *module* registration and preset closure, but some slices
also read tables owned by another slice through SQL joins or deferred foreign
keys. Supported presets always keep those slices together; a hand-trimmed
preset must honour these implicit edges:

- `core/schema.ts` (`activities`) has deferred FKs to `projects.id` and
  `issues.id`; a core-only preset would make `db:generate` fail at
  `kit.ref("projects", "id")`.
- `features/labels/dao/label.dao.ts` joins `issues` (issue counts per label);
  `labels` never ships without `issues` (`issues` hard-depends on `labels`).
- `features/cycles/dao/cycle.dao.ts` joins `issue_statuses`; `cycles` declares
  `statuses` in `dependsOn` for that reason.
- The MCP OAuth tables are registered through `db/auth-schema.ts` and the
  better-auth factory in `core/lib/auth.ts`. `core/lib/auth.ts` imports the
  plugin from `@better-auth/mcp` and gates it on `mcp.enabled`, so trimming
  `mcp` only needs the generated `db/auth-schema.ts` exports rewritten (the
  scaffold does this; no source patch).
