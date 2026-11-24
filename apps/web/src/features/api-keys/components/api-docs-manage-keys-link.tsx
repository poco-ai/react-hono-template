import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";

/** "Manage API keys" link in the API docs header. */
export function ApiDocsManageKeysLink({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	return (
		<Button
			variant="outline"
			size="sm"
			className={buttonVariants({ variant: "outline", size: "sm" })}
			render={<Link to="/orgs/$orgId/settings/api-keys" params={{ orgId }} />}
		>
			<KeyRound />
			{t("apiDocs.manageKeys")}
		</Button>
	);
}
