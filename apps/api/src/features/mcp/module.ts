import type { FeatureModule } from "../../core/compose";
import type { Auth } from "../../core/lib/auth";
import type { FullFeatureContext } from "../../feature-context";
import { resolveMcpConfig } from "./config";
import { createMcpEndpoint, createMcpRoutes } from "./routes";

/**
 * MCP: the stateless `/mcp` endpoint plus the session-authenticated org
 * settings route. Contributes the resolved config and the endpoint factory
 * as extras so `app.ts` can wire OAuth/CORS without importing the feature.
 *
 * The factory parameters are typed `never` (the slot type) — the combiner
 * passes the fully composed Dependencies at call time.
 */
export const mcpModule = {
	id: "mcp",
	register: (ctx) => {
		const config = resolveMcpConfig(ctx.mcpEnv);
		return {
			routes: [
				{
					// Mounted in the org phase so /api/orgs/:orgId/mcp/* is
					// session-authenticated; the fold guarantees the org
					// middleware runs first.
					phase: "org",
					create: () => createMcpRoutes({ config }),
				},
			],
			extras: {
				mcp: {
					config,
					createEndpoint: (deps: never, auth: Auth) =>
						createMcpEndpoint({ auth, dependencies: deps, config }),
				},
			},
		};
	},
} satisfies FeatureModule<object, FullFeatureContext>;

export type McpContribution = ReturnType<typeof mcpModule.register>;
