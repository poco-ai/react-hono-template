import { Button } from "@workspace/ui/components/button";
import { DropdownMenuItem } from "@workspace/ui/components/dropdown-menu";
import { Megaphone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProjectUpdatesSheet } from "@/features/project-updates/components/project-updates-sheet";
import type { ProjectPageContext, WebFeatureDecl } from "@/features/web-types";

function useProjectUpdatesAction(context: ProjectPageContext) {
	const [open, setOpen] = useState(false);
	const sheet = (
		<ProjectUpdatesSheet
			orgId={context.orgId}
			projectId={context.projectId}
			open={open}
			onOpenChange={setOpen}
			frozen={context.frozen}
		/>
	);
	return { sheet, open: () => setOpen(true) };
}

function ProjectUpdatesButton(context: ProjectPageContext) {
	const { t } = useTranslation();
	const action = useProjectUpdatesAction(context);
	return (
		<>
			<Button
				variant="outline"
				size="sm"
				className="hidden md:inline-flex"
				onClick={action.open}
			>
				<Megaphone className="size-4" />
				{t("projectUpdates.title")}
			</Button>
			{action.sheet}
		</>
	);
}

function ProjectUpdatesMenuItem(context: ProjectPageContext) {
	const { t } = useTranslation();
	const action = useProjectUpdatesAction(context);
	return (
		<>
			<DropdownMenuItem onClick={action.open}>
				<Megaphone className="size-4" />
				{t("projectUpdates.title")}
			</DropdownMenuItem>
			{action.sheet}
		</>
	);
}

/** Project updates: header action and mobile menu row (UI lives in the sheet). */
export const projectUpdatesWeb: WebFeatureDecl = {
	id: "project-updates",
	i18nNamespaces: ["projectUpdates"],
	projectHeaderActions: [
		{ id: "project-updates", order: 20, component: ProjectUpdatesButton },
	],
	projectMenuItems: [
		{ id: "project-updates", order: 20, component: ProjectUpdatesMenuItem },
	],
};
