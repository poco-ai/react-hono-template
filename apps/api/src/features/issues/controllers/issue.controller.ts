import type {
	CreateIssueInput,
	ImportIssuesInput,
	IssueListQuery,
	TriageQuery,
	UpdateIssueInput,
} from "@workspace/shared";
import type { Context } from "hono";
import { backgroundFromContext } from "../../../core/lib/background";
import type {
	IssueParams,
	ParamContext,
	ProjectParams,
} from "../../../core/lib/params";
import { ok } from "../../../core/lib/response";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import type { IssueService } from "../services/issue.service";

type Env = SessionEnv & OrgEnv;

export const createIssueController = (service: IssueService) => ({
	listByProject: async (
		c: ParamContext<ProjectParams>,
		query: IssueListQuery,
	) =>
		ok(
			c,
			await service.listIssues(
				c.get("orgMember").orgId,
				c.req.valid("param").projectId,
				query,
			),
		),

	listByOrg: async (c: Context<Env>, query: IssueListQuery) =>
		ok(c, await service.listIssues(c.get("orgMember").orgId, null, query)),

	listTriage: async (c: Context<Env>, query: TriageQuery) =>
		ok(c, await service.listTriage(c.get("orgMember").orgId, query)),

	get: async (c: ParamContext<IssueParams>) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.getIssue(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
			),
		);
	},

	create: async (c: ParamContext<ProjectParams>, input: CreateIssueInput) =>
		ok(
			c,
			await service.createIssue(
				c.get("orgMember").orgId,
				c.req.valid("param").projectId,
				c.get("session").user.id,
				input,
				backgroundFromContext(c),
			),
		),

	/** Streams the project CSV; truncation is visible in response headers. */
	exportCsv: async (c: ParamContext<ProjectParams>) => {
		const result = await service.exportIssues(
			c.get("orgMember").orgId,
			c.req.valid("param").projectId,
		);
		c.header("Content-Type", "text/csv; charset=utf-8");
		c.header(
			"Content-Disposition",
			`attachment; filename="${result.filename}"`,
		);
		c.header("X-Issue-Count", String(result.exported));
		c.header("X-Issue-Total", String(result.total));
		c.header("X-Issue-Truncated", result.truncated ? "true" : "false");
		c.header("Cache-Control", "no-store");
		// A UTF-8 BOM makes Excel detect the encoding, so non-ASCII text (e.g.
		// Chinese titles) opens without mojibake.
		return c.body(`\uFEFF${result.csv}`);
	},

	import: async (c: ParamContext<ProjectParams>, input: ImportIssuesInput) =>
		ok(
			c,
			await service.importIssues(
				c.get("orgMember").orgId,
				c.req.valid("param").projectId,
				c.get("session").user.id,
				input,
			),
		),

	update: async (c: ParamContext<IssueParams>, input: UpdateIssueInput) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.updateIssue(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				c.get("session").user.id,
				input,
				backgroundFromContext(c),
			),
		);
	},

	remove: async (c: ParamContext<IssueParams>) => {
		const params = c.req.valid("param");
		await service.deleteIssue(
			c.get("orgMember").orgId,
			params.projectId,
			params.number,
			c.get("session").user.id,
			backgroundFromContext(c),
		);
		return ok(c, { deleted: true });
	},

	archive: async (c: ParamContext<IssueParams>) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.archiveIssue(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				c.get("session").user.id,
				backgroundFromContext(c),
			),
		);
	},

	restore: async (c: ParamContext<IssueParams>) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.restoreIssue(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				c.get("session").user.id,
				backgroundFromContext(c),
			),
		);
	},
});
