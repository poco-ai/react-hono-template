import type { FeatureModule } from "../../core/compose";
import { createV1App } from "./index";

/**
 * Public API (v1): the OpenAPI-documented, API-key-authenticated sub-app
 * mounted at `/api/v1`. The app factory parameter is typed `never` (the
 * slot type) — the combiner passes the fully composed Dependencies after
 * phase B.
 */
export const publicApiModule = {
	id: "public-api",
	register: () => ({
		extras: {
			publicApi: {
				createApp: (deps: never) => createV1App(deps),
			},
		},
	}),
} satisfies FeatureModule;

export type PublicApiContribution = ReturnType<typeof publicApiModule.register>;
