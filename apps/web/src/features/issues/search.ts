import { z } from "zod";

export const issueSearchSchema = z.object({
	page: z.coerce.number().int().min(1).catch(1),
	status: z.string().optional().catch(""),
	priority: z.string().optional().catch(""),
	assigneeId: z.string().optional().catch(""),
	labelId: z.string().optional().catch(""),
	search: z.string().optional().catch(""),
	sort: z.enum(["updated", "created", "priority"]).catch("updated"),
	view: z
		.enum(["list", "board", "kanban"])
		.transform((value) => (value === "kanban" ? "board" : value))
		.optional()
		.catch("list"),
});

export type IssuesSearch = z.infer<typeof issueSearchSchema>;
