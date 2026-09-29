import type { AdminStatsDto } from "@api/dto/admin-org.dto";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { useTranslation } from "react-i18next";
import { client, unwrap } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
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
		to?: "/admin/users" | "/admin/orgs";
		ariaLabelKey?: "nav.users" | "nav.orgs";
	}[] = stats
		? [
				{
					key: "users",
					value: stats.users,
					to: "/admin/users",
					ariaLabelKey: "nav.users",
				},
				{
					key: "orgs",
					value: stats.orgs,
					to: "/admin/orgs",
					ariaLabelKey: "nav.orgs",
				},
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
					{apiErrorMessage(t, statsQuery.error)}
				</p>
			)}

			{stats && (
				<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
					{cards.map((card) =>
						card.to && card.ariaLabelKey ? (
							<Link
								key={card.key}
								to={card.to}
								aria-label={t(card.ariaLabelKey)}
								className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
							>
								<Card className="h-full cursor-pointer transition-colors hover:bg-accent/40">
									<CardHeader>
										<CardDescription>
											{t(`adminHome.stats.${card.key}`)}
										</CardDescription>
										<CardTitle className="text-3xl font-semibold tabular-nums">
											{card.value}
										</CardTitle>
									</CardHeader>
								</Card>
							</Link>
						) : (
							<Card key={card.key} className="h-full">
								<CardHeader>
									<CardDescription>
										{t(`adminHome.stats.${card.key}`)}
									</CardDescription>
									<CardTitle className="text-3xl font-semibold tabular-nums">
										{card.value}
									</CardTitle>
								</CardHeader>
							</Card>
						),
					)}
				</div>
			)}
		</div>
	);
}
