import type { ListAdminUsersDto } from "@api/dto/admin-user.dto";
import { useQuery } from "@tanstack/react-query";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/empty-state";
import { TablePagination } from "@/components/table-pagination";
import {
	adminUsersQuery,
	useBanAdminUser,
	useUnbanAdminUser,
	useUpdateAdminUserRole,
} from "@/features/admin/data";
import { useSession } from "@/features/auth/data";
import { apiErrorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";

export function AdminUsersPage() {
	const { t } = useTranslation();
	useDocumentTitle(t("adminUsers.title"));
	const { data: session } = useSession();
	const { page = 1, search = "" } = useSearch({ from: "/_auth/admin/users" });
	const navigate = useNavigate({ from: "/admin/users" });

	const [searchInput, setSearchInput] = useState(search);
	const [banTarget, setBanTarget] = useState<{
		id: string;
		name: string;
	} | null>(null);

	useEffect(() => {
		setSearchInput(search);
	}, [search]);

	useEffect(() => {
		const trimmed = searchInput.trim();
		if (trimmed === search) return;
		const timer = setTimeout(() => {
			navigate({
				search: { page: 1, search: trimmed || undefined },
				replace: true,
			});
		}, 300);
		return () => clearTimeout(timer);
	}, [searchInput, search, navigate]);

	const platformRoleLabel: Record<"admin" | "user", string> = {
		admin: t("adminUsers.roles.admin"),
		user: t("adminUsers.roles.user"),
	};

	const usersQuery = useQuery(adminUsersQuery(page, search));

	const roleMutation = useUpdateAdminUserRole({});
	const banMutation = useBanAdminUser({
		onSuccess: () => {
			setBanTarget(null);
		},
	});
	const unbanMutation = useUnbanAdminUser({});

	const clearSearch = () => {
		setSearchInput("");
		if (search) {
			navigate({ search: { page: 1, search: undefined }, replace: true });
		}
	};

	const gotoPage = (next: number) =>
		navigate({ search: (prev) => ({ ...prev, page: next }) });

	const result: ListAdminUsersDto | undefined = usersQuery.data;
	const totalPages = result
		? Math.max(1, Math.ceil(result.total / result.pageSize))
		: 1;
	const listEmpty = !usersQuery.isPending && result?.items.length === 0;
	const mutating =
		roleMutation.isPending || banMutation.isPending || unbanMutation.isPending;
	const mutationError =
		roleMutation.error ?? banMutation.error ?? unbanMutation.error;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("adminUsers.title")}</CardTitle>
				<CardDescription>{t("adminUsers.description")}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="relative max-w-xs">
					<Input
						placeholder={t("adminUsers.searchPlaceholder")}
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								clearSearch();
							}
						}}
						className="pr-8"
					/>
					{searchInput && (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="absolute top-1/2 right-1 size-6 -translate-y-1/2"
							aria-label={t("common.clear")}
							onClick={clearSearch}
						>
							<X />
						</Button>
					)}
				</div>

				{mutationError && (
					<p className="text-sm text-red-500">
						{apiErrorMessage(t, mutationError)}
					</p>
				)}

				<Table>
					{!listEmpty && (
						<TableHeader>
							<TableRow>
								<TableHead>{t("adminUsers.user")}</TableHead>
								<TableHead>{t("common.role")}</TableHead>
								<TableHead>{t("adminUsers.status")}</TableHead>
								<TableHead>{t("adminUsers.created")}</TableHead>
								<TableHead className="text-right">
									{t("adminUsers.actions")}
								</TableHead>
							</TableRow>
						</TableHeader>
					)}
					<TableBody>
						{result?.items.map((user) => {
							const isSelf = user.id === session?.user.id;
							return (
								<TableRow key={user.id}>
									<TableCell>
										<div className="font-medium">{user.name}</div>
										<div className="text-muted-foreground text-xs">
											{user.email}
										</div>
									</TableCell>
									<TableCell>
										<Select
											value={user.role}
											disabled={isSelf || roleMutation.isPending}
											onValueChange={(v) => {
												if (v) {
													roleMutation.mutate({
														id: user.id,
														role: v as "admin" | "user",
													});
												}
											}}
										>
											<SelectTrigger className="w-28">
												<SelectValue>
													{platformRoleLabel[user.role as "admin" | "user"]}
												</SelectValue>
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="admin">
													{t("adminUsers.roles.admin")}
												</SelectItem>
												<SelectItem value="user">
													{t("adminUsers.roles.user")}
												</SelectItem>
											</SelectContent>
										</Select>
									</TableCell>
									<TableCell>
										{user.banned ? (
											<Badge variant="destructive">
												{user.banReason
													? t("adminUsers.bannedWithReason", {
															reason: user.banReason,
														})
													: t("adminUsers.banned")}
											</Badge>
										) : (
											<Badge variant="outline">{t("adminUsers.active")}</Badge>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{formatDate(user.createdAt)}
									</TableCell>
									<TableCell className="text-right">
										{user.banned ? (
											<Button
												variant="outline"
												size="sm"
												disabled={mutating}
												onClick={() => unbanMutation.mutate(user.id)}
											>
												{t("adminUsers.unban")}
											</Button>
										) : (
											<span
												className="inline-block"
												title={
													isSelf ? t("adminUsers.selfBanTooltip") : undefined
												}
											>
												<Button
													variant="destructive"
													size="sm"
													disabled={isSelf || user.role === "admin" || mutating}
													onClick={() =>
														setBanTarget({ id: user.id, name: user.name })
													}
												>
													{t("adminUsers.ban")}
												</Button>
											</span>
										)}
									</TableCell>
								</TableRow>
							);
						})}
						{usersQuery.isPending && (
							<TableRow>
								<TableCell
									colSpan={5}
									className="text-muted-foreground h-16 text-center"
								>
									{t("common.loading")}
								</TableCell>
							</TableRow>
						)}
						{usersQuery.isError && (
							<TableRow>
								<TableCell colSpan={5} className="text-center text-red-500">
									{apiErrorMessage(t, usersQuery.error)}
								</TableCell>
							</TableRow>
						)}
						{listEmpty && (
							<TableRow>
								<TableCell colSpan={5} className="p-0">
									<EmptyState title={t("admin.noResults")} />
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>

				<div className="text-muted-foreground flex items-center justify-between text-sm">
					<span>
						{result ? t("adminUsers.userCount", { total: result.total }) : ""}
					</span>
					<TablePagination
						page={page}
						total={result?.total}
						totalPages={totalPages}
						onPageChange={gotoPage}
						disabled={usersQuery.isPending}
					/>
				</div>
			</CardContent>

			<AlertDialog
				open={banTarget !== null}
				onOpenChange={(open) => !open && setBanTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("adminUsers.banTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("adminUsers.banDescription", { name: banTarget?.name ?? "" })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={banMutation.isPending}
							onClick={(e) => {
								e.preventDefault();
								if (banTarget) {
									banMutation.mutate(banTarget.id);
								}
							}}
						>
							{t("adminUsers.ban")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	);
}
