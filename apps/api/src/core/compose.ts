import type { Database } from "../db/types";
import { createActivityDao } from "./dao/activity.dao";
import { createAdminUserDao } from "./dao/admin-user.dao";
import { createAuditDao } from "./dao/audit.dao";
import { createMemberDao } from "./dao/member.dao";
import { createOrganizationDao } from "./dao/organization.dao";
import { createCleanupScheduledJob } from "./jobs/cleanup-job";
import type { Auth } from "./lib/auth";
import type { BackgroundFn } from "./lib/background";
import type { CacheStore } from "./lib/kv/types";
import type { CleanupHandler } from "./lib/ports/cleanup";
import { createPlanSourceHolder, type PlanSource } from "./lib/ports/plan";
import type { QuotaUsageSink } from "./lib/ports/quota";
import type { PlanRateLimiters } from "./lib/rate-limit";
import { createAdminOrgService } from "./services/admin-org.service";
import { createAdminUserService } from "./services/admin-user.service";
import { createAuditService } from "./services/audit.service";
import { createAuthPolicyService } from "./services/auth-policy.service";
import { createBootstrapService } from "./services/bootstrap.service";
import type { CleanupService } from "./services/cleanup.service";
import { createCleanupService } from "./services/cleanup.service";
import { createConfigService } from "./services/config.service";
import { createOrganizationService } from "./services/organization.service";
import {
	createPlanService,
	createStaticPlanSource,
} from "./services/plan.service";

/**
 * Feature module protocol (Phase 2b). Every feature under `src/features/`
 * ships a `module.ts` that contributes its DAOs (phase A) and services,
 * routes and lifecycle hooks (phase B) to the composed graph. The combiner
 * in this file is feature-agnostic: it never imports `features/**`, so a
 * trimmed preset can reuse it with a smaller module list from
 * `src/manifest.ts`.
 *
 * Module order in the manifest mirrors the historical construction order of
 * the former `dependencies.ts`, guaranteeing every service is registered
 * before another feature consumes it. Cross-feature access happens through
 * `ctx.features.get<OtherContribution>(id)` — type-only imports declared in
 * `presets/features/<id>.json`.
 */

export type MountPhase = "public" | "me" | "admin" | "org" | "app";

/**
 * Route contribution. `create` receives the fully composed Dependencies and
 * returns the sub-app; the `(deps: never)` parameter keeps the slot
 * bivariant so modules can type `deps` precisely (see routes.ts for the
 * folding order guarantees).
 */
export type RouteContribution = {
	phase: MountPhase;
	create: (deps: never) => unknown;
};

/** Cron contribution: one independently-guarded scheduled run. */
export type ScheduledJob = {
	name: string;
	run: (now: Date, background?: BackgroundFn) => Promise<void>;
	/** Historical `console.error` prefix emitted when `run` rejects. */
	failureMessage: string;
};

/** Queue contribution (e.g. webhooks → the WEBHOOK_QUEUE consumer). */
export type QueueConsumer<Batch = unknown> = {
	queue: string;
	handle: (batch: Batch) => Promise<void>;
};

/** Hook invoked by better-auth after an organization is created. */
export type OnOrgCreatedHook = (orgId: string) => Promise<void>;

/** What a feature's `register` can contribute to the composed graph. */
export type FeatureContribution = {
	/** Services merged into `dependencies.services` (unique keys). */
	services?: Record<string, unknown>;
	/** Route sub-apps; `phase` decides where the folder mounts them. */
	routes?: readonly RouteContribution[];
	/** Cleanup handlers folded into the core cleanup cron. */
	cleanupHandlers?: CleanupHandler[];
	/** Independently-guarded cron jobs. */
	scheduledJobs?: ScheduledJob[];
	/** Queue consumers dispatched by the worker entry. */
	queueConsumers?: QueueConsumer[];
	/** Post-organization-creation hooks (statuses seeds defaults). */
	onOrgCreated?: OnOrgCreatedHook[];
	/** Write paths exempt from the frozen-organization guard. */
	freezeWriteExempt?: string[];
	/**
	 * Usage sinks appended to the live array `quota.service` holds: billing
	 * constructs the quota service before ai registers its sink, so the
	 * array is shared by reference and filled during phase B.
	 */
	quotaUsageSinks?: QuotaUsageSink[];
	/**
	 * Top-level Dependency slots owned by features (ai's provider/capability
	 * handle, mcp's config/endpoint factory, public-api's app factory).
	 */
	extras?: Record<string, unknown>;
};

