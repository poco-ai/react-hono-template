import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { ArrowLeft, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { orgsQuery } from "@/lib/queries/org";
import { useDocumentTitle } from "@/lib/use-document-title";

function useDarkMode() {
	const [dark, setDark] = useState(
		() =>
			typeof document !== "undefined" &&
			document.documentElement.classList.contains("dark"),
	);
	useEffect(() => {
		const root = document.documentElement;
		const observer = new MutationObserver(() => {
			setDark(root.classList.contains("dark"));
		});
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });
		setDark(root.classList.contains("dark"));
		return () => observer.disconnect();
	}, []);
	return dark;
}

export function ApiDocsPage() {
	const { t } = useTranslation();
	useDocumentTitle(t("apiDocs.title"));
	const dark = useDarkMode();
	const orgs = useQuery(orgsQuery());
	const firstOrgId = orgs.data?.[0]?.id;

	return (
		<div className="bg-background flex h-svh flex-col">
			<header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4">
				<div className="flex min-w-0 items-center gap-3">
					{firstOrgId && (
						<Link
							to="/orgs/$orgId/projects"
							params={{ orgId: firstOrgId }}
							className={buttonVariants({ variant: "ghost", size: "sm" })}
						>
							<ArrowLeft />
							{t("apiDocs.back")}
						</Link>
					)}
					<h1 className="truncate text-sm font-medium">{t("apiDocs.title")}</h1>
				</div>
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground hidden sm:inline">
						{t("apiDocs.authHint")}
					</span>
					{firstOrgId && (
						<Link
							to="/orgs/$orgId/settings/api-keys"
							params={{ orgId: firstOrgId }}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<KeyRound />
							{t("apiDocs.manageKeys")}
						</Link>
					)}
				</div>
			</header>
			<div className="min-h-0 flex-1">
				<ApiReferenceReact
					configuration={{
						url: `${import.meta.env.VITE_API_URL ?? ""}/api/v1/openapi.json`,
						darkMode: dark,
					}}
				/>
			</div>
		</div>
	);
}
