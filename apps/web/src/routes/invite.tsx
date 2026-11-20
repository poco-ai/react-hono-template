import { createFileRoute, redirect } from "@tanstack/react-router";
import { loadAppSession } from "@/features/auth/data";
import { inviteSearchSchema } from "@/features/members/search";
import { InvitePage } from "@/pages/invite";

export const Route = createFileRoute("/invite")({
	beforeLoad: async ({ context, location }) => {
		const session = await loadAppSession(context.queryClient);
		if (!session) {
			throw redirect({
				to: "/login",
				search: { redirect: location.href },
			});
		}
	},
	validateSearch: inviteSearchSchema,
	component: InviteRoute,
});

function InviteRoute() {
	const { invitationId } = Route.useSearch();
	return <InvitePage invitationId={invitationId} />;
}