/** Platform inputs the combiner passes through to feature contexts. */
export type ComposePlatform = {
	db: Database;
	cache: CacheStore;
	billingMockEnabled: boolean;
	appWebUrl?: string;
	resolvePublicApiUrl?: (requestUrl: string) => string;
	allowFirstUserAdmin?: boolean;
	apiRateLimiters?: PlanRateLimiters;
	// Feature-owned platform inputs travel opaquely; `dependencies.ts`
	// narrows them with the concrete feature types.
	storage?: unknown;
	stripeSetup?: unknown;
	webhookQueue?: unknown;
	aiConfig?: unknown;
	aiRateLimiters?: unknown;
	mcpEnv?: unknown;
};

/** DAOs core itself owns; available to every feature via `ctx.daos`. */
export type CoreDaos = {
	memberDao: ReturnType<typeof createMemberDao>;
	organizationDao: ReturnType<typeof createOrganizationDao>;
	adminUserDao: ReturnType<typeof createAdminUserDao>;
	auditDao: ReturnType<typeof createAuditDao>;
	activityDao: ReturnType<typeof createActivityDao>;
};

/**
 * Core services visible while features register. `cleanupService` is
 * deliberately absent: it is built after phase B so it can fold the
 * contributed cleanup handlers.
 */
export type CoreContextServices = {
	adminUserService: ReturnType<typeof createAdminUserService>;
	adminOrgService: ReturnType<typeof createAdminOrgService>;
	organizationService: ReturnType<typeof createOrganizationService>;
	planService: ReturnType<typeof createPlanService>;
	auditService: ReturnType<typeof createAuditService>;
	bootstrapService: ReturnType<typeof createBootstrapService>;
	configService: ReturnType<typeof createConfigService>;
	authPolicyService: ReturnType<typeof createAuthPolicyService>;
};

export type CoreServices = CoreContextServices & {
	cleanupService: CleanupService;
};

export type FeatureLookup = {
	/** Typed accessor for another feature's registration (daos + services). */
	get<T>(id: string): T;
};

export type FeatureContextBase = Omit<
	ComposePlatform,
	"appWebUrl" | "resolvePublicApiUrl"
> & {
	/** Defaults applied by the combiner (`localhost:5173`, request origin). */
	appWebUrl: string;
	resolvePublicApiUrl: (requestUrl: string) => string;
	core: CoreContextServices;
	daos: CoreDaos;
	features: FeatureLookup;
	/**
	 * Billing swaps the plan source (default: static free plan) for the
	 * DB-backed subscription lookup during its registration.
	 */
	setPlanSource: (source: PlanSource) => void;
	/**
	 * Live sink array shared with `quota.service` by reference: features
	 * append their sinks during phase B and the quota service observes them
	 * at settle time.
	 */
	quotaUsageSinks: QuotaUsageSink[];
};

/**
 * A feature module. Method syntax keeps `register`'s context parameter
 * bivariant, so modules declaring a richer context (`FullFeatureContext`)
 * still satisfy the base contract used by `composeModules`.
 */
export type FeatureModule<
	OwnDaos extends object = object,
	Ctx extends FeatureContextBase = FeatureContextBase,
> = {
	id: string;
	/** Phase A: stateless DAO factories for this feature. */
	createDaos?(ctx: { db: Database }): OwnDaos;
	/** Phase B: services, routes and lifecycle contributions. */
	register?(ctx: Ctx & { daos: CoreDaos & OwnDaos }): FeatureContribution;
};

type UnionToIntersection<U> = (
	U extends unknown
		? (k: U) => void
		: never
) extends (k: infer I) => void
	? I
	: never;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

// Distributive extraction helpers: the checked type must flow through a
// naked type parameter, otherwise a union of contributions is tested as a
// whole and one service-less module (e.g. capabilities) collapses the
// result to `never`.
type RegisterOf<M> = M extends { register(ctx: never): infer R } ? R : never;
type DaosOfModule<M> = M extends { createDaos(ctx: never): infer D }
	? D
	: never;
type ServicesOfContribution<C> = C extends { services: infer S } ? S : never;
type ExtrasOfContribution<C> = C extends { extras: infer E } ? E : never;
type RouteAppsOfContribution<C> = C extends {
	routes: infer Routes extends readonly RouteContribution[];
}
	? Routes extends readonly { create(deps: never): infer App }[]
		? App
		: never
	: never;

type ServicesOf<Modules extends readonly FeatureModule[]> = UnionToIntersection<
	ServicesOfContribution<RegisterOf<Modules[number]>>
