# React Hono Template — a multi-tenant SaaS starter on Cloudflare

A production-shaped template for building a real SaaS on the Cloudflare platform, demonstrated by **a working mini-Linear issue tracker**: organizations, projects, issues with a kanban board, comments, attachments, an activity log, a public API with keys and webhooks, and Stripe subscriptions with plan quotas — all bilingual (English/中文) and dark-mode ready.

Use it as the starting point for your own multi-tenant product: the issue tracker is the demo, the architecture is the deliverable.

## What's inside

**Application features**

- Multi-tenant workspaces (better-auth `organization` plugin): owner/admin/member roles, email invitations with shareable links
- Self-service accounts: public landing page at `/`, register/login with email and password, optional Google and GitHub sign-in (a provider's button appears only when both its client id and secret are set), `/forgot-password` + `/reset-password`, and an `/account` page (display name, password change)
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
| Auth | better-auth (email/password, optional Google/GitHub, admin + organization plugins, RBAC at platform and org level) |
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

Open http://localhost:5173 — the first registered user becomes the platform admin. With no further config the app runs fully locally: billing runs in mock mode and attachment endpoints return a storage 503.

### Local attachment storage (optional)

Uploads are presigned against `S3_ENDPOINT` (the browser then PUTs directly to `${S3_ENDPOINT}/${S3_BUCKET}/...`), so a local S3-compatible service is required for attachments — any MinIO instance works:

```sh
docker run -d --name minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

Create a bucket (e.g. `test-bucket`) in the MinIO console at http://localhost:9001 — or from the CLI: `docker run --rm --network host minio/mc sh -c "mc alias set local http://localhost:9000 minioadmin minioadmin && mc mb local/test-bucket"`. Then set in `apps/api/.dev.vars`:

```sh
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET=test-bucket
```

Browser uploads go straight to the bucket, so it must allow CORS `PUT` with `content-type` (MinIO's defaults allow this; R2 needs the CORS config in [apps/api/README.md](apps/api/README.md)). Without an S3-compatible service, uploads fail with a storage error before any bytes are sent.

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
| `BETTER_AUTH_URL` | Public auth base URL. Local OAuth uses `http://localhost:5173` so providers redirect to Vite and the `/api` proxy reaches the Worker (`/api/auth/callback/github`, `/api/auth/callback/google`). Production uses the API origin, so callbacks are `${BETTER_AUTH_URL}/api/auth/callback/github` and `${BETTER_AUTH_URL}/api/auth/callback/google`. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional GitHub OAuth. Both must be non-empty; otherwise the GitHub button is hidden. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional Google OAuth. Both must be non-empty; otherwise the Google button is hidden. |
| `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` / `S3_PUBLIC_BASE_URL` | S3-compatible storage for issue attachments — R2 in production, MinIO locally (see Quickstart); without it, attachment endpoints return 503 and uploads fail with a storage error. See [apps/api/README.md](apps/api/README.md) incl. bucket CORS |
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

- **Webhook delivery** writes the delivery row, then publishes `{ deliveryId }` to the Cloudflare Queue `react-hono-webhooks` (`WEBHOOK_QUEUE`) when that binding exists. The same Worker's consumer makes one HTTP attempt per message (5s timeout, `redirect: manual`, HMAC-SHA256 in `x-webhook-signature`, plus `content-type`, `x-webhook-event`, and `x-webhook-delivery`). A failure calls `message.retry()` while `message.attempts` is below 2; the last attempt leaves the row `failed` and acks the message (`max_retries` is 2). `attempts` starts at 1 and includes the current delivery. With no queue binding — unit tests, or a Worker config that omits it — delivery falls back to in-request `waitUntil` (2 attempts, 5s timeout, 500ms backoff).
- **Rate limiting** uses two Workers Rate Limiting bindings (60/min free, 600/min pro, keyed by API-key hash). Counters consolidate per Cloudflare location, not globally — suitable for plan entitlements and abuse mitigation, not exact metering. Keep `wrangler.jsonc` limits in sync with `PLANS` in `packages/shared` (the binding API cannot be introspected at runtime). *Upgrade path: Durable Objects for exact global limits.*
- **Cron cleanup** runs every 15 minutes (`*/15 * * * *`) on the same Worker. Pending invitations with a non-null `expiresAt` in the past are deleted; invitations with a null `expiresAt` are kept. Webhook deliveries that are still `pending`, have `attempts = 0`, and were created more than 15 minutes ago are marked `failed` with `lastError` `delivery timed out`. Pending rows that already have attempts stay in the queue retry loop and are not touched. Soft-deleted issues and historical webhook delivery rows are still retained.
- **API-key mutations** via `/api/v1` don't write activity-log rows (no acting user); webhook events still fire.
- **Webhook signatures** are HMAC over the payload with no timestamp (no replay protection) and secrets are stored plaintext with no rotation endpoint.
- **Plan changes** invalidate both the in-isolate cache and the `cache:v1:plan:<orgId>` KV entry. Normal changes converge across colos in ~30–60s (KV eventual consistency); the 1h KV TTL is only a write-quota fallback, so a missed invalidation may briefly allow the old limits.
- **Activity feeds** are capped at the latest 100 entries per issue/org.
- **Password reset email** is not sent out of the box: with no email provider configured, better-auth's `sendResetPassword` writes the reset link to the Worker console (`wrangler dev` / `wrangler tail`). This is fine for local dev, but production deployments must wire `sendResetPassword` to a real email provider — otherwise users never receive the link.
- **Runtime config** lives in KV (`config:global`) behind a 60s in-isolate cache: writes refresh the writing isolate immediately, while other isolates converge within ~60s (KV eventual consistency). `GET /api/config` is public — never store secrets there.

## Deploying

Push to `main` deploys both Workers via GitHub Actions (needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` secrets; web is built with `VITE_API_URL` pointing at the API Worker). Manual: `bun run deploy` inside each app. First production setup:

1. `wrangler d1 create` + update `database_id` in `apps/api/wrangler.jsonc`; create the `KV` namespace (`wrangler kv namespace create react-hono-kv --binding KV --update-config`) and run `bun run db:migrate:remote` inside `apps/api`
2. Set secrets (`BETTER_AUTH_SECRET`, optionally `BETTER_AUTH_URL` plus GitHub/Google client ids and secrets, and S3/Stripe vars) and add your web origin to `trustedOrigins` in `apps/api/src/index.ts`. In production `BETTER_AUTH_URL` is the API origin. The API Worker also needs the `react-hono-webhooks` queue (`wrangler queues create react-hono-webhooks`) before the first deploy that includes the queue consumer.
3. Stripe: create a subscription price, set the three secrets, add a webhook endpoint `<api-url>/api/stripe/webhook` (events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`)

See [apps/web/README.md](apps/web/README.md) for the web-side notes.
