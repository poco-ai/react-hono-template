import type { Paginated, PlanName } from "@workspace/shared";

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

export type ListAdminOrgsDto = Paginated<AdminOrgDto>;

export type AdminStatsDto = {
	users: number;
	orgs: number;
	issues: number;
	proOrgs: number;
};
