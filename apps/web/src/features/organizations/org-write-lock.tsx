import { createContext, type ReactNode, useContext } from "react";

const OrgWriteLockContext = createContext(false);

/** When true, organization profile and member writes stay closed (frozen orgs). */
export function OrgWriteLockProvider({
	locked,
	children,
}: {
	locked: boolean;
	children: ReactNode;
}) {
	return (
		<OrgWriteLockContext.Provider value={locked}>
			{children}
		</OrgWriteLockContext.Provider>
	);
}

export function useOrgWriteLocked() {
	return useContext(OrgWriteLockContext);
}
