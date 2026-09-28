import { queryOptions, useQuery } from "@tanstack/react-query";
import { authClient } from "./auth-client";

export type Session = NonNullable<
	Awaited<ReturnType<typeof authClient.getSession>>["data"]
>;
export type SessionUser = Session["user"];

export const sessionOptions = queryOptions({
	queryKey: ["session"],
	queryFn: async () => {
		const { data } = await authClient.getSession();
		return data ?? null;
	},
	staleTime: Infinity,
});

export function useSession() {
	return useQuery(sessionOptions);
}
