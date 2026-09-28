import type { PlanName } from "@workspace/shared";

export type AdminOrgDto = {
	id: string;
	name: string;
	slug: string;
	frozen: boolean;
	createdAt: string;
	plan: PlanName;
	status: string | null;
	members: number;
	issues: number;
};

export type ListAdminOrgsDto = {
	items: AdminOrgDto[];
	total: number;
	page: number;
	pageSize: number;
};

export type AdminStatsDto = {
	users: number;
	orgs: number;
	issues: number;
	proOrgs: number;
};
