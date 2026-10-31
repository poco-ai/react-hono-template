import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AdminUsers } from "@/components/auth/admin/admin-users";
import { useDocumentTitle } from "@/lib/use-document-title";
export function AdminUsersPage() {
	const { t } = useTranslation();
	useDocumentTitle(t("adminUsers.title"));
	const search = useSearch({ from: "/_auth/admin/users" });
	const navigate = useNavigate({ from: "/admin/users" });
	return (
		<AdminUsers
			search={search}
			onSearchChange={(search) => {
				void navigate({ search, replace: true });
			}}
		/>
	);
}
