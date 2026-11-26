import { activitiesModule } from "./features/activities/module";
import { aiModule } from "./features/ai/module";
import { apiKeysModule } from "./features/api-keys/module";
import { attachmentsModule } from "./features/attachments/module";
import { billingModule } from "./features/billing/module";
import { capabilitiesModule } from "./features/capabilities/module";
import { commentsModule } from "./features/comments/module";
import { cyclesModule } from "./features/cycles/module";
import { favoritesModule } from "./features/favorites/module";
import { issuesModule } from "./features/issues/module";
import { labelsModule } from "./features/labels/module";
import { mcpModule } from "./features/mcp/module";
import { notificationsModule } from "./features/notifications/module";
import { projectUpdatesModule } from "./features/project-updates/module";
import { projectsModule } from "./features/projects/module";
import { publicApiModule } from "./features/public-api/module";
import { recurrencesModule } from "./features/recurrences/module";
import { relationsModule } from "./features/relations/module";
import { roadmapModule } from "./features/roadmap/module";
import { searchModule } from "./features/search/module";
import { statusesModule } from "./features/statuses/module";
import { templatesModule } from "./features/templates/module";
import { viewsModule } from "./features/views/module";
import { webhooksModule } from "./features/webhooks/module";

/**
 * Feature manifest — the single injection point the create-app CLI
 * (Phase 6) rewrites per preset. The template repository always ships the full set.
 *
 * ORDER MATTERS: modules register in this sequence, mirroring the
 * construction order of the former dependencies.ts so every service a
 * feature consumes (via `ctx.features.get`) is already registered:
 *
 *   billing  → quota + storage accounting before attachments/ai consume them
 *   webhooks → the event dispatcher port implementation
 *   statuses/notifications → services the issue workflow injects
 *   ...resource features → the 15 services the capability layer reads
 *   ai       → capability layer + provider, needs everything above
 *   mcp      → endpoint extras only
 *
 * `compose-order.test.ts` pins the resulting service/dao key sets.
 */
export const FEATURE_MODULES = [
	billingModule,
	searchModule,
	webhooksModule,
	attachmentsModule,
	projectsModule,
	projectUpdatesModule,
	cyclesModule,
	roadmapModule,
	viewsModule,
	statusesModule,
	notificationsModule,
	issuesModule,
	labelsModule,
	recurrencesModule,
	favoritesModule,
	templatesModule,
	relationsModule,
	commentsModule,
	activitiesModule,
	apiKeysModule,
	capabilitiesModule,
	aiModule,
	publicApiModule,
	mcpModule,
];

/** Enabled feature ids, in registration order (kept in sync with the modules). */
export const ENABLED_FEATURES = [
	"billing",
	"search",
	"webhooks",
	"attachments",
	"projects",
	"project-updates",
	"cycles",
	"roadmap",
	"views",
	"statuses",
	"notifications",
	"issues",
	"labels",
	"recurrences",
	"favorites",
	"templates",
	"relations",
	"comments",
	"activities",
	"api-keys",
	"capabilities",
	"ai",
	"public-api",
	"mcp",
] as const;
