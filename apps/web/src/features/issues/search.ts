import { z } from "zod";

export const issueSearchSchema = z.object({
	page: z.coerce.number().int().min(1).catch(1),
	status: z.string().optional().catch(""),
	priority: z.string().optional().catch(""),
	assigneeId: z.string().optional().catch(""),
	labelId: z.string().optional().catch(""),
	search: z.string().optional().catch(""),
	sort: z.enum(["updated", "created", "priority"]).catch("updated"),
	/**
	 * Set by the command palette to open the create-issue dialog on arrival.
	 * Accepts the URL forms (`new=true` / `new=1`) and programmatic booleans,
	 * always resolving to a boolean.
	 */
	new: z
		.union([z.boolean(), z.literal(1), z.literal("1"), z.literal("true")])
		.transform((value) => value !== false)
		.optional()
		.catch(undefined),
	view: z
		.enum(["list", "board", "kanban"])
		.transform((value) => (value === "kanban" ? "board" : value))
		.optional()
		.catch("list"),
});

export type IssuesSearch = z.infer<typeof issueSearchSchema>;
