import type { AdminStatsDto } from "@api/dto/admin-org.dto";
import { useQuery } from "@tanstack/react-query";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { useTranslation } from "react-i18next";
import { client, unwrap } from "@/lib/api";
import { useDocumentTitle } from "@/lib/use-document-title";

export function AdminHomePage() {
	const { t } = useTranslation();
	useDocumentTitle(t("adminHome.title"));

	const statsQuery = useQuery({
		queryKey: ["admin-stats"],
		queryFn: () => unwrap(client.api.admin.stats.$get()),
	});

	const stats: AdminStatsDto | undefined = statsQuery.data;

	const cards: {
		key: "users" | "orgs" | "issues" | "proOrgs";
		value: number;
	}[] = stats
		? [
				{ key: "users", value: stats.users },
				{ key: "orgs", value: stats.orgs },
				{ key: "issues", value: stats.issues },
				{ key: "proOrgs", value: stats.proOrgs },
			]
		: [];

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					{t("adminHome.title")}
				</h1>
				<p className="text-muted-foreground text-sm">
					{t("adminHome.description")}
				</p>
			</div>

			{statsQuery.isPending && (
				<p className="text-muted-foreground py-16 text-center text-sm">
					{t("common.loading")}
				</p>
			)}
			{statsQuery.isError && (
				<p className="py-16 text-center text-sm text-red-500">
					{statsQuery.error.message}
				</p>
			)}

			{stats && (
				<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
					{cards.map((card) => (
						<Card key={card.key}>
							<CardHeader>
								<CardDescription>
									{t(`adminHome.stats.${card.key}`)}
								</CardDescription>
								<CardTitle className="text-3xl font-semibold tabular-nums">
									{card.value}
								</CardTitle>
							</CardHeader>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
