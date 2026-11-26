import { BookOpenIcon } from "lucide-react";
import { ApiKeysViewDocsLink } from "@/features/public-api/components/api-keys-view-docs-link";
import type { WebFeatureDecl } from "@/features/web-types";

/** Public API: the `/api-docs` page and its command-palette shortcut. */
export const publicApiWeb: WebFeatureDecl = {
	id: "public-api",
	apiKeysDocsAction: ApiKeysViewDocsLink,
	paletteActions: () => [
		{
			id: "api-docs",
			labelKey: "command.goToApiDocs",
			icon: BookOpenIcon,
			run: (ctx) => ctx.navigate({ to: "/api-docs" }),
		},
	],
};
