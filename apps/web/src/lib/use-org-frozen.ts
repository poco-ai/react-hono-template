import { useQuery } from "@tanstack/react-query";
import { orgsQuery } from "@/lib/queries/org";

export function useOrgFrozen(orgId: string): boolean {
	const orgs = useQuery(orgsQuery());
	return orgs.data?.find((org) => org.id === orgId)?.frozen ?? false;
}
