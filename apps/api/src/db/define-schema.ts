import { defineCoreTables } from "../core/schema";
import { defineAiTables } from "../features/ai/schema";
import { defineApiKeysTables } from "../features/api-keys/schema";
import { defineAttachmentsTables } from "../features/attachments/schema";
import { defineBillingTables } from "../features/billing/schema";
import { defineCommentsTables } from "../features/comments/schema";
import { defineCyclesTables } from "../features/cycles/schema";
import { defineFavoritesTables } from "../features/favorites/schema";
import { defineIssuesTables } from "../features/issues/schema";
import { defineLabelsTables } from "../features/labels/schema";
import { defineMcpTables } from "../features/mcp/schema";
import { defineNotificationsTables } from "../features/notifications/schema";
import { defineProjectUpdatesTables } from "../features/project-updates/schema";
import { defineProjectsTables } from "../features/projects/schema";
import { defineRecurrencesTables } from "../features/recurrences/schema";
import { defineStatusesTables } from "../features/statuses/schema";
import { defineTemplatesTables } from "../features/templates/schema";
import { defineViewsTables } from "../features/views/schema";
import { defineWebhooksTables } from "../features/webhooks/schema";
import type { SchemaDialect } from "./dialect";
import { createSchemaKit } from "./kit";

/**
 * One table definition for SQLite and PostgreSQL. Callers that typecheck
 * against this module see the SQLite column types; `defineSchema("postgres")`
 * still builds real pg-core tables.
 *
 * Each slice owns `features/<id>/schema.ts`; core owns `core/schema.ts`. The
 * spreads stay literal (no runtime loop) so the returned shape — and therefore
 * `AppSchema` and `db/schema.ts` — keeps its exact per-table keys.
 */
export const defineSchema = (dialect: SchemaDialect) => {
	const kit = createSchemaKit(dialect);
	return {
		...defineCoreTables(kit),
		...defineMcpTables(kit),
		...defineProjectsTables(kit),
		...defineCyclesTables(kit),
		...defineStatusesTables(kit),
		...defineIssuesTables(kit),
		...defineLabelsTables(kit),
		...defineProjectUpdatesTables(kit),
		...defineCommentsTables(kit),
		...defineAttachmentsTables(kit),
		...defineApiKeysTables(kit),
		...defineWebhooksTables(kit),
		...defineAiTables(kit),
		...defineBillingTables(kit),
		...defineViewsTables(kit),
		...defineNotificationsTables(kit),
		...defineFavoritesTables(kit),
		...defineTemplatesTables(kit),
		...defineRecurrencesTables(kit),
	};
};

export type AppSchema = ReturnType<typeof defineSchema>;
