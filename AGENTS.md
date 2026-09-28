# AGENTS.md

Bun + Turborepo monorepo: Vite/React SPA (`apps/web`) and Hono API (`apps/api`), both deployed to Cloudflare Workers. No tests exist in this repo.

## Commands

Package manager is **bun** (`packageManager: bun@1.4.2`, `bun.lock`). Do not use npm/pnpm/yarn (the root README's `pnpm dlx` example predates the switch to bun).

- `bun install`
- `bun run dev` — turbo dev: runs web (Vite on :5173) and api (`wrangler dev` on :8787) together. Web proxies `/api` → :8787, so both must be running for local API calls.
- `bun run lint` — `biome lint .` (Biome, not ESLint)
- `bun run format` — `biome format --write .`
- `bun run typecheck` — turbo typecheck across all packages (web uses `tsc -b` project references; others `tsc --noEmit`)
- `bun run build` — turbo build

Single workspace: run the script from inside the app/package dir, or `bunx turbo dev --filter=api`.

Pre-commit (husky + lint-staged) runs `biome check --write` on staged files.

## Layout

- `apps/api` — Hono on Cloudflare Workers. Entry `src/index.ts` (default export). D1 binding `DB` via drizzle-orm; better-auth mounted at `/api/auth/*`. Classic layered structure (controller → service → dao → db), see "API (apps/api)".
- `apps/web` — React 19 + Vite SPA (Tailwind v4), deployed as static Workers assets with SPA fallback — its `wrangler.jsonc` has no `main`/Worker script.
- `packages/shared` — shared TS types (`ApiResult`, error codes). No build step.
- `packages/ui` — shadcn/ui components (Base UI, style "base-nova"). No build step.

`@workspace/shared` and `@workspace/ui` package exports point directly at TS source — edits take effect immediately, no build needed.

`apps/web` imports API route types via the `@api/*` tsconfig path alias (`AppType` from `apps/api/src/routes.ts`, used by `hono/client` in `apps/web/src/lib/api.ts`). Type-level only; runtime calls go through `VITE_API_URL` or the `/api` proxy.

## API (apps/api)

- Env files (both gitignored):
  - `.dev.vars` — local Worker secrets (`BETTER_AUTH_SECRET`, ...), loaded by `wrangler dev`
  - `.env` — drizzle-kit remote D1 credentials (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN`), only needed for `db:migrate:remote` / `db:push`
  - Prod secrets: `bunx wrangler secret put <NAME>` (never put them in `wrangler.jsonc`)
- `worker-configuration.d.ts` is generated. After editing `wrangler.jsonc` (e.g. new bindings), run `bun run cf-typegen`; never edit it by hand.
- Drizzle schema: `src/db/schema.ts` + `src/db/auth-schema.ts`. Workflow: `bun run db:generate` → `bun run db:migrate:local` (local miniflare D1). `db:migrate:remote` and `db:push` operate on the real remote D1 — do not run casually.
- Layering (strictly one direction: `controller → service → dao → db`; dto is referenced by all layers):
  - `src/controllers/` — HTTP handlers: parse/validate input, call service, wrap with `ok`/`fail` from `src/lib/response.ts`. Keep them thin.
  - `src/services/` — business logic; throw `ApiError` (from `@workspace/shared`) for domain failures, mapped to responses by the `onError` handler in `routes.ts`.
  - `src/dao/` — the only layer allowed to use drizzle/SQL; one file per table, `createXxxDao(db)` factory pattern.
  - `src/dto/` — request/response types (`XxxDto`, derived from `$inferSelect`).
  - `src/lib/` — framework helpers (response envelope, better-auth factory); `src/middleware/` for shared Hono middleware when needed.
  - `src/routes.ts` — route table only: wires dao → service → controller and binds paths. Must keep exporting `AppType` (web's `@api/routes` alias depends on it).
  - To add a resource: new table in `src/db/schema.ts` (`db:generate` + `db:migrate:local`), then `dto/user.dto.ts`-style file, dao, service, controller, and bind in `routes.ts`.
- CORS trusted origins are hardcoded in `src/index.ts` (`trustedOrigins`). Add any new frontend origin there.
- drizzle-orm/drizzle-kit are 1.0 RC; `skipLibCheck` in tsconfig is required for their types — don't remove it.

## Web (apps/web)

- API base URL is `import.meta.env.VITE_API_URL`, baked in at build time (CI sets it to the prod API URL). Unset in dev, so `hc<AppType>("")` relies on the Vite `/api` proxy.
- Add shadcn components from repo root: `bunx shadcn@latest add <name> -c apps/web` — files land in `packages/ui/src/components` (per `apps/web/components.json` aliases). Import as `@workspace/ui/components/<name>`.
- `@/*` maps to `apps/web/src/*`.
- **i18n (react-i18next): never hardcode user-facing strings.** All UI text must be referenced via `useTranslation()` → `t("key")`. Translations live in `apps/web/src/i18n/locales/{en,zh}.ts`; `en.ts` is the source of truth (typed via `CustomTypeOptions` in `src/i18n/index.ts`), and `zh.ts` is typed as `typeof en` so keys can't drift. To change language programmatically use `changeLanguage()` from `@/i18n` (persists to localStorage + updates `<html lang>`). Exception: brand names (e.g. "React Hono Template") and enum values echoed from the API (e.g. `admin`/`user` role codes).
- **Theming:** custom ThemeProvider in `src/components/theme-provider.tsx` (class-based dark mode, `dark/light/system`, localStorage key `theme`). Use `useTheme()` for programmatic changes; the `<html>` class is pre-applied by an inline script in `index.html` to avoid FOUC — keep that script in sync with the provider's storage key if it changes. Tailwind dark variant is `@custom-variant dark (&:is(.dark *))` in `packages/ui/src/styles/globals.css`.

## Style

- Biome enforces: tabs, double quotes, organized imports. Run `bun run format` before committing; the pre-commit hook auto-fixes staged files.
- Do not add ESLint/Prettier configs.

## Deploy

Push to `main` auto-deploys via GitHub Actions (needs repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`):

- `deploy-api.yml` — triggers on `apps/api/**` or `bun.lock`; deploys source directly (wrangler bundles Hono, no build step).
- `deploy-web.yml` — triggers on `apps/web/**`, `packages/ui/**`, or `bun.lock`; builds with `VITE_API_URL=https://react-hono-api.chenqiyuan1012.workers.dev`, then deploys.

Manual: `bun run deploy` inside the app dir. Prod URLs (`react-hono-api.chenqiyuan1012.workers.dev`, `react-hono-web.chenqiyuan1012.workers.dev`) appear in `trustedOrigins`, the web workflow's `VITE_API_URL`, and app READMEs — update all of them together if a Worker is renamed.
