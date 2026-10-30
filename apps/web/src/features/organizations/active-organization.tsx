import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth } from "@better-auth-ui/react";
import {
	useActiveOrganization,
	useSetActiveOrganization,
} from "@better-auth-ui/react/plugins/organization";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

const ActiveOrganizationSyncContext = createContext({ failed: false });

/**
 * Keeps better-auth's active organization aligned with the URL org id.
 * Library organization components read the session, not the route param.
 */
export function ActiveOrganizationSync({
	orgId,
	children,
}: {
	orgId: string;
	children: ReactNode;
}) {
	const { authClient } = useAuth<OrganizationAuthClient>();
	const active = useActiveOrganization(authClient);
	const { mutate } = useSetActiveOrganization(authClient);
	const [failedOrgId, setFailedOrgId] = useState<string | null>(null);

	useEffect(() => {
		if (active.isPending || active.data?.id === orgId) return;
		let cancelled = false;
		mutate(
			{ organizationId: orgId },
			{
				onError: () => {
					if (!cancelled) setFailedOrgId(orgId);
				},
				onSuccess: () => {
					if (!cancelled) setFailedOrgId(null);
				},
			},
		);
		return () => {
			cancelled = true;
		};
	}, [active.data?.id, active.isPending, mutate, orgId]);

	return (
		<ActiveOrganizationSyncContext.Provider
			value={{ failed: failedOrgId === orgId }}
		>
			{children}
		</ActiveOrganizationSyncContext.Provider>
	);
}

export function useActiveOrganizationReady(orgId: string) {
	const { authClient } = useAuth<OrganizationAuthClient>();
	const active = useActiveOrganization(authClient);
	const { failed } = useContext(ActiveOrganizationSyncContext);
	return {
		ready: active.data?.id === orgId,
		failed: failed || active.isError,
	};
}
