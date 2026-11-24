import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { DropdownMenuItem } from "@workspace/ui/components/dropdown-menu";
import { CalendarRange } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CurrentCycleCard } from "@/features/cycles/components/current-cycle-card";
import { CycleFilterBadge } from "@/features/cycles/components/cycle-filter-badge";
import { cyclesQuery } from "@/features/cycles/data";
import type {
	ProjectFilterContext,
	ProjectPageContext,
	WebFeatureDecl,
} from "@/features/web-types";

function ProjectCyclesLink(context: ProjectPageContext) {
	const { t } = useTranslation();
	return (
		<Link
			to="/orgs/$orgId/projects/$projectId/cycles"
			params={{ orgId: context.orgId, projectId: context.projectId }}
			className={buttonVariants({
				variant: "outline",
				size: "sm",
				className: "hidden md:inline-flex",
			})}
		>
			<CalendarRange className="size-4" />
			{t("cycles.title")}
		</Link>
	);
}

function ProjectCyclesMenuItem(context: ProjectPageContext) {
	const { t } = useTranslation();
	return (
		<DropdownMenuItem
			render={
				<Link
					to="/orgs/$orgId/projects/$projectId/cycles"
					params={{ orgId: context.orgId, projectId: context.projectId }}
				/>
			}
		>
			<CalendarRange className="size-4" />
			{t("cycles.title")}
		</DropdownMenuItem>
	);
}

function ProjectCycleBanner(context: ProjectPageContext) {
	return (
		<CurrentCycleCard orgId={context.orgId} projectId={context.projectId} />
	);
}

function ActiveCycleBadge(context: ProjectFilterContext) {
	if (!context.cycleName) return null;
	return (
		<CycleFilterBadge name={context.cycleName} onClear={context.clearCycle} />
	);
}

function useCycleOptions(orgId: string, projectId: string) {
	const cycles = useQuery(cyclesQuery(orgId, projectId));
	return (cycles.data?.items ?? []).map((cycle) => ({
		id: cycle.id,
		name: cycle.name,
	}));
}

/** Cycles: project planning pages plus the issue form/properties cycle options. */
export const cyclesWeb: WebFeatureDecl = {
	id: "cycles",
	i18nNamespaces: ["cycles"],
	issueExtras: { useCycles: useCycleOptions },
	projectHeaderActions: [
		{ id: "cycles", order: 30, component: ProjectCyclesLink },
	],
	projectMenuItems: [
		{ id: "cycles", order: 30, component: ProjectCyclesMenuItem },
	],
	projectBanners: [
		{ id: "current-cycle", order: 10, component: ProjectCycleBanner },
	],
	projectFilterBadges: [
		{ id: "cycle-filter", order: 10, component: ActiveCycleBadge },
	],
};