>;

type DaosOf<Modules extends readonly FeatureModule[]> = UnionToIntersection<
	DaosOfModule<Modules[number]>
>;

type ExtrasOf<Modules extends readonly FeatureModule[]> = UnionToIntersection<
	ExtrasOfContribution<RegisterOf<Modules[number]>>
>;

/** Union of the sub-app types this manifest's route contributions create. */
export type RouteAppsOf<Modules extends readonly FeatureModule[]> =
	RouteAppsOfContribution<RegisterOf<Modules[number]>>;

/** Fallback MCP config when the mcp feature is not in the manifest. */
export type DisabledMcpConfig = { enabled: false };

type AiSlotOf<Modules extends readonly FeatureModule[]> =
	ExtrasOf<Modules> extends { ai: infer A } ? A : undefined;

type McpConfigOf<Modules extends readonly FeatureModule[]> =
	ExtrasOf<Modules> extends { mcp: { config: infer C } }
		? C
		: DisabledMcpConfig;

type V1AppOf<Modules extends readonly FeatureModule[]> =
	ExtrasOf<Modules> extends {
		publicApi: { createApp: (deps: never) => infer R };
	}
		? R
		: null;

type McpEndpointOf<Modules extends readonly FeatureModule[]> =
	ExtrasOf<Modules> extends {
		mcp: { createEndpoint: (deps: never, auth: never) => infer R };
	}
		? (auth: Auth) => R
		: null;

export type ComposedResult<Modules extends readonly FeatureModule[]> = {
	/** The full service graph; re-exported as `Dependencies` for consumers. */
	dependencies: {
		apiRateLimiters: PlanRateLimiters | undefined;
		daos: Simplify<CoreDaos & DaosOf<Modules>>;
		ai: AiSlotOf<Modules>;
		services: Simplify<
			CoreContextServices &
				ServicesOf<Modules> & { cleanupService: CleanupService }
		>;
	};
	/** Folded by `routes.ts` in phase order with the auth middleware gates. */
	routeContributions: RouteContribution[];
	scheduledJobs: ScheduledJob[];
	queueConsumers: QueueConsumer[];
	onOrgCreated: OnOrgCreatedHook[];
	freezeWriteExempt: string[];
	mcpConfig: McpConfigOf<Modules>;
	v1App: V1AppOf<Modules>;
	mcpEndpoint: McpEndpointOf<Modules>;
};

type Registration = FeatureContribution & { daos: object };

/**
 * Two-phase combiner:
 *
 * - Phase A builds every feature's DAOs (stateless factories, no ordering
 *   constraints) and merges them into one bundle.
 * - Phase B calls `register` in manifest order; contributions accumulate in
 *   a registry that later modules read through `ctx.features.get`.
 *
 * Core services that need folded contributions (cleanup) are built after
 * phase B. The billing module swaps the plan source holder during phase B,
 * which is why `plan.service` is constructed against the holder's stable
 * delegating source.
 */
