import { useQuery } from "@tanstack/react-query";
import { MANAGE_ROLES, membersQuery } from "@/lib/queries/members";
import { useSession } from "@/lib/session";

export function useOrgRole(orgId: string) {
	const { data: session } = useSession();
	const members = useQuery(membersQuery(orgId));
	const role = members.data?.find(
		(member) => member.userId === session?.user.id,
	)?.role;
	const canManage =
		role !== undefined && (MANAGE_ROLES as readonly string[]).includes(role);
	return { role, canManage };
}
