import type { IssueTemplateDto } from "@api/dto/issue-template.dto";
import type { IssuePriorityName } from "@workspace/shared";
import { priorityName, priorityValue } from "@workspace/shared";
import type { CreateIssueFormState } from "@/features/issues/create-issue-input";

/**
 * Templates offered by the create-issue dialog for a project: its own
 * project-scoped templates plus the organization-wide ones. Templates of other
 * projects are excluded — their status/label defaults would not fit.
 */
export const templatesForProject = (
	templates: IssueTemplateDto[] | undefined,
	projectId: string,
) =>
	(templates ?? [])
		.filter(
			(template) =>
				template.projectId === null || template.projectId === projectId,
		)
		.sort((left, right) => {
			// Project templates first, then organization-wide ones, by name.
			if (left.projectId !== right.projectId) {
				return left.projectId === null ? 1 : -1;
			}
			return left.name.localeCompare(right.name);
		});

/**
 * Applies a template to the create-issue form. Selecting a template is an
 * explicit override: title, description, priority, labels and estimate are
 * replaced with the template values (a template without a priority/estimate
 * clears them), and the status is replaced when the template pins one so the
 * project's default status otherwise stays selected. The user can keep editing
 * every field afterwards.
 *
 * `availableLabelIds` filters out labels deleted after the template was saved,
 * so the prefilled form never fails server-side label validation.
 */
export const applyIssueTemplate = (
	form: CreateIssueFormState,
	template: IssueTemplateDto,
	{ availableLabelIds }: { availableLabelIds?: string[] } = {},
): CreateIssueFormState => {
	const allowed = availableLabelIds ? new Set(availableLabelIds) : undefined;
	return {
		...form,
		title: template.title,
		description: template.description ?? "",
		statusId: template.statusId ?? form.statusId,
		priority:
			template.priority === null ? "none" : priorityName(template.priority),
		labelIds: allowed
			? template.labelIds.filter((id) => allowed.has(id))
			: [...template.labelIds],
		estimate: template.estimate === null ? "" : String(template.estimate),
	};
};

/** Sentinel select values shared by the template settings dialog. */
export const ORG_WIDE_TEMPLATE_SCOPE = "__org_wide__";
export const TEMPLATE_NO_STATUS = "__no_status__";

/** Raw text/select state owned by the template settings dialog. */
export type IssueTemplateFormState = {
	name: string;
	projectId: string;
	title: string;
	description: string;
	statusId: string;
	priority: IssuePriorityName;
	labelIds: string[];
	estimate: string;
};

export const emptyIssueTemplateForm = (
	statusId?: string,
): IssueTemplateFormState => ({
	name: "",
	projectId: ORG_WIDE_TEMPLATE_SCOPE,
	title: "",
	description: "",
	statusId: statusId ?? TEMPLATE_NO_STATUS,
	priority: "none",
	labelIds: [],
	estimate: "",
});

export const issueTemplateFormFromDto = (
	template: IssueTemplateDto,
): IssueTemplateFormState => ({
	name: template.name,
	projectId: template.projectId ?? ORG_WIDE_TEMPLATE_SCOPE,
	title: template.title,
	description: template.description ?? "",
	statusId: template.statusId ?? TEMPLATE_NO_STATUS,
	priority:
		template.priority === null ? "none" : priorityName(template.priority),
	labelIds: [...template.labelIds],
	estimate: template.estimate === null ? "" : String(template.estimate),
});

/**
 * Serializes dialog state into the create/update payload. The dialog always
 * sends a full replacement, so a missing status/estimate/description is sent
 * explicitly as `null` (PATCH clears it) rather than omitted.
 */
export const templateInputFromForm = (form: IssueTemplateFormState) => ({
	name: form.name.trim(),
	projectId: form.projectId === ORG_WIDE_TEMPLATE_SCOPE ? null : form.projectId,
	title: form.title.trim(),
	description: form.description.trim() || null,
	statusId: form.statusId === TEMPLATE_NO_STATUS ? null : form.statusId,
	priority: priorityValue(form.priority),
	labelIds: form.labelIds,
	estimate: form.estimate === "" ? null : Number(form.estimate),
});