export const composeModules = <const Modules extends readonly FeatureModule[]>(
	platform: ComposePlatform,
	modules: Modules,
): ComposedResult<Modules> => {
	const { db, cache } = platform;

	// Core daos and services first — the former dependencies.ts built these
	// before any feature service.
	const adminUserDao = createAdminUserDao(db);
	const adminUserService = createAdminUserService(adminUserDao);
	const organizationDao = createOrganizationDao(db);
	const adminOrgService = createAdminOrgService(organizationDao);
	const memberDao = createMemberDao(db);
	const organizationService = createOrganizationService({
		organizationDao,
		memberDao,
	});
	const auditDao = createAuditDao(db);
	const auditService = createAuditService(auditDao);
	const activityDao = createActivityDao(db);

	// Plan resolution starts on the static free plan; billing replaces it
	// with the subscription lookup when it registers.
	const planHolder = createPlanSourceHolder(createStaticPlanSource("free"));
	const planService = createPlanService(planHolder.source, cache);

	const coreDaos: CoreDaos = {
		memberDao,
		organizationDao,
		adminUserDao,
		auditDao,
		activityDao,
	};
	const core: CoreContextServices = {
		adminUserService,
		adminOrgService,
		organizationService,
		planService,
		auditService,
		bootstrapService: createBootstrapService(adminUserDao),
		configService: createConfigService(cache),
		authPolicyService: createAuthPolicyService({
			adminUserDao,
			memberDao,
			organizationDao,
			plans: planService,
			allowFirstUserAdmin: platform.allowFirstUserAdmin ?? false,
		}),
	};

	// Phase A: DAOs.
	const registrations = new Map<string, Registration>();
	const daoBundle: Record<string, unknown> = { ...coreDaos };
	for (const module of modules) {
		const daos = module.createDaos?.({ db }) ?? {};
		registrations.set(module.id, { daos });
		Object.assign(daoBundle, daos);
	}

	// Phase B: services and contributions, in manifest order.
	const quotaUsageSinks: QuotaUsageSink[] = [];
	const features: FeatureLookup = {
		get: (id: string) => {
			const registration = registrations.get(id);
			if (!registration) {
				throw new Error(`[compose] feature "${id}" is not enabled`);
			}
			return registration as never;
		},
	};
	const context = {
		db,
		cache,
		billingMockEnabled: platform.billingMockEnabled,
		appWebUrl: platform.appWebUrl ?? "http://localhost:5173",
		resolvePublicApiUrl:
			platform.resolvePublicApiUrl ??
			((requestUrl: string) => new URL(requestUrl).origin),
		allowFirstUserAdmin: platform.allowFirstUserAdmin,
		apiRateLimiters: platform.apiRateLimiters,
		storage: platform.storage,
		stripeSetup: platform.stripeSetup,
		webhookQueue: platform.webhookQueue,
		aiConfig: platform.aiConfig,
		aiRateLimiters: platform.aiRateLimiters,
		mcpEnv: platform.mcpEnv,
		core,
		daos: daoBundle,
		features,
		setPlanSource: planHolder.set,
		quotaUsageSinks,
	};

	const services: Record<string, unknown> = {
		...core,
	} as unknown as Record<string, unknown>;
	const routes: RouteContribution[] = [];
	const cleanupHandlers: CleanupHandler[] = [];
	const scheduledJobs: ScheduledJob[] = [];
	const queueConsumers: QueueConsumer[] = [];
	const onOrgCreated: OnOrgCreatedHook[] = [];
	const freezeWriteExempt: string[] = [];
	const extras: Record<string, unknown> = {};

	for (const module of modules) {
		const registration = registrations.get(module.id);
		if (!registration) {
			throw new Error(`[compose] module "${module.id}" missing phase A entry`);
		}
		const contribution = module.register?.(context as never) ?? {};
		Object.assign(registration, contribution);
		Object.assign(services, contribution.services);
		if (contribution.routes) routes.push(...contribution.routes);
		if (contribution.cleanupHandlers)
			cleanupHandlers.push(...contribution.cleanupHandlers);
		if (contribution.scheduledJobs)
			scheduledJobs.push(...contribution.scheduledJobs);
		if (contribution.queueConsumers)
			queueConsumers.push(...contribution.queueConsumers);
		if (contribution.onOrgCreated)
			onOrgCreated.push(...contribution.onOrgCreated);
		if (contribution.freezeWriteExempt)
			freezeWriteExempt.push(...contribution.freezeWriteExempt);
		if (contribution.quotaUsageSinks)
			quotaUsageSinks.push(...contribution.quotaUsageSinks);
		Object.assign(extras, contribution.extras);
	}

	// Cleanup folds the contributed handlers; it lands in the job list as
	// the first entry, matching the former scheduled.ts order.
	const cleanupService = createCleanupService({
		memberDao,
		handlers: cleanupHandlers,
	});
	scheduledJobs.unshift(createCleanupScheduledJob(cleanupService));

	const mcpExtras = extras.mcp as
		| {
				config?: unknown;
				createEndpoint?: (deps: never, auth: Auth) => unknown;
		  }
		| undefined;
	const publicApiExtras = extras.publicApi as
		| { createApp?: (deps: never) => unknown }
		| undefined;

	const dependencies = {
		apiRateLimiters: platform.apiRateLimiters,
		daos: daoBundle,
		ai: extras.ai,
		services: { ...services, cleanupService },
	};
	const endpoints = {
		mcpConfig: mcpExtras?.config ?? { enabled: false },
		v1App: publicApiExtras?.createApp?.(dependencies as never) ?? null,
		mcpEndpoint: mcpExtras?.createEndpoint
			? (auth: Auth) => mcpExtras.createEndpoint?.(dependencies as never, auth)
			: null,
	};

	return {
		dependencies,
		routeContributions: routes,
		scheduledJobs,
		queueConsumers,
		onOrgCreated,
		freezeWriteExempt,
		...endpoints,
	} as unknown as ComposedResult<Modules>;
};
