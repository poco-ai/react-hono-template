import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/data";
import { MANAGE_ROLES, membersQuery } from "@/features/members/data";

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
