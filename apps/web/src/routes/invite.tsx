import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { orgsQuery } from "@/lib/queries/org";
import { sessionOptions } from "@/lib/session";

const searchSchema = z.object({
	invitationId: z.string().min(1),
});

export const Route = createFileRoute("/invite")({
	beforeLoad: async ({ context, location }) => {
		const session = await context.queryClient.ensureQueryData(sessionOptions);
		if (!session) {
			throw redirect({
				to: "/login",
				search: { redirect: location.href },
			});
		}
	},
	validateSearch: searchSchema,
	component: InvitePage,
});

function InvitePage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { invitationId } = Route.useSearch();
	const started = useRef(false);

	const acceptMutation = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.organization.acceptInvitation({
				invitationId,
			});
			if (error) {
				throw new Error(`[${error.code ?? "error"}] ${error.message ?? ""}`);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orgsQuery().queryKey });
		},
	});

	const { mutate: accept } = acceptMutation;

	useEffect(() => {
		if (!started.current) {
			started.current = true;
			accept();
		}
	}, [accept]);

	const goHome = () => navigate({ to: "/", replace: true });

	return (
		<div className="flex min-h-svh items-center justify-center p-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>
						{acceptMutation.isSuccess
							? t("invite.successTitle")
							: acceptMutation.isError
								? t("invite.errorTitle")
								: t("invite.title")}
					</CardTitle>
					<CardDescription>
						{acceptMutation.isSuccess
							? t("invite.successDescription")
							: acceptMutation.isPending
								? t("invite.accepting")
								: undefined}
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{acceptMutation.isError && (
						<p className="text-destructive text-sm">
							{acceptMutation.error.message}
						</p>
					)}
					{(acceptMutation.isSuccess || acceptMutation.isError) && (
						<Button onClick={goHome}>{t("invite.continue")}</Button>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
