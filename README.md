# React Hono Template — a multi-tenant SaaS starter on Cloudflare

A production-shaped template for building a real SaaS on the Cloudflare platform, demonstrated by **a working mini-Linear issue tracker**: organizations, projects, issues with a kanban board, comments, attachments, an activity log, a public API with keys and webhooks, and Stripe subscriptions with plan quotas — all bilingual (English/中文) and dark-mode ready.

Use it as the starting point for your own multi-tenant product: the issue tracker is the demo, the architecture is the deliverable.

## What's inside

**Application features**

- Multi-tenant workspaces (better-auth `organization` plugin): owner/admin/member roles, email invitations with shareable links
- Projects with per-project issue numbering (`PROJ-123`), statuses, priorities, labels, assignees, due dates
- Issue list with URL-driven filters + pagination, drag-and-drop kanban board, bulk edits, my-issues view
- Markdown descriptions and comments, R2-backed attachments with presigned direct upload, field-level activity timeline + org activity feed
- Public API (`/api/v1`) with `sk_` API keys, per-plan rate limiting, auto-generated OpenAPI docs (Scalar), and outbound webhooks (HMAC-SHA256 signed, delivery log, retries, ping/redeliver)
- Stripe subscriptions with Free/Pro quota enforcement (members, projects, webhooks, attachment size, API rate) and a mock mode that runs the whole upgrade/downgrade flow without Stripe
- Platform admin area: user management, org overview with freeze/unfreeze, global stats

**Template capabilities**

| Layer | Choice |
|---|---|
| Runtime | Hono on Cloudflare Workers (`apps/api`), React 19 SPA served as Workers static assets (`apps/web`) |
| Database | Cloudflare D1 via drizzle-orm (classic `controller → service → dao → db` layering) |
| Auth | better-auth (email/password + admin + organization plugins, RBAC at platform and org level) |
| Data fetching | TanStack Query + typed `hc<AppType>` client — API responses type-check end to end |
| Routing | TanStack Router (file-based, `beforeLoad` guards, URL-as-state filters validated with zod) |
| Validation | zod schemas shared between API and web forms (`packages/shared`) |
| Storage | S3-compatible presigned uploads (R2 by default, MinIO/OSS work too) |
| Rate limiting | Workers Rate Limiting binding (per plan tier) |
| UI | Tailwind v4 + shadcn/ui (Base UI), i18next (en/zh with typed keys), class-based theming |
| Tooling | Bun, Turborepo, Biome, drizzle-kit migrations, GitHub Actions deploy |

## Quickstart

```sh
bun install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # minimum: BETTER_AUTH_SECRET
(cd apps/api && bun run db:migrate:local)           # local miniflare D1 (script lives in apps/api)
bun run dev                                         # api :8787 + web :5173
```

Open http://localhost:5173 — the first registered user becomes the platform admin. With no further config the app runs fully locally: attachments return 503 and billing runs in mock mode.

## Validation

```sh
bun run test       # focused API and web regression tests
bun run lint
bun run typecheck
bun run build
```

## Environment variables

All optional except `BETTER_AUTH_SECRET`. Local: `apps/api/.dev.vars`; production: `bunx wrangler secret put <NAME>`.

| Variable | Purpose |
|---|---|
| `BETTER_AUTH_SECRET` | Auth secret (required) |
| `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` / `S3_PUBLIC_BASE_URL` | R2 (or any S3-compatible storage) for issue attachments — see [apps/api/README.md](apps/api/README.md) incl. bucket CORS |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | Real Stripe billing (all three or none; partial config returns 503) |
| `BILLING_MOCK_MODE` | `true` enables simulated upgrades when Stripe is absent (intended for local/dev only) |

## Layout

```
apps/api          Hono API — src/routes (resource routers), src/dependencies.ts, src/{controllers,services,dao,dto,middleware,lib}, src/v1 (public API), drizzle/ migrations
apps/web          React SPA — src/routes (file-based), src/pages, src/features/<domain>/{data.ts,components/}, src/lib (infrastructure), src/i18n
packages/shared   zod schemas, plan limits, error codes, ApiResult envelope — imported by both apps
packages/ui       shadcn/ui components (add via `bunx shadcn@latest add <name> -c apps/web`)
```

Conventions, workflows and per-app notes live in [AGENTS.md](AGENTS.md), [apps/api/README.md](apps/api/README.md) and [apps/web/README.md](apps/web/README.md).

Every frontend domain exposes its data layer through `features/<domain>/data.ts`: query keys/factories, requests, mutation hooks and cache policies live together. Pages and components consume that entry point and own forms, dialogs, navigation and translated feedback. This convention applies to all domains, without a separate location for simpler features.

## Production notes — honest simplifications

These are deliberate template-level simplifications. Each works correctly for demos and moderate traffic; the upgrade path on Cloudflare is noted.

- **Webhook delivery** runs via `waitUntil` after the response (2 attempts, 5s timeout, 500ms backoff ≈ worst case 11s). An isolate recycle mid-delivery leaves the row `pending` (manual redeliver is the recovery). *Upgrade path: Cloudflare Queues producer/consumer with delayed retries, plus a Cron Trigger to sweep stuck deliveries.*
- **Rate limiting** uses two Workers Rate Limiting bindings (60/min free, 600/min pro, keyed by API-key hash). Counters consolidate per Cloudflare location, not globally — suitable for plan entitlements and abuse mitigation, not exact metering. Keep `wrangler.jsonc` limits in sync with `PLANS` in `packages/shared` (the binding API cannot be introspected at runtime). *Upgrade path: Durable Objects for exact global limits.*
- **No Cron cleanup** yet: expired invitations, soft-deleted issues and old webhook delivery rows are retained. *Upgrade path: a scheduled handler on the same Worker.*
- **API-key mutations** via `/api/v1` don't write activity-log rows (no acting user); webhook events still fire.
- **Webhook signatures** are HMAC over the payload with no timestamp (no replay protection) and secrets are stored plaintext with no rotation endpoint.
- **Plan changes** propagate across isolates within ~60s (per-isolate cache), so a downgrade may briefly allow the old limits.
- **Activity feeds** are capped at the latest 100 entries per issue/org.

## Deploying

Push to `main` deploys both Workers via GitHub Actions (needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` secrets; web is built with `VITE_API_URL` pointing at the API Worker). Manual: `bun run deploy` inside each app. First production setup:

1. `wrangler d1 create` + update `database_id` in `apps/api/wrangler.jsonc`, then run `bun run db:migrate:remote` inside `apps/api`
2. Set secrets (`BETTER_AUTH_SECRET`, optionally S3/Stripe vars) and add your web origin to `trustedOrigins` in `apps/api/src/index.ts`
3. Stripe: create a subscription price, set the three secrets, add a webhook endpoint `<api-url>/api/stripe/webhook` (events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`)

See [apps/web/README.md](apps/web/README.md) for the web-side notes.
