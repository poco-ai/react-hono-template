import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * "View API docs" action for the API keys settings header. Contributed
 * through the web registry so api-keys compiles without public-api: the
 * registry resolver returns null and the header simply omits the button.
 */
export function ApiKeysViewDocsLink() {
	const { t } = useTranslation();
	return (
		<Button variant="outline" render={<Link to="/api-docs" />}>
			<ExternalLink />
			{t("apiKeys.viewDocs")}
		</Button>
	);
}
