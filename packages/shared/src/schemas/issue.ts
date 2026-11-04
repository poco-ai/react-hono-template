import { z } from "zod";
import { ISSUE_PRIORITY, ISSUE_STATUSES } from "../constants";
import { parseCsv } from "../csv";
import { paginationQueryShape } from "./pagination";

const toArray = (value: unknown) => {
	if (typeof value === "string") {
		return parseCsv(value);
	}
	return value;
};

const toNumberArray = (value: unknown) => {
	const array = toArray(value);
	if (Array.isArray(array)) {
		return array.map((item) => Number(item));
	}
	return array;
};

export const createIssueSchema = z.object({
	title: z.string().trim().min(1).max(500),
	description: z.string().max(20000).optional(),
	/** Organization status id; preferred over the legacy `status` name. */
	statusId: z
		.string()
		.min(1)
		.describe("Organization workflow status id (preferred).")
		.optional(),
	/**
	 * @deprecated Compatibility input: legacy status name. The service resolves
	 * it to an organization status id.
	 */
	status: z
		.enum(ISSUE_STATUSES)
		.describe("Deprecated legacy status name; resolved to a status id.")
		.optional(),
	priority: z
		.number()
		.int()
		.min(ISSUE_PRIORITY.none)
		.max(ISSUE_PRIORITY.low)
		.optional(),
	assigneeId: z.string().min(1).optional(),
	labelIds: z.array(z.string().min(1)).max(20).optional(),
	dueDate: z.iso.datetime().optional(),
	estimate: z.number().int().min(0).max(100).optional(),
	/** Parent issue id; the parent must live in the same project. */
	parentId: z.string().min(1).optional(),
});

export const updateIssueSchema = createIssueSchema.partial().extend({
	description: z.string().max(20000).nullish(),
	priority: z.number().int().min(0).max(4).nullish(),
	assigneeId: z.string().min(1).nullish(),
	dueDate: z.iso.datetime().nullish(),
	estimate: z.number().int().min(0).max(100).nullish(),
	/** Pass null to detach the issue from its parent. */
	parentId: z.string().min(1).nullish(),
});

export const issueListQuerySchema = z.object({
	...paginationQueryShape(20),
	/**
	 * @deprecated Legacy status names (e.g. `in_progress`). Mapped to the
	 * organization's status ids by the service.
	 */
	status: z
		.preprocess(toArray, z.array(z.enum(ISSUE_STATUSES)).optional())
		.describe("Deprecated legacy status names (comma separated)."),
	/** Organization status ids. Preferred over `status`. */
	statusId: z
		.preprocess(toArray, z.array(z.string().min(1)).optional())
		.describe("Organization workflow status ids (comma separated)."),
	priority: z.preprocess(
		toNumberArray,
		z
			.array(
				z.coerce
					.number()
					.int()
					.min(ISSUE_PRIORITY.none)
					.max(ISSUE_PRIORITY.low),
			)
			.optional(),
	),
	assigneeId: z.string().min(1).optional(),
	labelId: z.string().min(1).optional(),
	search: z.string().trim().max(100).optional(),
	sort: z.enum(["updated", "created", "priority"]).default("updated"),
	projectId: z.string().min(1).optional(),
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;

export type IssueListQuery = z.infer<typeof issueListQuerySchema>;
