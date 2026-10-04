# AGENTS.md

Bun + Turborepo monorepo: Vite/React SPA (`apps/web`) and Hono API (`apps/api`), both deployed to Cloudflare Workers. The app is a multi-tenant issue tracker (mini Linear) used as the SaaS template showcase — see README.md for the feature/production notes. Focused regression tests live in `apps/api/tests` and `apps/web/tests` and run with Bun (using `node:test`).

## Commands

Package manager is **bun** (`packageManager: bun@1.4.2`, `bun.lock`). Do not use npm/pnpm/yarn.

- `bun install`
- `bun run dev` — turbo dev: runs web (Vite on :5173) and api (`wrangler dev` on :8787) together. Web proxies `/api` → :8787, so both must be running for local API calls.
- `bun run test` — API auth/quotas/routing and web feature-data/cache/URL/architecture regression tests; web tests preload a minimal language-detection environment
- `bun run lint` — `biome lint .` (Biome, not ESLint)
- `bun run format` — `biome format --write .`
- `bun run typecheck` — turbo typecheck across all packages (web uses `tsc -b` project references; others `tsc --noEmit`)
- `bun run build` — turbo build (builds `web` only; api deploys from source, wrangler bundles it)

Single workspace: run the script from inside the app/package dir, or `bunx turbo dev --filter=api`.

Pre-commit (husky + lint-staged) runs `biome check --write` on staged files.

## Layout

- `apps/api` — Hono on Cloudflare Workers. Entry `src/index.ts` (default export). D1 binding `DB` via drizzle-orm; better-auth mounted at `/api/auth/*`; public API sub-app in `src/v1/` mounted at `/api/v1`; Stripe webhook at `/api/stripe/webhook`. Classic layered structure (controller → service → dao → db), see "API (apps/api)".
- `apps/web` — React 19 + Vite SPA (Tailwind v4), deployed as static Workers assets with SPA fallback — its `wrangler.jsonc` has no `main`/Worker script.
- `packages/shared` — zod request schemas (used by both API validation and web forms), plan limits (`PLANS`), issue/webhook constants, error codes, `ApiResult` envelope. No build step.
- `packages/ui` — shadcn/ui components (Base UI, style "base-nova"), plus a `ColorSwatchPicker` (fixed swatch palette with radio-group semantics) used for project and label colors. No build step.

`@workspace/shared` and `@workspace/ui` package exports point directly at TS source — edits take effect immediately, no build needed.

`apps/web` imports API route types via the `@api/*` tsconfig path alias (`AppType` from `apps/api/src/routes.ts`, used by `hono/client` in `apps/web/src/lib/api.ts`). Type-level only; runtime calls go through `VITE_API_URL` or the `/api` proxy.

## API (apps/api)

- Env files (both gitignored):
  - `.dev.vars` — local Worker secrets (`BETTER_AUTH_SECRET`, optional `S3_*` / `STRIPE_*` / `BILLING_MOCK_MODE`); copy from `.dev.vars.example`. Attachment uploads need a local S3-compatible service (the presign points at `S3_ENDPOINT`, e.g. `http://localhost:9000/test-bucket`): run MinIO (`docker run -p 9000:9000 -p 9001:9001 -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin minio/minio server /data`), create a bucket, then set `S3_ENDPOINT`/`S3_REGION=us-east-1`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_BUCKET`; without it uploads fail with a storage 503. See README.md Quickstart.
  - `.env` — drizzle-kit remote D1 credentials (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN`), only needed for `db:migrate:remote` / `db:push`
  - Prod secrets: `bunx wrangler secret put <NAME>` (never put them in `wrangler.jsonc`)
