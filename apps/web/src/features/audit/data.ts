import { queryOptions } from "@tanstack/react-query";
import type { AuditAction } from "@workspace/shared";
import { auditRootKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";

export const AUDIT_PAGE_SIZE = 20;

export type AuditListInput = {
	page: number;
	action?: AuditAction;
	actorId?: string;
	from?: string;
	to?: string;
};

const queryFor = (input: AuditListInput) => ({
	page: String(input.page),
	pageSize: String(AUDIT_PAGE_SIZE),
	...(input.action ? { action: input.action } : {}),
	...(input.actorId ? { actorId: input.actorId } : {}),
	...(input.from ? { from: input.from } : {}),
	...(input.to ? { to: input.to } : {}),
});

export function auditQuery(orgId: string, input: AuditListInput) {
	return queryOptions({
		queryKey: [...auditRootKey(orgId), input] as const,
		queryFn: () =>
			unwrap(
				client.api.orgs[":orgId"].audit.$get({
					param: { orgId },
					query: queryFor(input),
				}),
			),
	});
}

export async function exportAuditCsv(orgId: string, input: AuditListInput) {
	const params = new URLSearchParams(queryFor({ ...input, page: 1 }));
	const base = (import.meta.env?.VITE_API_URL ?? "").replace(/\/$/, "");
	const response = await fetch(
		`${base}/api/orgs/${encodeURIComponent(orgId)}/audit/export?${params}`,
		{ credentials: "include" },
	);
	if (!response.ok) {
		throw new Error(`Export failed (${response.status})`);
	}
	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `audit-${orgId}.csv`;
	link.click();
	URL.revokeObjectURL(url);
}
