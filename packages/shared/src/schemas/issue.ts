import { z } from "zod";
import { ISSUE_PRIORITY, ISSUE_STATUSES } from "../constants";
import { paginationQueryShape } from "./pagination";

const toArray = (value: unknown) => {
	if (typeof value === "string") {
		return value
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean);
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
	status: z.enum(ISSUE_STATUSES).optional(),
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
});

export const updateIssueSchema = createIssueSchema.partial().extend({
	description: z.string().max(20000).nullish(),
	priority: z.number().int().min(0).max(4).nullish(),
	assigneeId: z.string().min(1).nullish(),
	dueDate: z.iso.datetime().nullish(),
	estimate: z.number().int().min(0).max(100).nullish(),
});

export const issueListQuerySchema = z.object({
	...paginationQueryShape(20),
	status: z.preprocess(toArray, z.array(z.enum(ISSUE_STATUSES)).optional()),
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
