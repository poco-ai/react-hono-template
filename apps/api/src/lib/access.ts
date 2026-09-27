import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

export const statements = defaultStatements;

export const ac = createAccessControl(statements);

export const userRole = ac.newRole({});

export const adminRole = ac.newRole({
	user: ["create", "list", "set-role", "ban", "delete", "get", "update"],
	session: ["list", "revoke", "delete"],
});

export const roles = { admin: adminRole, user: userRole } as const;

export type RoleName = keyof typeof roles;

export type Permission = {
	[K in keyof typeof statements]?: (typeof statements)[K][number][];
};

export const hasPermission = (
	role: string | null | undefined,
	permission: Permission,
): boolean => {
	const roleDef = roles[role as RoleName];
	if (!roleDef) {
		return false;
	}
	return roleDef.authorize(permission)?.success ?? false;
};
