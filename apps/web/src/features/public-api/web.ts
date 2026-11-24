import { BookOpenIcon } from "lucide-react";
import type { WebFeatureDecl } from "@/features/web-types";

/** Public API: the `/api-docs` page and its command-palette shortcut. */
export const publicApiWeb: WebFeatureDecl = {
	id: "public-api",
	paletteActions: () => [
		{
			id: "api-docs",
			labelKey: "command.goToApiDocs",
			icon: BookOpenIcon,
			run: (ctx) => ctx.navigate({ to: "/api-docs" }),
		},
	],
};
