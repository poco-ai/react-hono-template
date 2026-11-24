import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
	applyIssueTemplate,
	templatesForProject,
} from "@/features/templates/apply";
import { issueTemplatesQuery } from "@/features/templates/data";
import type {
	IssueTemplatesExtras,
	WebFeatureDecl,
} from "@/features/web-types";

function useIssueTemplates(
	orgId: string,
	projectId: string,
	enabled: boolean,
): IssueTemplatesExtras {
	const { t } = useTranslation();
	const templates = useQuery({
		...issueTemplatesQuery(orgId),
		enabled,
	});
	const options = templatesForProject(templates.data, projectId).map(
		(template) => ({
			id: template.id,
			name: template.name,
			projectId: template.projectId,
			label:
				template.projectId === null
					? `${template.name} · ${t("templates.orgWide")}`
					: template.name,
		}),
	);
	return {
		options,
		prefill: (templateId, current, availableLabelIds) => {
			const template = (templates.data ?? []).find(
				(entry) => entry.id === templateId,
			);
			if (!template) return null;
			const next = applyIssueTemplate(
				{
					...current,
					assigneeId: undefined,
					dueDate: "",
					cycleId: undefined,
				},
				template,
				{ availableLabelIds: [...availableLabelIds] },
			);
			return {
				title: next.title,
				description: next.description,
				statusId: next.statusId,
				priority: next.priority,
				labelIds: next.labelIds,
				estimate: next.estimate,
			};
		},
	};
}

/** Issue templates: prefill options consumed by the create-issue dialog. */
export const templatesWeb: WebFeatureDecl = {
	id: "templates",
	i18nNamespaces: ["templates"],
	settingsNav: () => [
		{
			id: "templates",
			to: "/orgs/$orgId/settings/templates",
			labelKey: "settings.templates",
		},
	],
	issueExtras: { useTemplates: useIssueTemplates },
};
