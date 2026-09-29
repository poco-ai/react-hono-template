import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { CircleAlert, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { apiErrorMessage } from "@/lib/errors";
import { orgsQuery } from "@/lib/queries/org";

export const Route = createFileRoute("/_auth/")({
	component: HomeRedirect,
});

function HomeRedirect() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const orgs = useQuery(orgsQuery());

	useEffect(() => {
		if (!orgs.data) {
			return;
		}
		if (orgs.data.length === 0) {
			navigate({ to: "/onboarding", replace: true });
		} else {
			navigate({
				to: "/orgs/$orgId/projects",
				params: { orgId: orgs.data[0].id },
				replace: true,
			});
		}
	}, [orgs.data, navigate]);

	if (orgs.isError) {
		return (
			<div className="flex min-h-svh flex-col items-center justify-center gap-4">
				<Alert variant="destructive" className="max-w-md">
					<CircleAlert />
					<AlertDescription>{apiErrorMessage(t, orgs.error)}</AlertDescription>
				</Alert>
				<Button variant="outline" onClick={() => orgs.refetch()}>
					{t("common.retry")}
				</Button>
			</div>
		);
	}

	return (
		<div className="flex min-h-svh items-center justify-center">
			<Loader2 className="text-muted-foreground size-6 animate-spin" />
		</div>
	);
}