- `worker-configuration.d.ts` is generated. After editing `wrangler.jsonc` (e.g. new bindings), run `bun run cf-typegen`; never edit it by hand. Optional env vars are declared in `src/env.d.ts`.
- Drizzle schema: `src/db/schema.ts` + `src/db/auth-schema.ts` (better-auth tables incl. organization/member/invitation). Workflow: `bun run db:generate` → `bun run db:migrate:local` (local miniflare D1). `db:migrate:remote` and `db:push` operate on the real remote D1 — do not run casually.
- Layering (strictly one direction: `controller → service → dao → db`; dto is referenced by all layers):
  - `src/controllers/` — HTTP handlers: receive validated input (zod via `src/lib/validation.ts`, wired in resource routers), call service, wrap with `ok`/`fail` from `src/lib/response.ts`. Keep them thin.
  - `src/services/` — business logic; throw `ApiError` (from `@workspace/shared`) for domain failures, mapped to responses by the `onError` handler in `routes.ts`. Services take a `background` callback (from `src/lib/background.ts`, wired in controllers via `c.executionCtx`) for webhook dispatch — never import hono types here.
  - `src/dao/` — the only layer allowed to use drizzle/SQL; one file per table, `createXxxDao(db)` factory pattern. Use `db.batch` for multi-write atomicity (D1 batches are transactions).
  - `src/dto/` — request/response types (`XxxDto`, derived from `$inferSelect`).
  - `src/lib/` — framework helpers (response envelope, validation, better-auth factory, stripe context, storage client); `src/middleware/` — `requireAuth`/`requirePermission` (platform), `requireOrgMember`/`requireOrgRole` (org scoping + freeze check).
  - `src/dependencies.ts` — creates the shared DAO/service graph once; reused by auth, internal API, public API and Stripe webhook.
  - `src/routes.ts` — composes resource routers from `src/routes/` and applies session/org middleware before mounting them. Resource routers receive only their own services and create controllers. Must keep exporting `AppType` (web's `@api/routes` alias depends on it).
  - To add a resource: new table in `src/db/schema.ts` (`db:generate` + `db:migrate:local`), then dto, dao, service (with plan-limit checks via `src/services/plan.service.ts` and webhook `dispatch` calls where relevant), controller, resource router in `src/routes/`, and mount in `routes.ts`; add zod schemas in `packages/shared/src/schemas/`.
- Org scoping: all business routes live under `/api/orgs/:orgId/*` behind `requireAuth` + `requireOrgMember` (404 for non-members, 403 `ORG_FROZEN` for writes when frozen — reads and `/billing` stay open); org-role writes use `requireOrgRole("owner","admin")`.
- Public API: `src/v1/` is a separate `OpenAPIHono` app (bearer API keys, `src/middleware/api-key.ts`) mounted in `src/index.ts` — deliberately outside the `AppType` chain. It reuses the same dao/service layers. Rate limiting uses the `RATE_LIMITER_FREE`/`RATE_LIMITER_PRO` bindings in `wrangler.jsonc` — keep their limits in sync with `PLANS` in `packages/shared`.
- Billing: `src/services/billing.service.ts` + `src/lib/stripe.ts`. Without any `STRIPE_*` vars it's mock mode **only if `BILLING_MOCK_MODE=true`** (local default via `.dev.vars`); partial Stripe config fails closed with 503. Plan quotas (members incl. pending invitations, orgs per user) live in `src/services/auth-policy.service.ts`; better-auth hooks in `src/lib/auth.ts` invoke this service and translate domain errors to auth responses.
- Password reset: better-auth's `sendResetPassword` (`sendResetPasswordToConsole` in `src/lib/auth.ts`) has no email provider, so it writes the reset link to the Worker console (`wrangler dev` output / `wrangler tail`). Fine for dev; production must send `url` to `user.email` there instead.
- CORS trusted origins are hardcoded in `src/index.ts` (`trustedOrigins`). Add any new frontend origin there.
- drizzle-orm/drizzle-kit are 1.0 RC; `skipLibCheck` in tsconfig is required for their types — don't remove it.
- D1 batch caveat: `db.batch()` returns rows keyed by column NAME (D1 has no array mode), so duplicate SQL column names across joined tables collapse and shift every value (drizzle-orm#6038). Single queries map correctly. Any select that joins another table must alias the joined columns to unique names with `.as()` (see `COMMENT_SELECT` in `src/dao/comment.dao.ts`) — including before moving an existing joined select into a batch.

## Web (apps/web)

- API base URL is `import.meta.env.VITE_API_URL`, baked in at build time (CI sets it to the prod API URL). Unset in dev, so `hc<AppType>("")` relies on the Vite `/api` proxy. `lib/api.ts` exports `unwrap` (throws Errors carrying the API `code`, e.g. for `isPlanLimitError`).
- Routing: TanStack Router, file-based (`src/routes/`, `routeTree.gen.ts` is generated by vite build — commit it, never hand-edit, and excluded from biome). Guards live in route `beforeLoad` (`_auth` session guard, org layout membership check, admin/owner role checks); list/filter state belongs in URL search params validated with zod. `useSearch` takes the route id (`/_auth/...`), `useNavigate` the URL path. `/` is public (`routes/index.tsx`): `beforeLoad` loads the session and the route renders the marketing landing page (`pages/landing.tsx`) for signed-out visitors, or `HomePage` (which redirects to the first org / `/onboarding`) when signed in. Auth pages outside `_auth`: `/login`, `/register`, `/forgot-password`, `/reset-password`; the account page is `/account` behind `_auth`.
- **Feature data convention (all domains):** `src/features/<feature>/data.ts` is the single data-layer entry point. Keep domain types/constants, canonical query keys, query/infinite-query factories, requests, mutation hooks and cache policies together there. This applies to simple and complex domains alike; do not recreate `lib/queries/` or scatter business `useMutation`/request/cache logic in UI files. Do not create empty companion `api.ts`/`queries.ts`/`mutations.ts`/`cache.ts` files just to match a template. If a module eventually needs internal splitting, keep `data.ts` as the stable consumer entry point.
  - Domains: `auth`, `organizations`, `members`, `projects`, `issues`, `comments`, `attachments`, `activities`, `labels`, `api-keys`, `webhooks`, `billing`, `admin`. Session/bootstrap factories and auth writes belong to `features/auth/data.ts`; the SDK/client setup stays in `lib/auth-client.ts`/`lib/api.ts`.
  - Pages/routes/components consume query factories and mutation hooks from the owning `data.ts`. UI owns form parsing, local state, enable/open conditions, navigation, dialogs and translated toast/error presentation. Pass validated values as mutation variables, rather than reading form state inside requests. Optional mutation callbacks are for UI effects; they must not replace the feature's request, optimistic update or cache invalidation policy (`lib/mutation-callbacks.ts` restricts these options).
  - Query keys preserve the `["orgs", orgId, ...]` hierarchy and existing filter/pagination dimensions. Export key factories from the owning data module; invalidate resource prefixes to cover all pages/filters. Global organization-list invalidation may use `exact: true` when a write should refresh the list without invalidating other organizations' resource caches.
  - Mutation hooks own request/error-code propagation, optimistic updates/rollback and related-cache invalidation. Issue writes refresh project/list/detail and activity caches; comment/attachment writes refresh their own list and issue/org activity feeds; label changes refresh issue displays; webhook writes refresh delivery pages too. Preserve partial-bulk failure handling, upload AbortSignals, one-time secrets and billing redirect behavior. Run cache policies even when the initiating component unmounts; UI callback delivery follows TanStack Query's hook/per-call semantics.
  - Feature data modules may depend on other feature data modules when required by cache/domain relationships, but keep imports acyclic. They must never import UI components, pages or routes. `lib/` is reserved for shared infrastructure and generic utilities. URL search schemas (e.g. `features/issues/search.ts`) are separate from server-state data.
- Pages under `src/pages/` map to routes; cross-feature components and layouts live in `src/components/`. Business components live in `src/features/<feature>/components/`; a view may compose components/data from several domains (e.g. an issue's comments and attachments). Extract independent dialogs and sections even when only one page uses them. Admin pages under `_auth/admin/*`; Scalar API docs at `_auth/api-docs`.
- Add shadcn components from repo root: `bunx shadcn@latest add <name> -c apps/web` — files land in `packages/ui/src/components` (per `apps/web/components.json` aliases). Import as `@workspace/ui/components/<name>`.
- `@/*` maps to `apps/web/src/*`.
- **i18n (react-i18next): never hardcode user-facing strings.** All UI text must be referenced via `useTranslation()` → `t("key")`. Translations live in `apps/web/src/i18n/locales/{en,zh}.ts`; `en.ts` is the source of truth (typed via `CustomTypeOptions` in `src/i18n/index.ts`), and `zh.ts` is typed as `typeof en` so keys can't drift. To change language programmatically use `changeLanguage()` from `@/i18n` (persists to localStorage + updates `<html lang>`). Exception: brand names (e.g. "React Hono Template") and enum values echoed from the API (e.g. `admin`/`user` role codes).
- **Theming:** custom ThemeProvider in `src/components/theme-provider.tsx` (class-based dark mode, `dark/light/system`, localStorage key `theme`). Use `useTheme()` for programmatic changes; the `<html>` class is pre-applied by an inline script in `index.html` to avoid FOUC — keep that script in sync with the provider's storage key if it changes. Tailwind dark variant is `@custom-variant dark (&:is(.dark *))` in `packages/ui/src/styles/globals.css`.

## Style

- Biome enforces: tabs, double quotes, organized imports. Run `bun run format` before committing; the pre-commit hook auto-fixes staged files.
- Do not add ESLint/Prettier configs.

## Deploy

Push to `main` auto-deploys via GitHub Actions (needs repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`):

- `ci.yml` — runs on every pull request and on pushes to `main`; a single `quality` job (`bun install --frozen-lockfile` → `bun run lint` → `bun run typecheck` → `bun run test`) is the shared quality gate.
- `deploy-api.yml` — triggers on `apps/api/**`, `packages/shared/**`, or `bun.lock`; deploys source directly (wrangler bundles Hono, no build step).
- `deploy-web.yml` — triggers on `apps/web/**`, `packages/ui/**`, `packages/shared/**`, `apps/api/**` (web's `tsc -b` type-checks api source via the `@api/*` alias), or `bun.lock`; builds with `VITE_API_URL=https://react-hono-api.chenqiyuan1012.workers.dev`, then deploys.

Manual: `bun run deploy` inside the app dir. Prod URLs (`react-hono-api.chenqiyuan1012.workers.dev`, `react-hono-web.chenqiyuan1012.workers.dev`) appear in `trustedOrigins`, the web workflow's `VITE_API_URL`, and app READMEs — update all of them together if a Worker is renamed.
