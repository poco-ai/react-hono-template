import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ApiKeys } from "@/components/auth/api-key/api-keys";
import { useDocumentTitle } from "@/lib/use-document-title";

export function ApiKeysSettingsPage({ orgId }: { orgId: string }) {
	const { t } = useTranslation();
	useDocumentTitle(t("settings.apiKeys"));
	const { page } = useSearch({ from: "/_auth/orgs/$orgId/settings/api-keys" });
	const navigate = useNavigate({ from: "/orgs/$orgId/settings/api-keys" });
	return (
		<ApiKeys
			key={orgId}
			organizationId={orgId}
			page={page ?? 1}
			onPageChange={(next) => {
				void navigate({ search: { page: next } });
			}}
		/>
	);
}
