import type { AuditListQuery } from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { AuditService } from "../services/audit.service";

const toFilter = (orgId: string | undefined, query: AuditListQuery) => ({
	orgId,
	action: query.action,
	actorId: query.actorId,
	from: query.from ? new Date(query.from) : undefined,
	to: query.to ? new Date(query.to) : undefined,
	page: query.page,
	pageSize: query.pageSize,
});

const csvResponse = (c: Context, filename: string, csv: string) => {
	c.header("Content-Type", "text/csv; charset=utf-8");
	c.header("Content-Disposition", `attachment; filename="${filename}"`);
	c.header("Cache-Control", "no-store");
	return c.body(`\uFEFF${csv}`);
};

export const createAuditController = (service: AuditService) => ({
	listForOrg: async (
		c: Context<SessionEnv & OrgEnv>,
		query: AuditListQuery,
	) => {
		const orgId = c.get("orgMember").orgId;
		const page = await service.list(toFilter(orgId, query));
		return ok(c, { ...page, page: query.page, pageSize: query.pageSize });
	},

	exportForOrg: async (
		c: Context<SessionEnv & OrgEnv>,
		query: AuditListQuery,
	) => {
		const orgId = c.get("orgMember").orgId;
		const csv = await service.exportCsv(toFilter(orgId, query));
		return csvResponse(c, `audit-${orgId}.csv`, csv);
	},

	listForAdmin: async (
		c: Context<SessionEnv>,
		query: AuditListQuery & { orgId?: string },
	) => {
		const page = await service.list(toFilter(query.orgId, query));
		return ok(c, { ...page, page: query.page, pageSize: query.pageSize });
	},

	exportForAdmin: async (
		c: Context<SessionEnv>,
		query: AuditListQuery & { orgId?: string },
	) => {
		const csv = await service.exportCsv(toFilter(query.orgId, query));
		return csvResponse(c, "audit.csv", csv);
	},
});
