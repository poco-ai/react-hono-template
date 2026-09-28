import type { AdminOrgDto, ListAdminOrgsDto } from "@api/dto/admin-org.dto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { client, unwrap } from "@/lib/api";
import { formatDate } from "@/lib/issue-utils";

const PAGE_SIZE = 10;

export function AdminOrgsPage() {
	const { t } = useTranslation();
	const { page = 1, search = "" } = useSearch({ from: "/_auth/admin/orgs" });
	const navigate = useNavigate({ from: "/admin/orgs" });
	const queryClient = useQueryClient();
	const [searchInput, setSearchInput] = useState(search);
	const [freezeTarget, setFreezeTarget] = useState<AdminOrgDto | null>(null);

	const orgsQuery = useQuery({
		queryKey: ["admin-orgs", page, search],
		queryFn: () =>
			unwrap(
				client.api.admin.orgs.$get({
					query: {
						page: String(page),
						pageSize: String(PAGE_SIZE),
						search,
					},
				}),
			),
	});

	const freezeMutation = useMutation({
		mutationFn: (orgId: string) =>
			unwrap(
				client.api.admin.orgs[":orgId"].freeze.$post({ param: { orgId } }),
			),
		onSuccess: () => {
			setFreezeTarget(null);
			queryClient.invalidateQueries({ queryKey: ["admin-orgs"] });
		},
	});
	const unfreezeMutation = useMutation({
		mutationFn: (orgId: string) =>
			unwrap(
				client.api.admin.orgs[":orgId"].freeze.$delete({ param: { orgId } }),
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["admin-orgs"] }),
	});

	const onSearch = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		navigate({ search: { page: 1, search: searchInput.trim() } });
	};

	const gotoPage = (next: number) =>
		navigate({ search: (prev) => ({ ...prev, page: next }) });

	const result: ListAdminOrgsDto | undefined = orgsQuery.data;
	const totalPages = result
		? Math.max(1, Math.ceil(result.total / result.pageSize))
		: 1;

	useEffect(() => {
		if (result && page > totalPages) {
			navigate({ search: (prev) => ({ ...prev, page: totalPages }) });
		}
	}, [result, page, totalPages, navigate]);

	const mutating = freezeMutation.isPending || unfreezeMutation.isPending;
	const mutationError = freezeMutation.error ?? unfreezeMutation.error;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("adminOrgs.title")}</CardTitle>
				<CardDescription>{t("adminOrgs.description")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<form className="flex gap-2" onSubmit={onSearch}>
					<Input
						placeholder={t("adminOrgs.searchPlaceholder")}
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						className="max-w-xs"
					/>
					<Button type="submit" variant="outline">
						{t("adminOrgs.search")}
					</Button>
				</form>

				{mutationError && (
					<p className="text-sm text-red-500">{mutationError.message}</p>
				)}

				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("adminOrgs.org")}</TableHead>
							<TableHead>{t("adminOrgs.plan")}</TableHead>
							<TableHead>{t("adminOrgs.members")}</TableHead>
							<TableHead>{t("adminOrgs.issues")}</TableHead>
							<TableHead>{t("adminOrgs.created")}</TableHead>
							<TableHead>{t("adminOrgs.status")}</TableHead>
							<TableHead className="text-right">
								{t("adminOrgs.actions")}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{result?.items.map((org) => (
							<TableRow key={org.id}>
								<TableCell>
									<div className="font-medium">{org.name}</div>
									<div className="text-muted-foreground text-xs font-mono">
										{org.slug}
									</div>
								</TableCell>
								<TableCell>
									{org.plan === "pro" ? (
										<Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
											{t("billing.planPro")}
										</Badge>
									) : (
										<Badge variant="outline">{t("billing.planFree")}</Badge>
									)}
								</TableCell>
								<TableCell>{org.members}</TableCell>
								<TableCell>{org.issues}</TableCell>
								<TableCell className="text-muted-foreground text-xs">
									{formatDate(org.createdAt)}
								</TableCell>
								<TableCell>
									{org.frozen ? (
										<Badge variant="destructive">{t("adminOrgs.frozen")}</Badge>
									) : (
										<Badge variant="outline">{t("adminOrgs.active")}</Badge>
									)}
								</TableCell>
								<TableCell className="text-right">
									{org.frozen ? (
										<Button
											variant="outline"
											size="sm"
											disabled={mutating}
											onClick={() => unfreezeMutation.mutate(org.id)}
										>
											{t("adminOrgs.unfreeze")}
										</Button>
									) : (
										<Button
											variant="destructive"
											size="sm"
											disabled={mutating}
											onClick={() => setFreezeTarget(org)}
										>
											{t("adminOrgs.freeze")}
										</Button>
									)}
								</TableCell>
							</TableRow>
						))}
						{orgsQuery.isPending && (
							<TableRow>
								<TableCell
									colSpan={7}
									className="text-muted-foreground h-16 text-center"
								>
									{t("common.loading")}
								</TableCell>
							</TableRow>
						)}
						{orgsQuery.isError && (
							<TableRow>
								<TableCell colSpan={7} className="text-center text-red-500">
									{orgsQuery.error.message}
								</TableCell>
							</TableRow>
						)}
						{!orgsQuery.isPending && result?.items.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={7}
									className="text-muted-foreground h-16 text-center"
								>
									{t("adminOrgs.noOrgs")}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>

				<div className="text-muted-foreground flex items-center justify-between text-sm">
					<span>
						{result ? t("adminOrgs.orgCount", { total: result.total }) : ""}
					</span>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={page <= 1 || orgsQuery.isPending}
							onClick={() => gotoPage(page - 1)}
						>
							{t("common.prev")}
						</Button>
						<span>
							{t("issues.pageIndicator", { page, total: totalPages })}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={page >= totalPages || orgsQuery.isPending}
							onClick={() => gotoPage(page + 1)}
						>
							{t("common.next")}
						</Button>
					</div>
				</div>
			</CardContent>

			<AlertDialog
				open={freezeTarget !== null}
				onOpenChange={(open) => !open && setFreezeTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("adminOrgs.freezeTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("adminOrgs.freezeDescription", {
								name: freezeTarget?.name ?? "",
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={freezeMutation.isPending}
							onClick={(e) => {
								e.preventDefault();
								if (freezeTarget) {
									freezeMutation.mutate(freezeTarget.id);
								}
							}}
						>
							{t("adminOrgs.freeze")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	);
}
