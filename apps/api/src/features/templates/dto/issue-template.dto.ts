/** Issue prefill template. `labelIds` is stored as JSON and always an array. */
export type IssueTemplateDto = {
	id: string;
	orgId: string;
	projectId: string | null;
	name: string;
	title: string;
	description: string | null;
	statusId: string | null;
	priority: number | null;
	labelIds: string[];
	estimate: number | null;
	createdById: string | null;
	createdAt: string;
	updatedAt: string;
};
